import { google, drive_v3 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { Readable } from 'stream';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase/admin';

const PROD_URL = 'https://pitaya-osv1.vercel.app';
const CALLBACK_PATH = '/api/auth/google-drive/callback';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FULL_SCOPE = 'https://www.googleapis.com/auth/drive';

function getAppBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv && fromEnv.startsWith('https://') && !fromEnv.includes('localhost')) {
    return fromEnv.replace(/\/$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, '')}`;
  }
  if (process.env.VERCEL_URL && !process.env.VERCEL_URL.includes('localhost')) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
  }
  return PROD_URL;
}

export function getDriveOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET가 필요합니다');
  }
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${getAppBaseUrl()}${CALLBACK_PATH}`,
  );
}

export function getDriveAuthUrl(storeId: string) {
  const oauth2 = getDriveOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: [DRIVE_FILE_SCOPE],
    state: storeId,
    prompt: 'consent',
  });
}

export function stripBase64Data(content: string): string {
  return content.includes(',') ? content.split(',')[1] : content;
}

export function drivePhotoProxyUrl(fileId: string, storeId: string): string {
  const base = getAppBaseUrl();
  return `${base}/api/drive/view?id=${encodeURIComponent(fileId)}&store=${encodeURIComponent(storeId)}`;
}

async function getServiceAccountDriveClient(): Promise<drive_v3.Drive | null> {
  const keyStr = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!keyStr) return null;
  const key = JSON.parse(keyStr);
  const auth = new GoogleAuth({
    credentials: key,
    scopes: [DRIVE_FILE_SCOPE, DRIVE_FULL_SCOPE],
  });
  const client = await auth.getClient();
  return google.drive({ version: 'v3', auth: client as any });
}

async function getOAuthDriveClient(refreshToken: string): Promise<drive_v3.Drive> {
  if (!process.env.GOOGLE_CLIENT_SECRET?.trim()) {
    throw new Error('GOOGLE_CLIENT_SECRET가 설정되지 않았습니다');
  }
  const oauth2 = getDriveOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}

async function verifyDriveClient(drive: drive_v3.Drive): Promise<string | undefined> {
  const about = await drive.about.get({ fields: 'user/emailAddress' });
  return about.data.user?.emailAddress || undefined;
}

export async function ensureDriveConnection(storeId: string): Promise<boolean> {
  const ref = adminDb.collection('store_settings').doc(storeId);
  const doc = await ref.get();
  const existingToken = doc.data()?.googleDriveRefreshToken as string | undefined;
  const envToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();

  const tokenToUse = existingToken || envToken;
  if (!tokenToUse || !process.env.GOOGLE_CLIENT_SECRET?.trim()) {
    return false;
  }

  try {
    const drive = await getOAuthDriveClient(tokenToUse);
    const email = await verifyDriveClient(drive);
    if (!existingToken || (envToken && existingToken !== envToken)) {
      await ref.set({
        googleDriveRefreshToken: tokenToUse,
        googleDriveEmail: email || null,
        googleDriveConnectedAt: FieldValue.serverTimestamp(),
        googleDriveLinkSource: existingToken ? 'store' : 'env',
      }, { merge: true });
    }
    return true;
  } catch {
    return false;
  }
}

export async function resolveDriveClient(storeId: string): Promise<drive_v3.Drive> {
  await ensureDriveConnection(storeId);

  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  const storeToken = doc.data()?.googleDriveRefreshToken as string | undefined;
  if (storeToken) {
    return getOAuthDriveClient(storeToken);
  }

  const envRefresh = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (envRefresh) {
    return getOAuthDriveClient(envRefresh);
  }

  const saDrive = await getServiceAccountDriveClient();
  if (saDrive) return saDrive;

  throw new Error(
    'Google Drive가 연결되지 않았습니다. 매장 설정에서 Drive를 연결하거나 GOOGLE_DRIVE_REFRESH_TOKEN을 설정해 주세요.',
  );
}

export async function testDriveConnection(storeId: string): Promise<boolean> {
  try {
    const drive = await resolveDriveClient(storeId);
    await verifyDriveClient(drive);
    return true;
  } catch {
    return false;
  }
}

async function getOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId?: string,
): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const q = [
    `name='${escaped}'`,
    `mimeType='application/vnd.google-apps.folder'`,
    'trashed=false',
    parentId ? `'${parentId}' in parents` : `'root' in parents`,
  ].join(' and ');

  const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  if (res.data.files?.length) return res.data.files[0].id as string;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: 'id',
  });
  return created.data.id as string;
}

async function resolveRootFolder(drive: drive_v3.Drive): Promise<string | undefined> {
  const envRoot = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  if (envRoot) return envRoot;
  return undefined;
}

async function uploadBufferToDrive(
  drive: drive_v3.Drive,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  folderIds: string[],
): Promise<string> {
  let parentId = await resolveRootFolder(drive);
  for (const folderName of folderIds) {
    parentId = await getOrCreateFolder(drive, folderName, parentId);
  }
  if (!parentId) throw new Error('Drive 업로드 폴더를 만들 수 없습니다');

  const stream = Readable.from(buffer);
  const uploaded = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentId],
    },
    media: { mimeType, body: stream },
    fields: 'id',
  });

  const fileId = uploaded.data.id!;
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return fileId;
}

export async function uploadPublicOrderPhotoToDrive(
  storeId: string,
  sessionId: string,
  fileContent: string,
  fileName: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const drive = await resolveDriveClient(storeId);
  const base64 = stripBase64Data(fileContent);
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error('10MB 이하만 업로드 가능합니다');
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const safeName = `line_${Date.now()}.${ext}`;

  const fileId = await uploadBufferToDrive(
    drive,
    buffer,
    safeName,
    mimeType,
    ['Pitaya_공개주문', storeId, sessionId],
  );

  return drivePhotoProxyUrl(fileId, storeId);
}

export async function uploadFileToDrive(
  storeId: string,
  base64Content: string,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const drive = await resolveDriveClient(storeId);
  const base64 = stripBase64Data(base64Content);
  const buffer = Buffer.from(base64, 'base64');

  const fileId = await uploadBufferToDrive(
    drive,
    buffer,
    fileName,
    mimeType,
    ['Pitaya_매입서류', new Date().toISOString().slice(0, 7)],
  );

  return `https://drive.google.com/file/d/${fileId}/view`;
}

export async function streamDriveFile(
  storeId: string,
  fileId: string,
): Promise<{ stream: NodeJS.ReadableStream; mimeType: string }> {
  const drive = await resolveDriveClient(storeId);
  const meta = await drive.files.get({ fileId, fields: 'mimeType' });
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' },
  );
  return {
    stream: res.data as NodeJS.ReadableStream,
    mimeType: meta.data.mimeType || 'image/jpeg',
  };
}

export async function isDriveConnected(storeId: string): Promise<boolean> {
  try {
    if (await ensureDriveConnection(storeId)) return true;
    return await testDriveConnection(storeId);
  } catch {
    return false;
  }
}
