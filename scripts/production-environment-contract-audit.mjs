import fs from 'node:fs';

const contract = JSON.parse(fs.readFileSync('config/production-environment.json', 'utf8'));
const expoEnvPath = 'apps/consumer-mobile/.env';
const expoEnv = fs.existsSync(expoEnvPath) ? fs.readFileSync(expoEnvPath, 'utf8') : null;
const appConfig = fs.readFileSync('apps/consumer-mobile/app.config.ts', 'utf8');
const androidWorkflow = fs.readFileSync('.github/workflows/eas-android-build.yml', 'utf8');
const mobileCore = fs.readFileSync('packages/mobile-core/src/index.ts', 'utf8');

const required = [
  ['Expo project id', contract.expo.projectId],
  ['Supabase project ref', contract.supabase.projectRef],
  ['Supabase URL', contract.supabase.url],
  ['Supabase publishable key', contract.supabase.publishableKey],
];

for (const [label, value] of required) {
  if (!value || typeof value !== 'string') throw new Error(`${label} missing from production contract.`);
}

if (!contract.supabase.url.includes(contract.supabase.projectRef)) {
  throw new Error('Supabase URL does not match the canonical project ref.');
}

if (expoEnv !== null) {
  for (const [name, expected] of [
    ['EAS_PROJECT_ID', contract.expo.projectId],
    ['EXPO_PUBLIC_SUPABASE_URL', contract.supabase.url],
    ['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', contract.supabase.publishableKey],
  ]) {
    const line = `${name}=${expected}`;
    if (!expoEnv.includes(line)) throw new Error(`apps/consumer-mobile/.env drift: expected ${name}.`);
  }
} else {
  console.log('apps/consumer-mobile/.env is intentionally untracked; validating the canonical contract, Expo config, workflow injection, and mobile-core environment wiring instead.');
}

for (const expected of [
  contract.expo.projectId,
  contract.expo.slug,
  contract.expo.androidPackage,
  contract.expo.iosBundleIdentifier,
  contract.supabase.projectRef,
]) {
  if (!appConfig.includes(expected)) throw new Error(`Expo config drift: missing ${expected}.`);
}

if (!mobileCore.includes('EXPO_PUBLIC_SUPABASE_URL') || !mobileCore.includes('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) {
  throw new Error('Mobile core is not wired to Expo public Supabase variables.');
}

for (const expected of [contract.expo.projectId, contract.supabase.url, contract.supabase.publishableKey]) {
  if (!androidWorkflow.includes(expected)) throw new Error(`EAS Android workflow drift: missing ${expected}.`);
}

const forbidden = [/SUPABASE_SERVICE_ROLE_KEY\s*=/i, /SUPABASE_SECRET_KEY\s*=/i, /sb_secret_[A-Za-z0-9_-]+/i];
const scannedSources = [['config/production-environment.json', JSON.stringify(contract)]];
if (expoEnv !== null) scannedSources.push([expoEnvPath, expoEnv]);
for (const [path, source] of scannedSources) {
  for (const pattern of forbidden) {
    if (pattern.test(source)) throw new Error(`Secret credential pattern detected in ${path}.`);
  }
}

console.log('Production environment contract verified: GitHub -> Expo/EAS -> Supabase are aligned.');
