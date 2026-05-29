import { google } from 'googleapis';
import { Readable } from 'stream';
import { adminDb } from './firebase/admin';

const PROD_URL = 'https://pitaya-osv1.vercel.app';
const CALLBACK_PATH = '/api/auth/google-drive/callback';

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
    scope: ['https://www.googleapis.com/auth/drive.file'],
    state: storeId,
    prompt: 'consent',
  });
}

async function getDriveClient(storeId: string) {
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  const refreshToken = doc.data()?.googleDriveRefreshToken as string | undefined;
  if (!refreshToken) throw new Error('Google Drive가 연결되지 않았습니다. 설정에서 연결해 주세요.');

  const oauth2 = getDriveOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}

async function getOrCreateFolder(drive: any, name: string, parentId?: string): Promise<string> {
  const q = [
    `name='${name}'`,
    `mimeType='application/vnd.google-apps.folder'`,
    `trashed=false`,
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

export async function uploadFileToDrive(
  storeId: string,
  base64Content: string,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const drive = await getDriveClient(storeId);

  // Pitaya_매입서류 / YYYY-MM / 파일
  const rootId = await getOrCreateFolder(drive, 'Pitaya_매입서류');
  const monthStr = new Date().toISOString().slice(0, 7);
  const monthId = await getOrCreateFolder(drive, monthStr, rootId);

  const buffer = Buffer.from(base64Content, 'base64');
  const stream = Readable.from(buffer);

  const uploaded = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [monthId],
    },
    media: { mimeType, body: stream },
    fields: 'id, webViewLink',
  });

  // 링크 보유자는 누구나 열람 가능 (보관 목적)
  await drive.permissions.create({
    fileId: uploaded.data.id!,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return uploaded.data.webViewLink || `https://drive.google.com/file/d/${uploaded.data.id}/view`;
}

export async function isDriveConnected(storeId: string): Promise<boolean> {
  try {
    const doc = await adminDb.collection('store_settings').doc(storeId).get();
    return !!doc.data()?.googleDriveRefreshToken;
  } catch {
    return false;
  }
}
