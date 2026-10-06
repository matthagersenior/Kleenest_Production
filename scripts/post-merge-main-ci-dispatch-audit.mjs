import fs from 'node:fs';

const guardPath='.github/workflows/pr-completion-guard.yml';
const ciPath='.github/workflows/ci.yml';
const guard=fs.readFileSync(guardPath,'utf8');
const ci=fs.readFileSync(ciPath,'utf8');
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};

const mergeMarker="core.info(\`  merged PR #\${pr.number}: \${result.data.sha}\`);";
const dispatchMarker='github.rest.actions.createWorkflowDispatch';

must(guard.includes('actions: write'),'PR Completion Guard must retain actions: write permission.');
must(ci.includes('workflow_dispatch:'),'Production CI must remain manually dispatchable.');
must(guard.includes(dispatchMarker),'PR Completion Guard must dispatch Production CI after bot merges.');
must(guard.includes("workflow_id: 'ci.yml'"),"Post-merge dispatch must target Production CI's ci.yml workflow.");
must(guard.includes("ref: 'main'"),"Post-merge Production CI dispatch must target main.");
must(ci.includes("Dispatch production database readiness after bot-launched main CI"),'Bot-launched main CI must explicitly continue into production database readiness.');
must(ci.includes("workflow_id: 'supabase-production-migrations.yml'"),'Bot-launched main CI must dispatch the guarded production database readiness workflow.');
must(ci.includes("github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'"),'Database readiness dispatch must be limited to bot-launched main CI.');

const mergeIndex=guard.indexOf(mergeMarker);
const dispatchIndex=guard.indexOf(dispatchMarker);
must(mergeIndex>=0,'PR Completion Guard merge success marker is missing.');
must(dispatchIndex>mergeIndex,'Production CI dispatch must occur only after a successful merge.');

if(failures.length){
  console.error(`Post-merge main CI dispatch audit failed with ${failures.length} gap(s):`);
  failures.forEach(f=>console.error('- '+f));
  process.exit(1);
}

console.log('Post-merge main CI dispatch audit passed.');
