import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function requireToken(text,token,label){if(!text.includes(token))throw new Error(`${label} missing ${token}.`)}

const required=['.github/workflows/pages.yml','.github/workflows/publish-standalone-installer.yml','.github/workflows/android-family.yml','apps/consumer-mobile/app.config.ts','apps/consumer-mobile/package.json','apps/consumer-mobile/metro.config.js','apps/consumer-mobile/web/maplibrePreview.tsx','apps/consumer-mobile/web/secureStorePreview.ts','apps/consumer-mobile/web/notificationsPreview.ts','scripts/prepare-consumer-web-pwa.mjs','public/manifest.webmanifest','public/app-icon-512.svg','public/sw.js'];
for(const file of required)if(!fs.existsSync(file))throw new Error(`Consumer preview/install file missing: ${file}.`);
if(fs.existsSync('.github/workflows/static.yml'))throw new Error('Competing GitHub-generated static Pages workflow must not exist.');
if(fs.existsSync('.github/workflows/android-preview.yml'))throw new Error('Duplicate Consumer-only Android build workflow must be removed; family Android workflow owns verified APKs.');

const pages=read('.github/workflows/pages.yml');
const installer=read('.github/workflows/publish-standalone-installer.yml');
const familyAndroid=read('.github/workflows/android-family.yml');
const appConfig=read('apps/consumer-mobile/app.config.ts');
const pkg=JSON.parse(read('apps/consumer-mobile/package.json'));
const metro=read('apps/consumer-mobile/metro.config.js');
const mapPreview=read('apps/consumer-mobile/web/maplibrePreview.tsx');
const securePreview=read('apps/consumer-mobile/web/secureStorePreview.ts');
const notificationsPreview=read('apps/consumer-mobile/web/notificationsPreview.ts');
const pwaPrep=read('scripts/prepare-consumer-web-pwa.mjs');
const manifest=JSON.parse(read('public/manifest.webmanifest'));
const serviceWorker=read('public/sw.js');

for(const token of ['Validate Kleenest Consumer Web Preview','kleenest-consumer-preview-validation-${{ github.event_name }}','workflow_dispatch','pull_request','workflow_run','Production CI','conclusion == \'success\'','head_branch == \'main\'','github.event.workflow_run.head_sha','npm run web:export --workspace @kleenest/consumer-mobile','node scripts/prepare-consumer-web-pwa.mjs','apps/consumer-mobile/dist/index.html','apps/consumer-mobile/dist/404.html','apps/consumer-mobile/dist/.nojekyll','actions/upload-artifact@v4','Kleenest-Consumer-Web-Preview'])requireToken(pages,token,'Pages consumer preview validation workflow');
if(pages.includes('actions/deploy-pages@')||pages.includes('actions/configure-pages@')||pages.includes('actions/upload-pages-artifact@'))throw new Error('Preview validation must not deploy GitHub Pages or it can overwrite the Consumer APK installer.');
if(pages.includes('npm run build\n')||pages.includes('path: dist\n'))throw new Error('Pages validation must not use the competing root Vite consumer shell.');

for(const token of ['Publish Consumer Standalone Installer','Build Kleenest App Family Android APKs','Kleenest-Consumer-Standalone-APK','Kleenest-Consumer.apk','node scripts/prepare-consumer-web-pwa.mjs','manifest.webmanifest','sw.js','app-icon.png','app-icon-512.svg','mkdir -p apps/consumer-mobile/dist/legal','cp public/legal/*.html apps/consumer-mobile/dist/legal/','mkdir -p apps/consumer-mobile/dist/developer','cp apps/developer-portal/static/index.html apps/consumer-mobile/dist/developer/index.html','test -s apps/consumer-mobile/dist/developer/index.html','Kleenest Developer Portal','Browser token','for legal in privacy account-deletion terms community-guidelines','test -s "apps/consumer-mobile/dist/legal/${legal}.html"','actions/configure-pages@v5','actions/upload-pages-artifact@v3','actions/deploy-pages@v4','path: apps/consumer-mobile/dist'])requireToken(installer,token,'Consumer + Developer Portal Pages deployment workflow');
for(const token of ['Build Kleenest App Family Android APKs','Kleenest-Consumer-Standalone-APK','Kleenest-Consumer.apk','Android 16 startup smoke'])requireToken(familyAndroid,token,'Family Android release workflow');
for(const file of ['public/legal/privacy.html','public/legal/account-deletion.html','public/legal/terms.html','public/legal/community-guidelines.html'])if(!fs.existsSync(file))throw new Error(`Public Play-review legal resource missing: ${file}.`);
if(!fs.existsSync('apps/developer-portal/static/index.html'))throw new Error('Developer Portal static Pages artifact is missing.');
const developerPortal=read('apps/developer-portal/static/index.html');
for(const token of ['Kleenest Developer Portal','Create developer account','Claim invite','Browser token','Content-Security-Policy'])requireToken(developerPortal,token,'Developer Portal Pages artifact');
if(!installer.includes("github.event.workflow_run.head_branch == 'main'"))throw new Error('Consumer installer deployment must be scoped to main family builds.');
if(!installer.includes("github.event.workflow_run.conclusion == 'success'"))throw new Error('Consumer installer deployment must require a successful verified app-family build before publishing.');
if(installer.includes("github.event.workflow_run.conclusion != 'cancelled'"))throw new Error('Consumer installer deployment must not publish from failed or skipped family builds.');

