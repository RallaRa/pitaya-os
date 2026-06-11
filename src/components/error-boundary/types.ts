export type PitayaErrorType = 'NetworkError' | 'AuthError' | 'NotFoundError' | 'UnknownError';

export interface PitayaErrorLog {
  type: PitayaErrorType;
  message: string;
  stack?: string;
  page: string;
  userId?: string | null;
  createdAt?: string;
}

export interface ClassifiedError {
  type: PitayaErrorType;
  message: string;
  original: Error;
}
