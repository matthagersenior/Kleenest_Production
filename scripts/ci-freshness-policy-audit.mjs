import './production-live-config-source-control-audit.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, '.github', 'workflows', name), 'utf8');
const requireText = (source, text, message) => {
  if (!source.includes(text)) throw new Error(message);
};
const requireManualOnly = (name) => {
  const workflow = read(name);
  requireText(workflow, 'workflow_dispatch:', `${name} must remain manually triggered.`);
  for (const trigger of ['pull_request', 'push', 'schedule', 'workflow_run']) {
    if (new RegExp(`^\\s{2}${trigger}:`, 'm').test(workflow)) {
      throw new Error(`${name} must not run automatically from ${trigger}; canonical CI owns automation.`);
    }
  }
};

for (const name of [
  'ci.yml',
  'product-parity.yml',
  'security-gate.yml',
  'expo-push-token-validation.yml',
  'native-secret-hygiene.yml',
  'business-enterprise-truth.yml',
  'mandatory-onboarding-consumer-focus.yml',
  'platform-integration.yml',
  'sync-kleenest-data.yml',
  'native-push-repair-candidates.yml',
  'eas-install-ready.yml',
]) {
  const workflow = read(name);
  requireText(workflow, 'concurrency:', `${name} must coalesce superseded runs.`);
  requireText(workflow, 'cancel-in-progress: true', `${name} must cancel superseded runs.`);
}

for (const name of [
  'native-push-repair-candidates.yml',
  'eas-install-ready.yml',
]) requireManualOnly(name);

const ci = read('ci.yml');
requireText(ci, 'npm audit --audit-level=moderate', 'Production CI must reject every published moderate-or-higher dependency advisory.');
requireText(ci, 'node scripts/ci-freshness-policy-audit.mjs', 'Production CI must enforce its own freshness policy.');

const platformIntegration = read('platform-integration.yml');
requireText(platformIntegration, 'name: platform-integration', 'Path-specific Platform Integration CI must not publish the generic required verify context.');
if (platformIntegration.split('.github/workflows/platform-integration.yml').length - 1 < 2) throw new Error('Platform Integration CI must test changes to its own workflow on pull requests.');

const onboarding = read('mandatory-onboarding-consumer-focus.yml');
requireText(onboarding, 'name: mandatory-onboarding-consumer-focus', 'Path-specific onboarding CI must not publish the generic required verify context.');

const android = read('android-family.yml');
for (const token of ['workflow_dispatch:','push:','branches: [main]','releases/family-native.txt','schedule:',"cron: '0 9 * * *'",'resolve-family-apk-baseline.mjs','app-family-release-plan.mjs','should_build','group: kleenest-app-family-android-main']) {
  requireText(android, token, 'Android family native rebuild policy missing '+token);
}
if (/^\s{2}workflow_run:/m.test(android)) throw new Error('Android family builds must not rebuild after every canonical CI run.');
if (/^\s{2}pull_request:/m.test(android)) throw new Error('Android family builds must never run from pull requests.');

const publisher = read('publish-standalone-installer.yml');
requireText(publisher, 'workflows: ["Validate Kleenest Consumer Web Preview"]', 'Consumer Pages publishing must follow successful canonical web validation rather than the whole Android family matrix.');
requireText(publisher, "github.event.workflow_run.conclusion == 'success'", 'Consumer Pages publishing must require successful canonical web validation.');
requireText(publisher, 'ref: ${{ github.event.workflow_run.head_sha }}', 'Consumer Pages publishing must export the exact web-validated commit.');
requireText(publisher, 'resolve-consumer-apk-baseline.mjs', 'Consumer Pages publishing must preserve the freshest independently verified Consumer APK.');
requireText(publisher, 'consumer-release-drift-audit.mjs', 'Consumer Pages publishing must expose native/OTA drift against the installed APK baseline.');
requireText(publisher, 'run-id: ${{ steps.apk.outputs.run_id }}', 'Consumer Pages publishing must download the resolved verified Consumer APK artifact rather than depend on an unrelated family conclusion.');
if (publisher.includes('workflows: ["Build Kleenest App Family Android APKs"]')) throw new Error('Consumer Pages publishing must not wait for the full Android family matrix.');

const familyOta = read('ota-family.yml');
for (const token of ['workflow_run:','workflows: ["Production CI"]',"github.event.workflow_run.conclusion == 'success'","github.event.workflow_run.head_branch == 'main'",'ref: ${{ github.event.workflow_run.head_sha || github.sha }}','resolve-family-apk-baseline.mjs','app-family-release-plan.mjs','should_publish','native_rebuild_required','consumer-production','business-production','fleet-production','owner-production']) {
  requireText(familyOta, token, 'Coordinated family OTA authority missing '+token);
}

const consumerOta = read('ota-consumer.yml');
requireText(consumerOta, 'workflow_dispatch:', 'Emergency Consumer OTA must remain explicitly triggered.');
for (const trigger of ['workflow_run','push','schedule','pull_request']) {
  if (new RegExp(`^\\s{2}${trigger}:`, 'm').test(consumerOta)) throw new Error(`Emergency Consumer OTA must not run automatically from ${trigger}; coordinated family OTA owns normal production delivery.`);
}
requireText(consumerOta, 'consumer-release-drift-audit.mjs', 'Emergency Consumer OTA must run its native drift guard.');
requireText(consumerOta, '--strict', 'Emergency Consumer OTA must block when Consumer native drift requires a rebuilt binary.');
requireText(consumerOta, 'resolve-family-apk-baseline.mjs', 'Emergency Consumer OTA must resolve the synchronized family baseline.');
requireText(consumerOta, 'app-family-release-plan.mjs', 'Emergency Consumer OTA must enforce family native compatibility.');
requireText(consumerOta, '--strict-ota', 'Emergency Consumer OTA must refuse to cross family native drift.');

console.log('CI freshness policy audit passed.');
