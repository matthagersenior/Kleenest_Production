import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const args=process.argv.slice(2);
const value=(name)=>{const i=args.indexOf(name);return i>=0?args[i+1]||'':''};
const flag=(name)=>args.includes(name);
const baseline=value('--baseline')||process.env.KLEENEST_NATIVE_BASELINE_SHA||'';
const strict=flag('--strict');
const reportOnly=flag('--report-only')||!strict;
const jsonOut=value('--json-out');

function runGit(parts){return execFileSync('git',parts,{encoding:'utf8'}).trim()}
function gitShow(sha,path){return runGit(['show',`${sha}:${path}`])}
function parseJson(text,label){try{return JSON.parse(text)}catch{throw new Error(`Unable to parse ${label}.`)}}
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
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}

if(!baseline){
  console.error('Consumer native baseline SHA is required.');
  process.exit(reportOnly?0:2);
}
const current=runGit(['rev-parse','HEAD']);
try{runGit(['cat-file','-e',`${baseline}^{commit}`])}catch{
  console.error(`Consumer native baseline commit ${baseline} is not available in this checkout.`);
  process.exit(reportOnly?0:2);
}

const changed=runGit(['diff','--name-only',baseline,current]).split(/\r?\n/).filter(Boolean);
const reasons=[];
const directNative=[
  'apps/consumer-mobile/app.config.ts',
  'apps/consumer-mobile/eas.json',
  'apps/consumer-mobile/assets/app-icon.png',
];
for(const path of changed){
  if(directNative.includes(path)||path.startsWith('apps/consumer-mobile/android/')||path.startsWith('apps/consumer-mobile/ios/')||path.startsWith('apps/consumer-mobile/plugins/')){
    reasons.push(`native file changed: ${path}`);
  }
  if(path.startsWith('patches/')) reasons.push(`dependency patch changed: ${path}`);
}

let currentPkg=null,basePkg=null,nativeNames=[];
if(changed.includes('apps/consumer-mobile/package.json')||changed.includes('package-lock.json')){
  currentPkg=parseJson(fs.readFileSync('apps/consumer-mobile/package.json','utf8'),'current Consumer package.json');
  basePkg=parseJson(gitShow(baseline,'apps/consumer-mobile/package.json'),'baseline Consumer package.json');
  nativeNames=[...new Set([...nativeDependencyNames(currentPkg),...nativeDependencyNames(basePkg)])].sort();
}
if(changed.includes('apps/consumer-mobile/package.json')){
  const before=nativeDependencySpecs(basePkg,nativeNames),after=nativeDependencySpecs(currentPkg,nativeNames);
  if(!same(before,after))reasons.push('Consumer native dependency specifications changed');
}
if(changed.includes('package-lock.json')){
  const beforeLock=parseJson(gitShow(baseline,'package-lock.json'),'baseline package-lock.json');
  const afterLock=parseJson(fs.readFileSync('package-lock.json','utf8'),'current package-lock.json');
  const before=lockedVersions(beforeLock,nativeNames),after=lockedVersions(afterLock,nativeNames);
  if(!same(before,after))reasons.push('resolved Consumer native dependency versions changed');
}

const consumerRuntimeChanged=changed.some(path=>
  path.startsWith('apps/consumer-mobile/app/')||
  path.startsWith('apps/consumer-mobile/features/')||
  path.startsWith('apps/consumer-mobile/components/')||
  path.startsWith('apps/consumer-mobile/services/')||
  path.startsWith('packages/mobile-core/')
);
const nativeDrift=reasons.length>0;
const result={
  baselineSha:baseline,
  currentSha:current,
  changedFiles:changed,
  consumerRuntimeChanged,
  nativeDrift,
  otaCompatible:!nativeDrift,
  reasons,
  status:nativeDrift?'NATIVE_REBUILD_REQUIRED':'OTA_SAFE',
  checkedAt:new Date().toISOString(),
};
const rendered=JSON.stringify(result,null,2)+'\n';
if(jsonOut){fs.mkdirSync(new URL('.',`file://${process.cwd()}/${jsonOut}`).pathname,{recursive:true});fs.writeFileSync(jsonOut,rendered)}
console.log(rendered.trim());
if(nativeDrift){
  const message=`Consumer native drift detected against APK baseline ${baseline.slice(0,12)}: ${reasons.join('; ')}. Build a new Consumer APK/AAB before publishing OTA to this runtime.`;
  if(reportOnly){
    console.log(`::warning title=Consumer native rebuild required::${message}`);
    process.exit(0);
  }
  console.error(message);
  process.exit(2);
}
if(reportOnly)console.log(`Consumer release drift check: OTA safe against APK baseline ${baseline.slice(0,12)}.`);
