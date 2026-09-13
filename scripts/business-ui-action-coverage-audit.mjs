import fs from 'node:fs';
import path from 'node:path';

const servicesDir='apps/business-mobile/services';
const registryPath=path.join(servicesDir,'actionRegistry.ts');
const registry=fs.readFileSync(registryPath,'utf8');
const actionVerb=/^(run|select|invite|change|remove|transfer|reply|upsert|restore|save|archive|create|update|delete|claim|ensure|send|execute|complete|manage|set|activate|pause|record|configure|request|start|disable|register|apply|advance|reset|attach|pick)/;
const ignored=new Set(['runDueReportingSchedules']);
const files=fs.readdirSync(servicesDir).filter(name=>name.endsWith('.ts')&&name!=='actionRegistry.ts');
const exported=[];
for(const file of files){
 const text=fs.readFileSync(path.join(servicesDir,file),'utf8');
 for(const match of text.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)|export\s+const\s+([A-Za-z0-9_]+)/g)){
  const name=match[1]||match[2];
  if(actionVerb.test(name)&&!ignored.has(name))exported.push({file,name});
 }
}
const missing=exported.filter(({name})=>!registry.includes(`'${name}'`));
if(missing.length){
 console.error('Business actions missing UI registry coverage:');
 for(const item of missing)console.error(`- ${item.name} (${item.file})`);
 process.exit(1);
}
for(const token of ["/tools","BUSINESS_ACTIONS","serviceActions","updateEnterpriseLocationConfig","manageEnterpriseLocationStaff","pickAndUploadBusinessLocationPhoto","deleteQrBranding"]){
 if(!registry.includes(token))throw new Error(`Business action registry missing ${token}`);
}
console.log(`Business UI action coverage passed: ${exported.length} exported service actions mapped to UI workflows.`);
