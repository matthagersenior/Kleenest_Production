import fs from 'node:fs';
const failures=[];const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';const must=(ok,msg)=>{if(!ok)failures.push(msg)};const req=p=>{must(fs.existsSync(p),`missing ${p}`);return read(p)};const all=(label,source,tokens)=>tokens.forEach(token=>must(source.includes(token),`${label}: missing ${token}`));
const tiers=req('apps/business-mobile/domain/businessTiers.ts');const home=req('apps/business-mobile/app/index.tsx');const locations=req('apps/business-mobile/app/enterprise-locations.tsx');const access=req('apps/business-mobile/services/productAccess.ts');
all('Business tier contract',tiers,['enterpriseLocationFeatures','enterpriseNetworks','advancedEngagement','intelligence','reporting','growth||enterprise','enterpriseNetworks:enterprise']);
all('Business product access service',access,['getBusinessProductAccess','get_business_product_access','getBusinessServiceEntitlement','get_business_service_entitlement']);
all('Business home tier exposure',home,['getBusinessTierCapabilities','enterpriseLocationFeatures','enterpriseNetworks','multi-location operations']);
all('Enterprise Location surface',locations,['ENTERPRISE LOCATION','Location portfolio','Location intelligence','QR & engagement','Trust & operations']);
if(failures.length){console.error(`Growth Enterprise Location convergence audit failed with ${failures.length} gap(s):`);failures.forEach(x=>console.error(`- ${x}`));process.exit(1)}console.log('Growth Enterprise Location convergence audit passed.');
