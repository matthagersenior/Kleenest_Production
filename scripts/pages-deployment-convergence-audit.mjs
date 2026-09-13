import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function requireToken(text,token,label){if(!text.includes(token))throw new Error(`${label} missing ${token}.`)}

const required=['apps/consumer-mobile/components/MarketingSite.tsx','apps/consumer-mobile/components/MarketingSitePro.tsx','apps/consumer-mobile/app/for-you.tsx','apps/consumer-mobile/app/for-business.tsx','apps/consumer-mobile/app/trust.tsx','.github/workflows/install-center-smoke.yml','scripts/install-center-browser-smoke.spec.ts','scripts/consumer-release-drift-audit.mjs','apps/consumer-mobile/app/install.tsx','apps/platform-mobile/metro.config.js','apps/platform-mobile/web/secureStorePreview.ts','apps/business-mobile/app.config.ts','apps/business-mobile/package.json','apps/business-mobile/metro.config.js','apps/business-mobile/web/secureStorePreview.ts','apps/business-mobile/web/notificationsPreview.ts','apps/business-mobile/web/taskManagerPreview.ts','apps/business-mobile/services/actionRegistry.ts','scripts/business-ui-action-coverage-audit.mjs','.github/workflows/pages.yml','.github/workflows/publish-standalone-installer.yml','.github/workflows/android-family.yml','apps/consumer-mobile/app.config.ts','apps/consumer-mobile/package.json','apps/consumer-mobile/metro.config.js','apps/consumer-mobile/web/maplibrePreview.tsx','apps/consumer-mobile/web/secureStorePreview.ts','apps/consumer-mobile/web/notificationsPreview.ts','scripts/prepare-consumer-web-pwa.mjs','public/manifest.webmanifest','public/app-icon-512.svg','public/sw.js'];
for(const file of required)if(!fs.existsSync(file))throw new Error(`Consumer preview/install file missing: ${file}.`);
if(fs.existsSync('.github/workflows/static.yml'))throw new Error('Competing GitHub-generated static Pages workflow must not exist.');
if(fs.existsSync('.github/workflows/android-preview.yml'))throw new Error('Duplicate Consumer-only Android build workflow must be removed; family Android workflow owns verified APKs.');

const pages=read('.github/workflows/pages.yml');
const portalPages=read('.github/workflows/platform-developer-portal-pages.yml');
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
const businessConfig=read('apps/business-mobile/app.config.ts');
const businessPkg=JSON.parse(read('apps/business-mobile/package.json'));
const businessMetro=read('apps/business-mobile/metro.config.js');
const businessActionRegistry=read('apps/business-mobile/services/actionRegistry.ts');
const businessActionAudit=read('scripts/business-ui-action-coverage-audit.mjs');

for(const token of ['Validate Kleenest Consumer Web Preview','npm run web:export --workspace @kleenest/business-mobile','apps/business-mobile/dist/index.html','npm run web:export --workspace @kleenest/owner-mobile','apps/platform-mobile/dist/index.html','kleenest-consumer-preview-validation-${{ github.event_name }}','workflow_dispatch','pull_request','workflow_run','Production CI','conclusion == \'success\'','head_branch == \'main\'','github.event.workflow_run.head_sha','npm run web:export --workspace @kleenest/consumer-mobile','node scripts/prepare-consumer-web-pwa.mjs','apps/consumer-mobile/dist/index.html','apps/consumer-mobile/dist/404.html','apps/consumer-mobile/dist/.nojekyll','actions/upload-artifact@v4','Kleenest-Consumer-Web-Preview'])requireToken(pages,token,'Pages consumer preview validation workflow');
if(pages.includes('actions/deploy-pages@')||pages.includes('actions/configure-pages@')||pages.includes('actions/upload-pages-artifact@'))throw new Error('Preview validation must not deploy GitHub Pages or it can overwrite the Consumer APK installer.');
if(portalPages.includes('actions/deploy-pages@')||portalPages.includes('actions/configure-pages@')||portalPages.includes('actions/upload-pages-artifact@'))throw new Error('Developer Portal validation must not independently deploy GitHub Pages; the Consumer installer is the single canonical Pages publisher.');
for(const token of ['Kleenest-Developer-Portal-Preview','actions/upload-artifact@v4','_site/developer/index.html'])requireToken(portalPages,token,'Developer Portal validation workflow');
if(pages.includes('npm run build\n')||pages.includes('path: dist\n'))throw new Error('Pages validation must not use the competing root Vite consumer shell.');
for(const token of ['group: kleenest-consumer-preview-validation-${{ github.event_name }}',"cancel-in-progress: ${{ github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success' }}"])requireToken(pages,token,'Consumer web validation concurrency policy');

