const REPO = 'RallaRa/pitaya-os';
const DEFAULT_BRANCH = 'main';

async function githubFetch(path: string) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN 미설정');
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GitHub ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

export interface FileTreeNode {
  path: string;
  name: string;
  type: 'file' | 'dir';
  children?: FileTreeNode[];
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.vercel', 'coverage',
]);

export async function fetchRepoTree(): Promise<FileTreeNode[]> {
  const data = await githubFetch(
    `/repos/${REPO}/git/trees/${DEFAULT_BRANCH}?recursive=1`,
  );
  const entries: { path: string; type: string }[] = data.tree || [];
  const paths = entries
    .filter(e => e.type === 'blob' || e.type === 'tree')
    .map(e => ({ path: e.path, type: e.type === 'tree' ? 'dir' as const : 'file' as const }))
    .filter(e => !e.path.split('/').some(p => SKIP_DIRS.has(p)));

  return buildTree(paths);
}

function buildTree(
  items: { path: string; type: 'file' | 'dir' }[],
): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const dirMap = new Map<string, FileTreeNode>();

  const sorted = [...items].sort((a, b) => a.path.localeCompare(b.path));

  for (const item of sorted) {
    const parts = item.path.split('/');
    const name = parts[parts.length - 1];
    const node: FileTreeNode = { path: item.path, name, type: item.type, children: item.type === 'dir' ? [] : undefined };

    if (parts.length === 1) {
      root.push(node);
      if (item.type === 'dir') dirMap.set(item.path, node);
      continue;
    }

    const parentPath = parts.slice(0, -1).join('/');
    let parent = dirMap.get(parentPath);
    if (!parent) {
      parent = ensureDir(root, dirMap, parentPath);
    }
    parent.children = parent.children || [];
    if (!parent.children.some(c => c.path === node.path)) {
      parent.children.push(node);
    }
    if (item.type === 'dir') dirMap.set(item.path, node);
  }

  sortNodes(root);
  return root;
}

function ensureDir(
  root: FileTreeNode[],
  dirMap: Map<string, FileTreeNode>,
  path: string,
): FileTreeNode {
  const existing = dirMap.get(path);
  if (existing) return existing;

  const parts = path.split('/');
  const name = parts[parts.length - 1];
  const node: FileTreeNode = { path, name, type: 'dir', children: [] };
  dirMap.set(path, node);

  if (parts.length === 1) {
    root.push(node);
    return node;
  }

  const parentPath = parts.slice(0, -1).join('/');
  const parent = ensureDir(root, dirMap, parentPath);
  parent.children = parent.children || [];
  if (!parent.children.some(c => c.path === path)) parent.children.push(node);
  return node;
}

function sortNodes(nodes: FileTreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) {
    if (n.children) sortNodes(n.children);
  }
}

export async function fetchFileContent(path: string): Promise<{ content: string; sha?: string }> {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const data = await githubFetch(
    `/repos/${REPO}/contents/${encoded}?ref=${DEFAULT_BRANCH}`,
  );
  if (Array.isArray(data)) throw new Error('경로가 디렉터리입니다');
  const content = data.content
    ? Buffer.from(data.content, 'base64').toString('utf-8')
    : '';
  return { content, sha: data.sha };
}
