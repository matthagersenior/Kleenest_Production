import fs from 'node:fs';

const read = (name) => fs.readFileSync('.github/workflows/' + name, 'utf8');
const guard = read('pr-completion-guard.yml');
const ci = read('ci.yml');
const security = read('security-gate.yml');
const parity = read('product-parity.yml');
const lineage = read('main-lineage-guard.yml');
const failures = [];
const must = (condition, message) => { if (!condition) failures.push(message); };

must(guard.includes('actions: write'), 'PR Completion Guard must retain actions: write permission for retries and workflow dispatch.');
must(ci.includes('push:\n    branches: [main]'), 'Production CI must run automatically for ordinary main pushes.');
must(ci.includes('workflow_dispatch:'), 'Production CI must be dispatchable after GITHUB_TOKEN bot merges.');
must(security.includes('workflow_dispatch:'), 'Security Gate must be dispatchable after GITHUB_TOKEN bot merges.');
must(parity.includes('workflow_dispatch:'), 'App Family Product Parity must be dispatchable after GITHUB_TOKEN bot merges.');
must(lineage.includes('workflow_dispatch:'), 'Main Lineage Guard must be dispatchable after GITHUB_TOKEN bot merges.');
must(guard.includes('postMergeWorkflows'), 'PR Completion Guard must define the bot-merge main validation handoff.');
for (const workflow of ['ci.yml', 'security-gate.yml', 'product-parity.yml', 'main-lineage-guard.yml']) {
  must(guard.includes("'" + workflow + "'"), 'PR Completion Guard must dispatch ' + workflow + ' after a bot merge.');
}
must(guard.includes('github.rest.actions.createWorkflowDispatch'), 'PR Completion Guard must explicitly dispatch main validation because GITHUB_TOKEN merges do not emit normal push workflows.');
must(guard.includes("ref: 'main'"), 'Bot-merge validation dispatches must target main.');
must(guard.includes('latestByWorkflow'), 'PR Completion Guard must evaluate the latest run for every triggered PR workflow.');
must(guard.includes('nonGreenRuns'), 'PR Completion Guard must block merges when any triggered PR workflow is not green.');
must(guard.includes('getCombinedStatusForRef'), 'PR Completion Guard must also honor non-Actions commit statuses.');

if (failures.length) {
  console.error(`Post-merge main CI convergence audit failed with ${failures.length} gap(s):`);
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log('Post-merge main CI convergence audit passed.');