for(const token of ['Publish Consumer Standalone Installer','Validate Kleenest Consumer Web Preview','Resolve freshest verified Consumer APK','consumer-release-drift-audit.mjs','Kleenest-release-state.json','npm run web:export --workspace @kleenest/business-mobile','apps/business-mobile/dist','apps/consumer-mobile/dist/business','cp -R apps/business-mobile/dist/. apps/consumer-mobile/dist/business/','business_routes=','test -s apps/consumer-mobile/dist/business/tools/index.html','test -s apps/consumer-mobile/dist/business/analytics/index.html','test -s apps/consumer-mobile/dist/business/enterprise-location-admin/index.html','npm run web:export --workspace @kleenest/owner-mobile','apps/platform-mobile/dist','apps/consumer-mobile/dist/owner','KleenestOS Web','test -s apps/consumer-mobile/dist/owner/index.html','Kleenest-Consumer-Standalone-APK','Kleenest-Consumer.apk','node scripts/prepare-consumer-web-pwa.mjs','manifest.webmanifest','sw.js','app-icon.png','app-icon-512.svg','mkdir -p apps/consumer-mobile/dist/legal','cp public/legal/*.html apps/consumer-mobile/dist/legal/','cp -R apps/developer-portal/static/. apps/consumer-mobile/dist/developer/','cp -R apps/platform-mobile/dist/. apps/consumer-mobile/dist/owner/','owner_routes=','test -s apps/consumer-mobile/dist/developer/index.html','test -s apps/consumer-mobile/dist/developer/manifest.webmanifest','test -s apps/consumer-mobile/dist/owner/control/index.html','Kleenest Developer Portal','Browser token','for legal in privacy account-deletion terms community-guidelines','test -s "apps/consumer-mobile/dist/legal/${legal}.html"','actions/configure-pages@v5','actions/upload-pages-artifact@v3','actions/deploy-pages@v4','path: apps/consumer-mobile/dist'])requireToken(installer,token,'Consumer + Developer Portal Pages deployment workflow');
for(const token of ['Build Kleenest App Family Android APKs','Kleenest-Consumer-Standalone-APK','Kleenest-Consumer.apk','Android 16 startup smoke'])requireToken(familyAndroid,token,'Family Android release workflow');
for(const token of ["group: kleenest-app-family-android-${{ github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main' && 'main'", 'cancel-in-progress: true'])requireToken(familyAndroid,token,'Android family concurrency policy');
for(const file of ['public/legal/privacy.html','public/legal/account-deletion.html','public/legal/terms.html','public/legal/community-guidelines.html'])if(!fs.existsSync(file))throw new Error(`Public Play-review legal resource missing: ${file}.`);
if(!fs.existsSync('apps/developer-portal/static/index.html'))throw new Error('Developer Portal static Pages artifact is missing.');
const developerPortal=read('apps/developer-portal/static/index.html');
for(const token of ['Kleenest Developer Portal','Create developer account','Claim invite','Browser token','Content-Security-Policy'])requireToken(developerPortal,token,'Developer Portal Pages artifact');
if(!installer.includes("github.event.workflow_run.head_branch == 'main'"))throw new Error('Consumer installer deployment must be scoped to main web validation builds.');
if(!installer.includes("github.event.workflow_run.conclusion == 'success'"))throw new Error('Consumer installer deployment must require successful web validation before publishing.');
if(installer.includes('workflows: ["Build Kleenest App Family Android APKs"]'))throw new Error('Consumer web publishing must not wait on the Android family matrix.');
if(installer.includes("github.event.workflow_run.conclusion != 'cancelled'"))throw new Error('Consumer installer deployment must not publish from failed or skipped validation runs.');
for(const token of ['group: kleenest-consumer-preview-pages',"cancel-in-progress: ${{ github.event.workflow_run.conclusion == 'success' }}"])requireToken(installer,token,'Consumer Pages publisher concurrency policy');

