import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const ci=read('.github/workflows/ci.yml');
const pages=read('.github/workflows/pages.yml');
const publisher=read('.github/workflows/publish-standalone-installer.yml');
const smoke=read('.github/workflows/install-center-smoke.yml');

const failures=[];
const requireToken=(content,token,label)=>{if(!content.includes(token))failures.push(`${label}: missing ${token}`);};

for(const token of [
  'actions: write',
  "workflow_id: 'pages.yml'",
  "inputs: { source_sha: context.sha }",
]) requireToken(ci,token,'Production CI handoff');

for(const token of [
  'source_sha:',
  'actions: write',
  "workflow_id: 'publish-standalone-installer.yml'",
  "source_sha: ${{ inputs.source_sha || github.event.workflow_run.head_sha || github.sha }}",
]) requireToken(pages,token,'Pages validation handoff');

for(const token of [
  'workflow_dispatch:',
  'source_sha:',
  'actions: write',
  "github.event_name == 'workflow_dispatch'",
  "inputs.source_sha || github.event.workflow_run.head_sha",
  "workflow_id: 'install-center-smoke.yml'",
  'pages_base_url',
]) requireToken(publisher,token,'Pages publisher handoff');

for(const token of [
  'source_sha:',
  'pages_base_url:',
  'Resolve dispatched deployment target',
  'KLEENEST_LIVE_WEB_BASE',
]) requireToken(smoke,token,'Installation Center smoke handoff');

if(failures.length){
  console.error(`Explicit Pages deploy-chain audit failed with ${failures.length} gap(s):`);
  for(const failure of failures) console.error('- '+failure);
  process.exit(1);
}

console.log('Explicit Pages deploy-chain audit passed.');
