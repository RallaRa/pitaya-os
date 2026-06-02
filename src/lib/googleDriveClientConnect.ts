const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode: 'popup';
            callback: (response: { code?: string; error?: string }) => void;
          }) => { requestCode: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('브라우저에서만 Drive 연결이 가능합니다'));
  }
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Google 스크립트 로드 실패')));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google 스크립트 로드 실패'));
    document.head.appendChild(script);
  });
}

export async function connectGoogleDriveWithPopup(
  storeId: string,
  clientId: string,
  exchange: (code: string) => Promise<void>,
): Promise<void> {
  await loadGoogleIdentityScript();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const client = window.google!.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      ux_mode: 'popup',
      callback: async (response) => {
        if (response.error) {
          finish(() => reject(new Error(response.error)));
          return;
        }
        if (!response.code) {
          finish(() => reject(new Error('인증 코드를 받지 못했습니다')));
          return;
        }
        try {
          await exchange(response.code);
          finish(() => resolve());
        } catch (e: unknown) {
          finish(() => reject(e instanceof Error ? e : new Error(String(e))));
        }
      },
    });

    try {
      client.requestCode({ prompt: 'consent' });
    } catch (e: unknown) {
      finish(() => reject(e instanceof Error ? e : new Error(String(e))));
    }
  });
}