for(const token of ["output: 'single'","bundler: 'metro'","baseUrl: '/Kleenest_Production'","previewRole: 'non-blocking-web-preview'"])requireToken(appConfig,token,'Expo consumer preview config');
const consumerInstall=read('apps/consumer-mobile/app/install.tsx');
for(const token of ['Install Kleenest','beforeinstallprompt','Kleenest-Consumer.apk','INSTALL WEB APP','DOWNLOAD ANDROID APK','iPhone','iPad','Add to Home Screen','Open as Web App','deviceKind','isIOS','isAndroid','Kleenest-release-state.json','INSTALL HEALTH','SHARE INSTALL LINK','OPEN KLEENEST','CHECK INSTALLATION','browserKind','serviceWorkerReady'])requireToken(consumerInstall,token,'Consumer Installation Center');
const consumerHome=read('apps/consumer-mobile/app/index.tsx');
for(const token of ['GET KLEENEST','Install on this device','/install','MarketingHome','webAppLaunch'])requireToken(consumerHome,token,'Consumer Home + public marketing split');
const marketingSite=read('apps/consumer-mobile/components/MarketingSitePro.tsx');
for(const token of ['Clean bathrooms shouldn’t be a gamble.','For You','For Business','TRUST + FRESHNESS','INSTALL KLEENEST','KLEENEST ANYWHERE'])requireToken(marketingSite,token,'Public Kleenest marketing site');
const installSmoke=read('.github/workflows/install-center-smoke.yml');
for(const token of ['Verify Kleenest Installation Center','Publish Consumer Standalone Installer','@playwright/test','EXPECTED_SHA','install-center-browser-smoke.spec.ts'])requireToken(installSmoke,token,'Installation Center post-deploy browser smoke workflow');
for(const token of ['group: kleenest-install-center-smoke',"cancel-in-progress: ${{ github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success' }}"])requireToken(installSmoke,token,'Installation Center smoke concurrency policy');
const installSpec=read('scripts/install-center-browser-smoke.spec.ts');
for(const token of ['Install Kleenest','INSTALL WEB APP','SHARE INSTALL LINK','Kleenest-release-state.json','Kleenest-Consumer.apk.sha256','manifest.webmanifest','EXPECTED_SHA'])requireToken(installSpec,token,'Installation Center browser journey');
for(const token of ['public_routes="install for-you for-business trust"','cp apps/consumer-mobile/dist/index.html "apps/consumer-mobile/dist/$route/index.html"'])requireToken(installer,token,'Public marketing route materialization');
if(!manifest.shortcuts?.some(shortcut=>shortcut.url==='/Kleenest_Production/install'))throw new Error('Consumer PWA manifest must expose the Installation Center as an app shortcut.');
for(const token of ["output:'single'","bundler:'metro'","baseUrl:'/Kleenest_Production/business'","Kleenest Business Web"])requireToken(businessConfig,token,'Kleenest Business web config');
if(businessPkg.scripts?.['web:export']!=='expo export --platform web')throw new Error('Kleenest Business must expose canonical Expo web export script.');
for(const dep of ['react-dom','react-native-web'])if(!businessPkg.dependencies?.[dep])throw new Error(`Kleenest Business web dependency missing ${dep}.`);
for(const token of ["platform==='web'","'expo-secure-store'",'secureStorePreview.ts',"'expo-notifications'",'notificationsPreview.ts',"'expo-task-manager'",'taskManagerPreview.ts'])requireToken(businessMetro,token,'Kleenest Business web compatibility resolver');
for(const token of ['BUSINESS_ACTIONS','updateEnterpriseLocationConfig','manageEnterpriseLocationStaff','pickAndUploadBusinessLocationPhoto','deleteQrBranding'])requireToken(businessActionRegistry,token,'Business UI action registry');
for(const token of ['Business actions missing UI registry coverage','servicesDir','actionVerb'])requireToken(businessActionAudit,token,'Business UI action coverage audit');
const ownerConfig=read('apps/platform-mobile/app.config.ts');
const ownerPkg=JSON.parse(read('apps/platform-mobile/package.json'));
const ownerMetro=read('apps/platform-mobile/metro.config.js');
for(const token of ["output:'single'","bundler:'metro'","baseUrl:'/Kleenest_Production/owner'","KleenestOS Web"])requireToken(ownerConfig,token,'KleenestOS web config');
if(ownerPkg.scripts?.['web:export']!=='expo export --platform web')throw new Error('KleenestOS must expose canonical Expo web export script.');
for(const dep of ['react-dom','react-native-web'])if(!ownerPkg.dependencies?.[dep])throw new Error(`KleenestOS web dependency missing ${dep}.`);
for(const token of ["platform==='web'","'expo-secure-store'",'secureStorePreview.ts'])requireToken(ownerMetro,token,'KleenestOS web compatibility resolver');
if(pkg.scripts?.['web:export']!=='expo export --platform web')throw new Error('Consumer app must expose canonical Expo web export script.');
for(const dep of ['react-dom','react-native-web','maplibre-gl'])if(!pkg.dependencies?.[dep])throw new Error(`Consumer web dependency missing ${dep}.`);
for(const token of ["platform === 'web'","'@maplibre/maplibre-react-native'","'expo-secure-store'","'expo-notifications'",'maplibrePreview.tsx','secureStorePreview.ts','notificationsPreview.ts','context.resolveRequest(context, moduleName, platform)'])requireToken(metro,token,'Web-only Metro compatibility resolver');
for(const token of ["from 'maplibre-gl'",'new maplibregl.Map','fitBounds','new maplibregl.Marker','supportsWebGL','fallbackTiles','mapLoadTimer','MapLibre unavailable'])requireToken(mapPreview,token,'Interactive web MapLibre adapter');
if(mapPreview.includes('MAP PREVIEW')||mapPreview.includes('Native MapLibre remains authoritative'))throw new Error('Consumer Web must render a real interactive map rather than a preview placeholder.');
for(const token of ['window.localStorage','kleenest.preview.secure.'])requireToken(securePreview,token,'SecureStore preview adapter');
for(const token of ['getLastNotificationResponseAsync','clearLastNotificationResponseAsync','addNotificationResponseReceivedListener'])requireToken(notificationsPreview,token,'Notifications preview adapter');
if(/platform\s*!==\s*['"]web['"]/.test(metro))throw new Error('Metro preview aliases must be positively scoped to web only.');

for(const token of ['manifest.webmanifest','navigator.serviceWorker.register','apps/consumer-mobile/dist/index.html','apps/consumer-mobile/assets/app-icon.png'])requireToken(pwaPrep,token,'Consumer PWA preparation script');
if(manifest.display!=='standalone'||manifest.start_url!=='/Kleenest_Production/?app=1'||manifest.scope!=='/Kleenest_Production/')throw new Error('Consumer PWA manifest must remain standalone, launch into the app Home experience, and stay scoped to the GitHub Pages app path.');
if(!Array.isArray(manifest.icons)||manifest.icons.length<2)throw new Error('Consumer PWA manifest must provide installable app icons.');
if(!manifest.icons.some(icon=>icon.src==='/Kleenest_Production/app-icon.png'&&icon.sizes==='192x192')||!manifest.icons.some(icon=>icon.src==='/Kleenest_Production/app-icon-512.svg'&&icon.sizes==='512x512'))throw new Error('Consumer PWA manifest must publish truthful 192px and 512px install icon metadata.');
for(const token of ['kleenest-shell','showNotification','notificationclick','isVersionedAsset','networkFirst'])requireToken(serviceWorker,token,'Consumer web service worker');
if(/cached\|\|fetch\(event\.request\)/.test(serviceWorker))throw new Error('Consumer service worker must not keep versioned JS/CSS on a cache-first path across deployments.');

const otaConsumer=read('.github/workflows/ota-consumer.yml');
for(const token of ['workflow_run','Production CI','consumer-release-drift-audit.mjs','strict','consumer-production','github.event.workflow_run.head_sha'])requireToken(otaConsumer,token,'Consumer OTA release workflow');
for(const token of ['group: kleenest-consumer-production-ota',"cancel-in-progress: ${{ github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success' }}"])requireToken(otaConsumer,token,'Consumer OTA concurrency policy');
const productionCi=read('.github/workflows/ci.yml');
for(const token of ['Consumer native drift visibility','consumer-release-drift-audit.mjs','report-only'])requireToken(productionCi,token,'Production CI release drift visibility');
console.log('Consumer web app validation, independent PWA deployment, OTA gating, native drift visibility, legal resources, and APK preservation audit passed.');
