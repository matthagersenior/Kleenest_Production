import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, '..');
const encoded = fs.readFileSync(path.join(scriptsDir, 'app-icon.base64'), 'utf8').trim();
const icon = Buffer.from(encoded, 'base64');
if (!icon.length) throw new Error('Kleenest app icon decode produced an empty file.');

const apps=['consumer-mobile','business-mobile','fleet-mobile','platform-mobile'];
for(const app of apps){
  const targetDir=path.join(root,'apps',app,'assets');
  const target=path.join(targetDir,'app-icon.png');
  fs.mkdirSync(targetDir,{recursive:true});
  fs.writeFileSync(target,icon);
  if(!fs.statSync(target).size)throw new Error(`${app} app icon install produced an empty file.`);
  console.log(`Installed Kleenest app icon at ${path.relative(root,target)}.`);
}
