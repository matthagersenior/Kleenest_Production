import fs from 'node:fs';
import path from 'node:path';

const servicesDir='apps/business-mobile/services';
const registryPath=path.join(servicesDir,'actionRegistry.ts');
const registry=fs.readFileSync(registryPath,'utf8');
const actionVerb=/^(run|select|invite|change|remove|transfer|reply|upsert|restore|save|archive|create|update|delete|claim|ensure|send|execute|complete|manage|set|activate|pause|record|configure|request|start|disable|register|apply|advance|reset|attach|pick)/;
const ignored=new Set();
const files=fs.readdirSync(servicesDir).filter(name=>name.endsWith('.ts')&&name!=='actionRegistry.ts');
const allExported=[];
for(const file of files){
 const text=fs.readFileSync(path.join(servicesDir,file),'utf8');
 for(const match of text.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)|export\s+const\s+([A-Za-z0-9_]+)/g)){
  const name=match[1]||match[2];
  allExported.push({file,name});
 }
}
const exported=allExported.filter(({name})=>actionVerb.test(name)&&!ignored.has(name));
const missing=exported.filter(({name})=>!registry.includes(`'${name}'`));
const exportedNames=new Set(allExported.map(item=>item.name));
const registeredActions=[...registry.matchAll(/serviceActions:\[([^\]]*)\]/g)].flatMap(match=>[...match[1].matchAll(/'([^']+)'/g)].map(item=>item[1]));
const staleActions=[...new Set(registeredActions)].filter(name=>!exportedNames.has(name));
const routes=[...new Set([...registry.matchAll(/route:'([^']+)'/g)].map(match=>match[1]))];
const missingRoutes=routes.filter(route=>{const clean=route.replace(/^\//,'').split('?')[0];const file=clean?`apps/business-mobile/app/${clean}.tsx`:'apps/business-mobile/app/index.tsx';return!fs.existsSync(file);});
if(missing.length){
 console.error('Business actions missing UI registry coverage:');
 for(const item of missing)console.error(`- ${item.name} (${item.file})`);
 process.exit(1);
}
if(staleActions.length)throw new Error(`Business action registry references missing service actions: ${staleActions.join(', ')}`);
if(missingRoutes.length)throw new Error(`Business action registry references missing UI routes: ${missingRoutes.join(', ')}`);
for(const token of ["BUSINESS_ACTIONS","serviceActions","updateEnterpriseLocationConfig","manageEnterpriseLocationStaff","pickAndUploadBusinessLocationPhoto","deleteQrBranding"]){
 if(!registry.includes(token))throw new Error(`Business action registry missing ${token}`);
}
console.log(`Business UI action coverage passed: ${exported.length} exported service actions mapped across ${routes.length} verified UI routes.`);
