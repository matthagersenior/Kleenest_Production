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

const android = read('android-family.yml');
requireText(android, 'workflow_run:', 'Android family builds must start from a completed canonical CI run.');
requireText(android, 'workflows: [Production CI]', 'Android family builds must be downstream of Production CI.');
requireText(android, "github.event.workflow_run.conclusion == 'success'", 'Android family builds must require successful canonical CI.');
requireText(android, 'ref: ${{ github.event.workflow_run.head_sha || github.sha }}', 'Android family builds must check out the exact commit that passed CI.');
requireText(android, "group: kleenest-app-family-android-${{ github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main' && github.event.workflow_run.head_sha || github.event_name == 'workflow_dispatch' && github.sha || github.run_id }}", 'Android family concurrency must isolate ineligible workflow_run invocations so a skipped run cannot cancel a valid native build.');
if (android.includes('github.event.pull_request.number || github.ref')) throw new Error('Android family concurrency must not collapse all workflow_run events onto github.ref.');
if (/^\s{2}push:/m.test(android)) throw new Error('Android family builds must not race directly against push CI.');
if (/^\s{2}pull_request:/m.test(android)) throw new Error('Android family builds must not race directly against pull-request CI.');

const publisher = read('publish-standalone-installer.yml');
requireText(publisher, "github.event.workflow_run.conclusion == 'success'", 'Installer publishing must require a successful Android family run.');
requireText(publisher, 'ref: ${{ github.event.workflow_run.head_sha }}', 'Installer publishing must use the exact Android-tested commit.');
requireText(publisher, 'run-id: ${{ github.event.workflow_run.id }}', 'Installer publishing must download from the exact triggering Android family run.');

console.log('CI freshness policy audit passed.');
