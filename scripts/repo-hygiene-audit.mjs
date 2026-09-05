import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const failures = [];
const must = (condition, message) => { if (!condition) failures.push(message); };
const exists = (path) => fs.existsSync(path);
const read = (path) => (exists(path) ? fs.readFileSync(path, 'utf8') : '');

let tracked = [];
try {
  tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .map((path) => path.trim())
    .filter(Boolean);
} catch (error) {
  failures.push(`unable to inspect tracked files: ${error.message}`);
}

const forbiddenTracked = [
  { test: (path) => /(^|\/)\.env($|\.)/.test(path) && !/(^|\/)\.env\.example$/.test(path), reason: 'environment file' },
  { test: (path) => /\.(jks|keystore|p8|p12|mobileprovision|pem|key)$/i.test(path), reason: 'signing/provisioning material' },
  { test: (path) => /\.(apk|aab|ipa|xcarchive)$/i.test(path), reason: 'release binary' },
  { test: (path) => /(^|\/)node_modules\//.test(path), reason: 'dependency output' },
  { test: (path) => /(^|\/)\.expo\//.test(path), reason: 'Expo generated state' },
  { test: (path) => /^apps\/[^/]+\/(android|ios)\//.test(path), reason: 'generated native project' },
  { test: (path) => /(^|\/)(dist|coverage)\//.test(path), reason: 'generated build/test output' },
];

for (const path of tracked) {
  for (const rule of forbiddenTracked) {
    if (rule.test(path)) failures.push(`tracked ${rule.reason} is not allowed: ${path}`);
  }
}

const requiredDocs = [
  'README.md',
  '.env.example',
  'docs/ARCHITECTURE.md',
  'docs/RELEASE_READINESS.md',
  'docs/play-store/PLAY_SUBMISSION.md',
  'docs/play-store/DATA_SAFETY.md',
  'public/legal/privacy.html',
  'public/legal/terms.html',
  'public/legal/account-deletion.html',
  'config/play-store-matrix.json',
];
for (const path of requiredDocs) must(exists(path), `required canonical repository file missing: ${path}`);

const gitignore = read('.gitignore');
for (const token of ['apps/*/android/', 'apps/*/ios/', '*.aab', '*.apk', '*.keystore', '.env.*']) {
  must(gitignore.includes(token), `.gitignore must protect ${token}`);
}

const matrix = JSON.parse(read('config/play-store-matrix.json') || '{}');
const expectedPackages = {
  consumer: 'com.kleenest.app',
  business: 'com.kleenest.business',
  fleet: 'com.kleenest.fleet',
  owner: 'com.kleenest.platform',
};
for (const [app, packageName] of Object.entries(expectedPackages)) {
  must(matrix.apps?.[app]?.package === packageName, `${app}: canonical Android package drifted from ${packageName}`);
}

const envExample = read('.env.example');
must(!/SERVICE_ROLE|PRIVATE_KEY|SECRET_KEY|PASSWORD\s*=/i.test(envExample), '.env.example must not contain secret-value fields');

if (failures.length) {
  console.error('Repository hygiene audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Repository hygiene audit passed (${tracked.length} tracked files inspected).`);
