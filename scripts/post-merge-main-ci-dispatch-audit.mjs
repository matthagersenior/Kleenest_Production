import fs from 'node:fs';

const guardPath = '.github/workflows/pr-completion-guard.yml';
const ciPath = '.github/workflows/ci.yml';
const guard = fs.readFileSync(guardPath, 'utf8');
const ci = fs.readFileSync(ciPath, 'utf8');
const failures = [];
const must = (condition, message) => { if (!condition) failures.push(message); };

must(guard.includes('actions: write'), 'PR Completion Guard must retain actions: write permission so one failed run can be retried.');
must(ci.includes('push:\n    branches: [main]'), 'Production CI must run automatically for every main push.');
must(ci.includes('workflow_dispatch:'), 'Production CI must remain manually dispatchable for recovery.');
must(!guard.includes('github.rest.actions.createWorkflowDispatch'), 'PR Completion Guard must not duplicate the automatic main-push Production CI run.');
must(guard.includes('latestByWorkflow'), 'PR Completion Guard must evaluate the latest run for every triggered PR workflow.');
must(guard.includes('nonGreenRuns'), 'PR Completion Guard must block merges when any triggered PR workflow is not green.');
must(guard.includes('getCombinedStatusForRef'), 'PR Completion Guard must also honor non-Actions commit statuses.');
must(guard.includes("core.info('  main push will trigger the authoritative full Production CI pass');"), 'PR Completion Guard must document the single authoritative post-merge CI path.');

if (failures.length) {
  console.error(`Post-merge main CI convergence audit failed with ${failures.length} gap(s):`);
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log('Post-merge main CI convergence audit passed.');
