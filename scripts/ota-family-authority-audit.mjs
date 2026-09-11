import fs from 'node:fs';
const failures=[];
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const apps=[
 ['consumer','apps/consumer-mobile','consumer-candidate','consumer-production'],
 ['business','apps/business-mobile','business-candidate','business-production'],
 ['fleet','apps/fleet-mobile','fleet-candidate','fleet-production'],
 ['owner','apps/platform-mobile','owner-candidate','owner-production'],
];
for(const [name,dir,candidate,production] of apps){
 const pkg=read(dir+'/package.json'),cfg=read(dir+'/app.config.ts'),eas=read(dir+'/eas.json');
 if(!pkg.includes('"expo-updates"'))failures.push(name+' missing expo-updates');
 for(const token of ['runtimeVersion','updates:{enabled:true'])if(!cfg.replace(/\s/g,'').includes(token.replace(/\s/g,'')))failures.push(name+' config missing '+token);
 for(const token of ['"channel":"'+candidate+'"','"channel":"'+production+'"','EXPO_PUBLIC_OTA_CHANNEL'])if(!eas.replace(/\s/g,'').includes(token.replace(/\s/g,'')))failures.push(name+' eas config missing '+token);
}
const family=read('.github/workflows/ota-family.yml');
for(const token of ['push:','releases/family-ota.txt','--environment production','consumer-production','business-production','fleet-production','owner-production'])if(!family.includes(token))failures.push('family OTA workflow missing '+token);
if(!read('releases/family-ota.txt').includes('four-tier-pricing-ota-authority'))failures.push('family OTA release marker missing current release');
if(failures.length){console.error('OTA family authority audit failed:');for(const f of failures)console.error('- '+f);process.exit(1)}
console.log('OTA family authority audit passed.');
