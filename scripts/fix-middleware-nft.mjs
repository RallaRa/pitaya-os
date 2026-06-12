/** Vercel/Next 16 — middleware.js.nft.json 누락 시 빌드 실패 우회 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nft = path.join(__dirname, '../.next/server/middleware.js.nft.json');

if (!fs.existsSync(nft)) {
  fs.mkdirSync(path.dirname(nft), { recursive: true });
  fs.writeFileSync(nft, JSON.stringify({ version: 1, files: [] }));
  console.log('created', nft);
}
