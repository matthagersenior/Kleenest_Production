import fs from 'node:fs';

const contract=JSON.parse(fs.readFileSync('config/product-parity.json','utf8'));
const failures=[];
const exists=path=>fs.existsSync(path);
const read=path=>exists(path)?fs.readFileSync(path,'utf8'):'';

for(const [role,app] of Object.entries(contract.apps)){
  const root=app.workspace;
  if(!exists(root)){
    failures.push(`${role}: missing native workspace ${root}`);
    continue;
  }
  for(const file of ['package.json','app.config.ts','eas.json','tsconfig.json','app/_layout.tsx','app/index.tsx']){
    if(!exists(`${root}/${file}`))failures.push(`${role}: missing ${file}`);
  }
  const config=read(`${root}/app.config.ts`);
  if(!config.includes(app.androidPackage))failures.push(`${role}: Android package must be ${app.androidPackage}`);
  const eas=exists(`${root}/eas.json`)?JSON.parse(read(`${root}/eas.json`)):{};
  if(eas?.build?.candidate?.android?.buildType!=='apk')failures.push(`${role}: candidate profile must build APK`);
  if(eas?.build?.production?.android?.buildType!=='app-bundle')failures.push(`${role}: production profile must build AAB`);
  const capabilityText=[read(`${root}/app/index.tsx`),read(`${root}/services/product.ts`),read(`${root}/PARITY.md`)].join('\n').toLowerCase();
  for(const capability of app.requiredCapabilities){
    if(!capabilityText.includes(capability.toLowerCase()))failures.push(`${role}: native parity evidence missing ${capability}`);
  }
}

if(failures.length){
  console.error('Product parity audit failed:');
  failures.forEach(f=>console.error(`- ${f}`));
  process.exit(1);
}
console.log(`Product parity audit passed for ${Object.keys(contract.apps).length} app products.`);
