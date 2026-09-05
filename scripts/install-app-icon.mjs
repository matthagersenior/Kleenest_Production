import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, '..');
const encoded = fs.readFileSync(path.join(scriptsDir, 'app-icon.base64'), 'utf8').trim();
const targetDir = path.join(root, 'apps', 'consumer-mobile', 'assets');
const target = path.join(targetDir, 'app-icon.png');
fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(target, Buffer.from(encoded, 'base64'));
if (!fs.statSync(target).size) throw new Error('Consumer app icon decode produced an empty file.');
console.log(`Installed Consumer app icon at ${path.relative(root, target)}.`);
