import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function requireToken(text,token,label){if(!text.includes(token))throw new Error(`${label} missing ${token}.`)}

const required=['.github/workflows/pages.yml','.github/workflows/publish-standalone-installer.yml','apps/consumer-mobile/app.config.ts','apps/consumer-mobile/package.json','apps/consumer-mobile/metro.config.js','apps/consumer-mobile/web/maplibrePreview.tsx','apps/consumer-mobile/web/secureStorePreview.ts','apps/consumer-mobile/web/notificationsPreview.ts'];
for(const file of required)if(!fs.existsSync(file))throw new Error(`Consumer preview/install file missing: ${file}.`);
if(fs.existsSync('.github/workflows/static.yml'))throw new Error('Competing GitHub-generated static Pages workflow must not exist.');

const pages=read(required[0]);
const installer=read(required[1]);
const appConfig=read(required[2]);
const pkg=JSON.parse(read(required[3]));
const metro=read(required[4]);
const mapPreview=read(required[5]);
const securePreview=read(required[6]);
const notificationsPreview=read(required[7]);

for(const token of ['Validate Kleenest Consumer Web Preview','workflow_dispatch','workflow_run','Production CI','conclusion == \'success\'','head_branch == \'main\'','github.event.workflow_run.head_sha','npm run web:export --workspace @kleenest/consumer-mobile','apps/consumer-mobile/dist/index.html','apps/consumer-mobile/dist/404.html','apps/consumer-mobile/dist/.nojekyll','actions/upload-artifact@v4','Kleenest-Consumer-Web-Preview'])requireToken(pages,token,'Pages consumer preview validation workflow');
if(pages.includes('actions/deploy-pages@')||pages.includes('actions/configure-pages@')||pages.includes('actions/upload-pages-artifact@'))throw new Error('Preview validation must not deploy GitHub Pages or it can overwrite the Consumer APK installer.');
if(pages.includes('npm run build\n')||pages.includes('path: dist\n'))throw new Error('Pages validation must not use the competing root Vite consumer shell.');

for(const token of ['Publish Consumer Standalone Installer','Build Consumer Standalone Android APK','Kleenest-Consumer-Standalone-APK','Kleenest-Consumer.apk','mkdir -p apps/consumer-mobile/dist/legal','cp public/legal/*.html apps/consumer-mobile/dist/legal/','apps/consumer-mobile/dist/legal/privacy.html','apps/consumer-mobile/dist/legal/account-deletion.html','actions/configure-pages@v5','actions/upload-pages-artifact@v3','actions/deploy-pages@v4','path: apps/consumer-mobile/dist'])requireToken(installer,token,'Consumer installer deployment workflow');
for(const file of ['public/legal/privacy.html','public/legal/account-deletion.html','public/legal/terms.html','public/legal/community-guidelines.html'])if(!fs.existsSync(file))throw new Error(`Public Play-review legal resource missing: ${file}.`);
if(!installer.includes('github.event.workflow_run.conclusion == \'success\''))throw new Error('Consumer installer deployment must require a successful standalone APK build.');

for(const token of ["output: 'single'","bundler: 'metro'","baseUrl: '/Kleenest_Production'","previewRole: 'non-blocking-web-preview'"])requireToken(appConfig,token,'Expo consumer preview config');
if(pkg.scripts?.['web:export']!=='expo export --platform web')throw new Error('Consumer app must expose canonical Expo web export script.');
for(const dep of ['react-dom','react-native-web'])if(!pkg.dependencies?.[dep])throw new Error(`Consumer web preview dependency missing ${dep}.`);
for(const token of ["platform === 'web'","'@maplibre/maplibre-react-native'","'expo-secure-store'","'expo-notifications'",'maplibrePreview.tsx','secureStorePreview.ts','notificationsPreview.ts','context.resolveRequest(context, moduleName, platform)'])requireToken(metro,token,'Web-only Metro compatibility resolver');
for(const token of ['Native MapLibre remains authoritative in the Android APK','MAP PREVIEW'])requireToken(mapPreview,token,'Map preview adapter');
for(const token of ['window.localStorage','kleenest.preview.secure.'])requireToken(securePreview,token,'SecureStore preview adapter');
for(const token of ['getLastNotificationResponseAsync','clearLastNotificationResponseAsync','addNotificationResponseReceivedListener'])requireToken(notificationsPreview,token,'Notifications preview adapter');
if(/platform\s*!==\s*['"]web['"]/.test(metro))throw new Error('Metro preview aliases must be positively scoped to web only.');

console.log('Consumer web preview validation and installer-owned GitHub Pages deployment audit passed.');
