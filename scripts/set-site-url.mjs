#!/usr/bin/env node
// 一次性替换所有 SEO 文件里的站点地址。
// 用法: node scripts/set-site-url.mjs https://your-domain.com
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLD_URL = 'https://devcppweb.vercel.app';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const files = [
  'index.html',
  'README.md',
  'DEPLOY.md',
  'public/robots.txt',
  'public/sitemap.xml',
  'public/llms.txt',
  'scripts/make-og-image.py',
];

const input = process.argv[2];
if (!input) {
  console.error('用法: node scripts/set-site-url.mjs https://your-domain.com');
  process.exit(1);
}

const url = input.replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+$/.test(url)) {
  console.error('地址需要是 https://example.com 这样的完整源（origin），不能带路径。');
  process.exit(1);
}

let touched = 0;
for (const rel of files) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = before.split(OLD_URL).join(url);
  if (after === before) continue;
  fs.writeFileSync(file, after);
  touched += 1;
  console.log('updated', rel);
}

console.log(`\n完成：${touched} 个文件指向 ${url}`);
console.log('别忘了在 GitHub 仓库设置里把 Website 也改成这个地址。');
