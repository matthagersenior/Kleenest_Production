import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditPullRequestFeatureMetadata } from './pr-feature-lifecycle-lib.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const eventPath=process.env.GITHUB_EVENT_PATH;
if(!eventPath||!fs.existsSync(eventPath)){
  console.log('Feature lifecycle PR metadata audit skipped: no GitHub pull_request event.');
  process.exit(0);
}
const payload=JSON.parse(fs.readFileSync(eventPath,'utf8'));
if(!payload.pull_request){
  console.log('Feature lifecycle PR metadata audit skipped: event is not a pull request.');
  process.exit(0);
}
const registry=JSON.parse(fs.readFileSync(path.join(root,'config/feature-lifecycle.json'),'utf8'));
const baseSha=payload.pull_request.base.sha;
const headSha=payload.pull_request.head.sha;
const changed=execFileSync('git',['diff','--name-only',baseSha,headSha],{cwd:root,encoding:'utf8'})
  .split('\n').map(x=>x.trim()).filter(Boolean);
const failures=auditPullRequestFeatureMetadata({
  registry,
  prNumber:payload.number,
  body:payload.pull_request.body||'',
  changedFiles:changed,
});
if(failures.length){
  console.error('Feature lifecycle PR metadata audit failed:');
  failures.forEach(f=>console.error(`- ${f}`));
  process.exit(1);
}
console.log(`Feature lifecycle PR metadata audit passed for PR #${payload.number}.`);
