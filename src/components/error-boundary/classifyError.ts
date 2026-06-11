import type { ClassifiedError, PitayaErrorType } from './types';

const NETWORK_PATTERNS = [
  'network',
  'fetch failed',
  'failed to fetch',
  'networkerror',
  'net::',
  'timeout',
  'econnrefused',
  'enotfound',
  'offline',
];

const AUTH_PATTERNS = [
  'unauthorized',
  'unauthenticated',
  'forbidden',
  'auth',
  'permission denied',
  '401',
  '403',
];

const NOT_FOUND_PATTERNS = [
  'not found',
  '404',
  'does not exist',
  'no such',
];

function matchesPattern(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some(p => lower.includes(p));
}

function inferType(error: Error): PitayaErrorType {
  const text = `${error.name} ${error.message}`;

  if (error.name === 'NetworkError' || matchesPattern(text, NETWORK_PATTERNS)) {
    return 'NetworkError';
  }
  if (error.name === 'AuthError' || matchesPattern(text, AUTH_PATTERNS)) {
    return 'AuthError';
  }
  if (error.name === 'NotFoundError' || matchesPattern(text, NOT_FOUND_PATTERNS)) {
    return 'NotFoundError';
  }
  return 'UnknownError';
}

export function classifyError(error: Error): ClassifiedError {
  return {
    type: inferType(error),
    message: error.message || '알 수 없는 오류가 발생했습니다',
    original: error,
  };
}

export class PitayaNetworkError extends Error {
  constructor(message = '네트워크 연결에 문제가 있습니다') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class PitayaAuthError extends Error {
  constructor(message = '인증이 필요하거나 권한이 없습니다') {
    super(message);
    this.name = 'AuthError';
  }
}

export class PitayaNotFoundError extends Error {
  constructor(message = '요청한 리소스를 찾을 수 없습니다') {
    super(message);
    this.name = 'NotFoundError';
  }
}
