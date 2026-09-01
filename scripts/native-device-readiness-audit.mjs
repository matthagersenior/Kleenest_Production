import fs from 'node:fs';
const failures=[];
const required=['apps/consumer-mobile/app.config.ts','apps/consumer-mobile/eas.json','apps/consumer-mobile/package.json','apps/consumer-mobile/app/explore.tsx','apps/consumer-mobile/app/qr.tsx','apps/consumer-mobile/app/notifications.tsx','.github/workflows/android-preview.yml'];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing device-readiness file: ${file}`);
if(!failures.length){
 const config=fs.readFileSync(required[0],'utf8');
 const eas=JSON.parse(fs.readFileSync(required[1],'utf8'));
 const pkg=JSON.parse(fs.readFileSync(required[2],'utf8'));
 const explore=fs.readFileSync(required[3],'utf8');
 const qr=fs.readFileSync(required[4],'utf8');
 const notifications=fs.readFileSync(required[5],'utf8');
 const androidPreview=fs.readFileSync(required[6],'utf8');
 const projectId='22a65aa3-c615-4c4f-a34d-084babc28fd7';
 for(const token of ["bundleIdentifier: 'com.kleenest.app'","package: 'com.kleenest.app'",projectId,"ACCESS_COARSE_LOCATION","ACCESS_FINE_LOCATION","CAMERA","expo-camera","expo-notifications","expo-dev-client","defaultChannel: 'kleenest-updates'","userInterfaceStyle: 'automatic'"])if(!config.includes(token))failures.push(`native config missing ${token}`);
 if(eas?.cli?.appVersionSource!=='remote')failures.push('EAS must use remote app versioning.');
 if(eas?.build?.development?.android?.buildType!=='apk'||eas?.build?.development?.developmentClient!==true||eas?.build?.development?.autoIncrement!==true)failures.push('Development Android profile must produce an auto-incremented development-client APK.');
 if(eas?.build?.preview?.android?.buildType!=='apk'||eas?.build?.preview?.distribution!=='internal'||eas?.build?.preview?.autoIncrement!==true)failures.push('Preview Android profile must produce an auto-incremented internally distributed APK.');
 if(eas?.build?.production?.android?.buildType!=='app-bundle'||eas?.build?.production?.autoIncrement!==true)failures.push('Production Android profile must produce an auto-incremented app bundle.');
 for(const profile of ['development','preview','production'])if(eas?.build?.[profile]?.env?.EAS_PROJECT_ID!==projectId)failures.push(`${profile} EAS profile must bind the canonical Expo project id.`);
 for(const dep of ['expo-dev-client','expo-location','expo-camera','expo-notifications','expo-secure-store','@maplibre/maplibre-react-native','react-native-safe-area-context'])if(!pkg.dependencies?.[dep])failures.push(`consumer mobile dependency missing ${dep}`);
 if(pkg.dependencies?.['expo-dev-client']!=='~57.0.16')failures.push('Expo SDK 57 development client must stay on the supported ~57.0.16 line.');
 for(const script of ['start:dev-client','prebuild:android','eas:development:android','eas:preview:android','eas:production:android'])if(!pkg.scripts?.[script])failures.push(`consumer mobile script missing ${script}`);
 if(!explore.includes('requestForegroundPermissionsAsync')||!explore.includes('RefreshControl')||!explore.includes('Live lookup failed. Showing cached bathrooms'))failures.push('Explore must support runtime location permission, refresh, and cached recovery on device.');
 if(!qr.includes('useCameraPermissions')||!qr.includes('CameraView')||!qr.includes("barcodeTypes:['qr']")||!qr.includes('AppState.addEventListener')||!qr.includes('Linking.openSettings'))failures.push('QR must use native camera permission, background-safe lifecycle, settings recovery, and QR-only scanning.');
 if(!notifications.includes('registerNativePush')||!notifications.includes('RefreshControl'))failures.push('Notifications must keep native push registration and inbox refresh behavior.');
 for(const token of ['workflow_run:','workflows: ["Production CI"]','github.event.workflow_run.head_sha','npm run native:typecheck','native-consumer-recovery-audit.mjs','npx expo prebuild --platform android','./gradlew assembleDebug','actions/upload-artifact@v4','app-debug.apk',projectId])if(!androidPreview.includes(token))failures.push(`Android preview workflow missing ${token}`);
 if(!androidPreview.includes("github.event.workflow_run.conclusion == 'success'")||!androidPreview.includes("github.event.workflow_run.head_branch == 'main'"))failures.push('Android preview artifacts must only auto-build from successful main Production CI runs.');
 if(/service_role/i.test(config+explore+qr+notifications+androidPreview))failures.push('Device surfaces and preview builds must never contain service-role credentials.');
}
if(failures.length){console.error('Native device readiness audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native device readiness audit passed.');
