export const MESSENGER_FILE_FOLDERS = [
  '거래명세서',
  '위생점검사진',
  '계약서',
  '기타',
] as const;

export type MessengerFileFolder = (typeof MESSENGER_FILE_FOLDERS)[number];

export interface MessengerFileRecord {
  id: string;
  storeId: string;
  name: string;
  url: string;
  type: string;
  size: number;
  folderId: MessengerFileFolder | string;
  uploadedBy: string;
  uploadedByName?: string;
  roomId?: string;
  messageId?: string;
  storagePath?: string;
  createdAt?: string;
}
