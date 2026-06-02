import { google, drive_v3 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { Readable } from 'stream';
import { adminDb } from './firebase/admin';

const PROD_URL = 'https://pitaya-osv1.vercel.app';
const CALLBACK_PATH = '/api/auth/google-drive/callback';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FULL_SCOPE = 'https://www.googleapis.com/auth/drive';

export function getDriveOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL || PROD_URL}${CALLBACK_PATH}`,
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
  const base = process.env.NEXT_PUBLIC_APP_URL || PROD_URL;
  return `${base}/api/drive/view?id=${encodeURIComponent(fileId)}&store=${encodeURIComponent(storeId)}`;
}

export async function resolveDriveClient(storeId: string): Promise<drive_v3.Drive> {
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  const storeToken = doc.data()?.googleDriveRefreshToken as string | undefined;
  if (storeToken && process.env.GOOGLE_CLIENT_SECRET) {
    const oauth2 = getDriveOAuth2Client();
    oauth2.setCredentials({ refresh_token: storeToken });
    return google.drive({ version: 'v3', auth: oauth2 });
  }

  const envRefresh = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (envRefresh && process.env.GOOGLE_CLIENT_SECRET) {
    const oauth2 = getDriveOAuth2Client();
    oauth2.setCredentials({ refresh_token: envRefresh });
    return google.drive({ version: 'v3', auth: oauth2 });
  }

  const keyStr = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (keyStr) {
    const key = JSON.parse(keyStr);
    const auth = new GoogleAuth({
      credentials: key,
      scopes: [DRIVE_FILE_SCOPE, DRIVE_FULL_SCOPE],
    });
    const client = await auth.getClient();
    return google.drive({ version: 'v3', auth: client as any });
  }

  throw new Error(
    'Google Drive가 연결되지 않았습니다. 매장 설정에서 Drive를 연결하거나 GOOGLE_DRIVE_REFRESH_TOKEN을 설정해 주세요.',
  );
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
    if (process.env.GOOGLE_DRIVE_REFRESH_TOKEN && process.env.GOOGLE_CLIENT_SECRET) return true;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return true;
    const doc = await adminDb.collection('store_settings').doc(storeId).get();
    return !!doc.data()?.googleDriveRefreshToken;
  } catch {
    return false;
  }
}
