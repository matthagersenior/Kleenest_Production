import fs from 'node:fs';

const failures=[];
const exists=(path)=>fs.existsSync(path);
const read=(path)=>exists(path)?fs.readFileSync(path,'utf8'):'';
const json=(path)=>JSON.parse(read(path));
const must=(condition,message)=>{if(!condition)failures.push(message)};

const parity=json('config/product-parity.json');
const appExpectations={
 consumer:{workspace:'apps/consumer-mobile',package:'com.kleenest.app'},
 business:{workspace:'apps/business-mobile',package:'com.kleenest.business'},
 fleet:{workspace:'apps/fleet-mobile',package:'com.kleenest.fleet'},
 owner:{workspace:'apps/platform-mobile',package:'com.kleenest.owner'},
};
for(const [key,expected] of Object.entries(appExpectations)){
  const entry=parity.apps[key];
  must(Boolean(entry),`product parity missing ${key}`);
  must(entry?.workspace===expected.workspace,`${key}: workspace drift`);
  must(entry?.androidPackage===expected.package,`${key}: Android package drift`);
  const root=expected.workspace;
  for(const path of ['package.json','app.config.ts','eas.json','app/_layout.tsx','app/index.tsx'])must(exists(`${root}/${path}`),`${key}: missing ${path}`);
}

const businessPkg=json('apps/business-mobile/package.json');
for(const dep of ['expo-location','expo-task-manager','expo-image-picker','expo-updates','expo-linking','react-native-qrcode-svg','react-native-svg'])must(Boolean(businessPkg.dependencies?.[dep]),`Business runtime missing ${dep}`);
const businessConfig=read('apps/business-mobile/app.config.ts');
for(const token of ['ACCESS_BACKGROUND_LOCATION','blockedPermissions','isAndroidBackgroundLocationEnabled','app-icon.png','business-production'])must(businessConfig.includes(token),`Business config missing ${token}`);

const fleetPkg=json('apps/fleet-mobile/package.json');
for(const dep of ['@maplibre/maplibre-react-native','expo-location','expo-task-manager','expo-updates','expo-linking','react-native-reanimated','react-native-worklets'])must(Boolean(fleetPkg.dependencies?.[dep]),`Fleet runtime missing ${dep}`);
const fleetConfig=read('apps/fleet-mobile/app.config.ts');
for(const token of ['ACCESS_BACKGROUND_LOCATION','blockedPermissions','isAndroidBackgroundLocationEnabled','@maplibre/maplibre-react-native','app-icon.png','fleet-production'])must(fleetConfig.includes(token),`Fleet config missing ${token}`);

const ownerConfig=read('apps/platform-mobile/app.config.ts');
for(const token of ["name:'KleenestOS'","package:'com.kleenest.owner'","slug:'kleenest-owner'","owner-production","app-icon.png"])must(ownerConfig.replace(/\s+/g,'').includes(token.replace(/\s+/g,'')),`KleenestOS identity/config missing ${token}`);

const rootAudit=read('package.json');
for(const token of ['product-parity-audit.mjs','operator-ux-parity-audit.mjs','monorepo-closure-audit.mjs','play-store-matrix-audit.mjs'])must(rootAudit.includes(token),`root audit chain missing ${token}`);

if(failures.length){console.error('Monorepo closure audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Monorepo closure audit passed for Consumer, Business, Fleet and KleenestOS runtime identity and native prerequisites.');
