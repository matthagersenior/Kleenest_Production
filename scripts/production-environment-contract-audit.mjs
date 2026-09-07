import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const contract=JSON.parse(read('config/production-environment.json'));
const envExample=read('.env.example');
const appConfig=read('apps/consumer-mobile/app.config.ts');
const androidFamily=read('.github/workflows/android-family.yml');
const playAabWorkflow=read('.github/workflows/eas-android-build.yml');
const mobileCore=read('packages/mobile-core/src/index.ts');

const required=[
  ['Expo project id',contract.expo?.projectId],
  ['Expo slug',contract.expo?.slug],
  ['Android package',contract.expo?.androidPackage],
  ['iOS bundle identifier',contract.expo?.iosBundleIdentifier],
  ['Supabase project ref',contract.supabase?.projectRef],
  ['Supabase URL',contract.supabase?.url],
  ['Supabase publishable key',contract.supabase?.publishableKey],
];
for(const[label,value]of required)if(!value||typeof value!=='string')throw new Error(`${label} missing from production contract.`);

if(!contract.supabase.url.includes(contract.supabase.projectRef))throw new Error('Supabase URL does not match the canonical project ref.');
if(fs.existsSync('apps/consumer-mobile/.env'))throw new Error('apps/consumer-mobile/.env must remain untracked/local-only; use .env.example plus CI/EAS environment injection.');

for(const name of ['EAS_PROJECT_ID','EXPO_PUBLIC_SUPABASE_URL','EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']){
  if(!new RegExp(`^${name}=`, 'm').test(envExample))throw new Error(`.env.example is missing ${name}.`);
}

for(const expected of [contract.expo.projectId,contract.expo.slug,contract.expo.androidPackage,contract.expo.iosBundleIdentifier,contract.supabase.projectRef]){
  if(!appConfig.includes(expected))throw new Error(`Consumer Expo config drift: missing ${expected}.`);
}

for(const name of ['EXPO_PUBLIC_SUPABASE_URL','EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']){
  if(!mobileCore.includes(name))throw new Error(`Mobile core is not wired to ${name}.`);
}

for(const [label,workflow] of [['Android family',androidFamily],['Play AAB',playAabWorkflow]]){
  for(const expected of [contract.expo.projectId,contract.supabase.url,contract.supabase.publishableKey,contract.expo.androidPackage]){
    if(!workflow.includes(expected))throw new Error(`${label} workflow drift: missing ${expected}.`);
  }
}

const expectedRuntime={
  EAS_PROJECT_ID:contract.expo.projectId,
  EXPO_PUBLIC_SUPABASE_URL:contract.supabase.url,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:contract.supabase.publishableKey,
};
for(const[name,expected]of Object.entries(expectedRuntime)){
  const actual=process.env[name];
  if(actual&&actual!==expected)throw new Error(`Runtime ${name} does not match the canonical Consumer production contract.`);
}

const forbidden=[/SUPABASE_SERVICE_ROLE_KEY\s*=/i,/SUPABASE_SECRET_KEY\s*=/i,/sb_secret_[A-Za-z0-9_-]+/i,/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/];
for(const[path,source]of [
  ['config/production-environment.json',JSON.stringify(contract)],
  ['.env.example',envExample],
  ['apps/consumer-mobile/app.config.ts',appConfig],
  ['.github/workflows/android-family.yml',androidFamily],
  ['.github/workflows/eas-android-build.yml',playAabWorkflow],
]){
  for(const pattern of forbidden)if(pattern.test(source))throw new Error(`Secret credential pattern detected in ${path}.`);
}

console.log('Production environment contract verified: tracked config, canonical workflows, Expo/EAS identity, and Supabase public runtime are aligned without a committed .env file.');
