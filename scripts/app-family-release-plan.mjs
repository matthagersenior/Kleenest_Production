import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args=process.argv.slice(2);
const value=(name)=>{const i=args.indexOf(name);return i>=0?args[i+1]||'':''};
const flag=(name)=>args.includes(name);
const baseline=value('--baseline')||process.env.KLEENEST_FAMILY_NATIVE_BASELINE_SHA||'';
const strictOta=flag('--strict-ota');
const jsonOut=value('--json-out');

const apps=[
  {name:'consumer',dir:'apps/consumer-mobile',runtimePrefixes:['apps/consumer-mobile/app/','apps/consumer-mobile/features/','apps/consumer-mobile/components/','apps/consumer-mobile/services/']},
  {name:'business',dir:'apps/business-mobile',runtimePrefixes:['apps/business-mobile/app/','apps/business-mobile/components/','apps/business-mobile/services/']},
  {name:'fleet',dir:'apps/fleet-mobile',runtimePrefixes:['apps/fleet-mobile/app/','apps/fleet-mobile/components/','apps/fleet-mobile/services/']},
  {name:'owner',dir:'apps/platform-mobile',runtimePrefixes:['apps/platform-mobile/app/','apps/platform-mobile/components/','apps/platform-mobile/services/']},
];

function runGit(parts){return execFileSync('git',parts,{encoding:'utf8'}).trim()}
function gitShow(sha,file){return runGit(['show',`${sha}:${file}`])}
function parseJson(text,label){try{return JSON.parse(text)}catch{throw new Error(`Unable to parse ${label}.`)}}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function nativeDependencyNames(pkg){
  const deps={...(pkg.dependencies||{}),...(pkg.devDependencies||{}),...(pkg.optionalDependencies||{})};
  return Object.keys(deps).filter(name=>
    name==='expo'||name.startsWith('expo-')||name==='react'||name==='react-native'||
    name.startsWith('react-native-')||name.startsWith('@react-native/')||
    name==='@maplibre/maplibre-react-native'
  ).sort();
}
function nativeDependencySpecs(pkg,names){
  const all={...(pkg.dependencies||{}),...(pkg.devDependencies||{}),...(pkg.optionalDependencies||{})};
  return Object.fromEntries(names.map(name=>[name,all[name]??null]));
}
function lockedVersions(lock,names){
  const packages=lock.packages||{};
  return Object.fromEntries(names.map(name=>[name,packages[`node_modules/${name}`]?.version??null]));
}

if(!baseline){console.error('Family native baseline SHA is required.');process.exit(2)}
const current=runGit(['rev-parse','HEAD']);
try{runGit(['cat-file','-e',`${baseline}^{commit}`])}catch{
  console.error(`Family native baseline commit ${baseline} is not available in this checkout.`);
  process.exit(2);
}
const changed=runGit(['diff','--name-only',baseline,current]).split(/\r?\n/).filter(Boolean);
const currentLock=parseJson(fs.readFileSync('package-lock.json','utf8'),'current package-lock.json');
const baseLock=parseJson(gitShow(baseline,'package-lock.json'),'baseline package-lock.json');

const results=apps.map(app=>{
  const reasons=[];
  const packagePath=`${app.dir}/package.json`;
  const directNative=[
    `${app.dir}/app.config.ts`,
    `${app.dir}/eas.json`,
    `${app.dir}/assets/app-icon.png`,
  ];
  for(const file of changed){
    if(directNative.includes(file)||file.startsWith(`${app.dir}/android/`)||file.startsWith(`${app.dir}/ios/`)||file.startsWith(`${app.dir}/plugins/`)){
      reasons.push(`native file changed: ${file}`);
    }
    if(file.startsWith('patches/'))reasons.push(`dependency patch changed: ${file}`);
  }

  const currentPkg=parseJson(fs.readFileSync(packagePath,'utf8'),`current ${packagePath}`);
  const basePkg=parseJson(gitShow(baseline,packagePath),`baseline ${packagePath}`);
  const nativeNames=[...new Set([...nativeDependencyNames(currentPkg),...nativeDependencyNames(basePkg)])].sort();
  if(changed.includes(packagePath)){
    const before=nativeDependencySpecs(basePkg,nativeNames),after=nativeDependencySpecs(currentPkg,nativeNames);
    if(!same(before,after))reasons.push('native dependency specifications changed');
  }
  if(changed.includes('package-lock.json')){
    const before=lockedVersions(baseLock,nativeNames),after=lockedVersions(currentLock,nativeNames);
    if(!same(before,after))reasons.push('resolved native dependency versions changed');
  }

  const runtimeChanged=changed.some(file=>app.runtimePrefixes.some(prefix=>file.startsWith(prefix)))||
    changed.some(file=>file.startsWith('packages/mobile-core/'));
  return {
    app:app.name,
    runtimeChanged,
    nativeDrift:reasons.length>0,
    otaCompatible:reasons.length===0,
    reasons:[...new Set(reasons)],
  };
});

const nativeApps=results.filter(row=>row.nativeDrift).map(row=>row.app);
const runtimeApps=results.filter(row=>row.runtimeChanged).map(row=>row.app);
const result={
  baselineSha:baseline,
  currentSha:current,
  changedFiles:changed,
  apps:results,
  runtimeApps,
  nativeApps,
  nativeRebuildRequired:nativeApps.length>0,
  otaCompatible:nativeApps.length===0,
  recommendedAction:nativeApps.length?'BUILD_FAMILY_NATIVE':'PUBLISH_FAMILY_OTA',
  checkedAt:new Date().toISOString(),
};
const rendered=JSON.stringify(result,null,2)+'\n';
if(jsonOut){fs.mkdirSync(path.dirname(jsonOut),{recursive:true});fs.writeFileSync(jsonOut,rendered)}
console.log(rendered.trim());
if(result.nativeRebuildRequired){
  const message=`Family OTA blocked: native drift detected in ${nativeApps.join(', ')} against synchronized APK baseline ${baseline.slice(0,12)}. Build the four-app native family from one SHA before publishing this family OTA.`;
  if(strictOta){console.error(message);process.exit(2)}
  console.log(`::warning title=Native family rebuild required::${message}`);
}else{
  console.log(`Family release plan: OTA safe for all four apps against synchronized APK baseline ${baseline.slice(0,12)}.`);
}