for(const token of ["output: 'single'","bundler: 'metro'","baseUrl: '/Kleenest_Production'","previewRole: 'non-blocking-web-preview'"])requireToken(appConfig,token,'Expo consumer preview config');
if(pkg.scripts?.['web:export']!=='expo export --platform web')throw new Error('Consumer app must expose canonical Expo web export script.');
for(const dep of ['react-dom','react-native-web','maplibre-gl'])if(!pkg.dependencies?.[dep])throw new Error(`Consumer web dependency missing ${dep}.`);
for(const token of ["platform === 'web'","'@maplibre/maplibre-react-native'","'expo-secure-store'","'expo-notifications'",'maplibrePreview.tsx','secureStorePreview.ts','notificationsPreview.ts','context.resolveRequest(context, moduleName, platform)'])requireToken(metro,token,'Web-only Metro compatibility resolver');
for(const token of ["from 'maplibre-gl'",'new maplibregl.Map','fitBounds','new maplibregl.Marker','supportsWebGL','fallbackTiles','mapLoadTimer','MapLibre unavailable'])requireToken(mapPreview,token,'Interactive web MapLibre adapter');
if(mapPreview.includes('MAP PREVIEW')||mapPreview.includes('Native MapLibre remains authoritative'))throw new Error('Consumer Web must render a real interactive map rather than a preview placeholder.');
for(const token of ['window.localStorage','kleenest.preview.secure.'])requireToken(securePreview,token,'SecureStore preview adapter');
for(const token of ['getLastNotificationResponseAsync','clearLastNotificationResponseAsync','addNotificationResponseReceivedListener'])requireToken(notificationsPreview,token,'Notifications preview adapter');
if(/platform\s*!==\s*['"]web['"]/.test(metro))throw new Error('Metro preview aliases must be positively scoped to web only.');

for(const token of ['manifest.webmanifest','navigator.serviceWorker.register','apps/consumer-mobile/dist/index.html','apps/consumer-mobile/assets/app-icon.png'])requireToken(pwaPrep,token,'Consumer PWA preparation script');
if(manifest.display!=='standalone'||manifest.start_url!=='/Kleenest_Production/'||manifest.scope!=='/Kleenest_Production/')throw new Error('Consumer PWA manifest must remain standalone and scoped to the GitHub Pages app path.');
if(!Array.isArray(manifest.icons)||manifest.icons.length<2)throw new Error('Consumer PWA manifest must provide installable app icons.');
if(!manifest.icons.some(icon=>icon.src==='/Kleenest_Production/app-icon.png'&&icon.sizes==='192x192')||!manifest.icons.some(icon=>icon.src==='/Kleenest_Production/app-icon-512.svg'&&icon.sizes==='512x512'))throw new Error('Consumer PWA manifest must publish truthful 192px and 512px install icon metadata.');
for(const token of ['kleenest-shell','showNotification','notificationclick','isVersionedAsset','networkFirst'])requireToken(serviceWorker,token,'Consumer web service worker');
if(/cached\|\|fetch\(event\.request\)/.test(serviceWorker))throw new Error('Consumer service worker must not keep versioned JS/CSS on a cache-first path across deployments.');

console.log('Consumer web app validation, PWA installability, legal resources, and family-owned Pages deployment audit passed.');
