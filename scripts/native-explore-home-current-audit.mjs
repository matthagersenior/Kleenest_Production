import fs from 'node:fs';

const home=fs.readFileSync('apps/consumer-mobile/app/index.tsx','utf8');
const explore=fs.readFileSync('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx','utf8');
const layout=fs.readFileSync('apps/consumer-mobile/app/_layout.tsx','utf8');
const requiredHome=["import { Redirect } from 'expo-router';",'return <Redirect href="/explore"/>;'];
const requiredExplore=['useWindowDimensions','pendingMapOrigin','handleMapRegionDidChange','Search this area','nearbySummary','exploreCanvas','windowHeight-96'];
let failed=false;
for(const token of requiredHome){if(!home.includes(token)){console.error('FAIL home missing',token);failed=true}else console.log('PASS home',token)}
for(const token of requiredExplore){if(!explore.includes(token)){console.error('FAIL explore missing',token);failed=true}else console.log('PASS explore',token)}
if(!layout.includes("initialRouteName={Platform.OS==='web'?'index':'explore'}")){console.error('FAIL native initial route is not explore');failed=true}else console.log('PASS native initial route explore');
if(failed)process.exit(1);
console.log('Explore-as-home contract satisfied.');
