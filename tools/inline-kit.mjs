// 用法：node tools/inline-kit.mjs <資料夾>/index.html
// 把 lib/vr-kit.js 的內容貼進 HTML 裡 VR-KIT:START 與 VR-KIT:END 兩行之間，讓每款遊戲維持單一檔案。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!target) { console.error('請給 HTML 路徑'); process.exit(1); }
const kit = readFileSync(join(root, 'lib/vr-kit.js'), 'utf8');
const html = readFileSync(target, 'utf8');
const re = /(\/\* VR-KIT:START[^\n]*\*\/)[\s\S]*?(\/\* VR-KIT:END \*\/)/;
if (!re.test(html)) { console.error('找不到 VR-KIT:START / VR-KIT:END 標記'); process.exit(1); }
writeFileSync(target, html.replace(re, (_, a, b) => `${a}\n${kit}\n${b}`));
console.log('已貼上 vr-kit.js →', target);
