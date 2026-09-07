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

// query-string@7 loads decode-uri-component through CommonJS. The patched
// decode-uri-component release is ESM, so normalize its default export without
// changing query-string's runtime API.
const queryStringEntry=path.join(root,'node_modules','query-string','index.js');
if(fs.existsSync(queryStringEntry)){
  const vulnerableImport="const decodeComponent = require('decode-uri-component');";
  const compatibleImport=[
    "const decodeComponentModule = require('decode-uri-component');",
    'const decodeComponent = decodeComponentModule.default || decodeComponentModule;',
  ].join('\n');
  const source=fs.readFileSync(queryStringEntry,'utf8');
  if(source.includes(vulnerableImport)){
    fs.writeFileSync(queryStringEntry,source.replace(vulnerableImport,compatibleImport));
    console.log('Installed query-string compatibility shim for patched URI decoding.');
  }else if(!source.includes(compatibleImport)){
    throw new Error('query-string URI decoder import changed; refusing an unverified dependency patch.');
  }
}
