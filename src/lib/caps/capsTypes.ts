/** ADT 캡스(뷰가드) 카메라 — 슈퍼유저 전용 */

export type CapsStreamType = 'hls' | 'mjpeg' | 'snapshot';

export interface CapsCamera {
  id: string;
  name: string;
  storeId?: string;
  storeName?: string;
  streamType: CapsStreamType;
  /** 서버 전용 — 클라이언트에 노출하지 않음 */
  streamUrl: string;
  enabled: boolean;
}

export interface CapsCameraPublic {
  id: string;
  name: string;
  storeId?: string;
  storeName?: string;
  streamType: CapsStreamType;
  enabled: boolean;
}

export interface CapsConfig {
  cameras: CapsCamera[];
  capsliveUrl?: string;
  updatedAt?: string;
  updatedBy?: string;
}
