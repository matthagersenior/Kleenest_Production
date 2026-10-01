import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditFeatureLifecycle } from './feature-lifecycle-lib.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const parity=JSON.parse(fs.readFileSync(path.join(root,'config/product-parity.json'),'utf8'));
const registry=JSON.parse(fs.readFileSync(path.join(root,'config/feature-lifecycle.json'),'utf8'));
const failures=auditFeatureLifecycle({
  parity,
  registry,
  exists:relative=>fs.existsSync(path.join(root,relative)),
});
if(failures.length){
  console.error(`Feature lifecycle audit failed with ${failures.length} issue${failures.length===1?'':'s'}:`);
  failures.forEach(f=>console.error(`- ${f}`));
  process.exit(1);
}
const counts={};
for(const feature of registry.features||[])counts[feature.status]=(counts[feature.status]||0)+1;
console.log(`Feature lifecycle audit passed for ${registry.features.length} registered capabilities.`);
console.log(`Status counts: ${Object.entries(counts).map(([k,v])=>`${k}=${v}`).join(', ')}`);
console.log('A feature is not complete until status=live and all vertical-slice evidence is present.');
