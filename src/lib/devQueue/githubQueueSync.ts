const REPO = 'RallaRa/pitaya-os';
const DEFAULT_BRANCH = 'main';

async function githubFetch(path: string, init?: RequestInit) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN 미설정');

  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  return res;
}

export async function commitQueueFile(path: string, content: string, message: string) {
  const getRes = await githubFetch(`/repos/${REPO}/contents/${path}?ref=${DEFAULT_BRANCH}`);
  let sha: string | undefined;
  if (getRes.ok) {
    const existing = await getRes.json();
    sha = existing.sha;
  }

  const putRes = await githubFetch(`/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch: DEFAULT_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    throw new Error(`GitHub commit 실패: ${err}`);
  }
  return putRes.json();
}

export function queueFileUrl(path: string) {
  return `https://github.com/${REPO}/blob/${DEFAULT_BRANCH}/${path}`;
}
