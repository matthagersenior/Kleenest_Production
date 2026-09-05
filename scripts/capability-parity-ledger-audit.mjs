import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ledgerPath=path.join(root,'config/capability-parity-ledger.json');
const fail=[];
const must=(ok,message)=>{if(!ok)fail.push(message)};
const exists=relative=>fs.existsSync(path.join(root,relative));
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

must(fs.existsSync(ledgerPath),'capability parity ledger is missing');
if(fail.length){for(const message of fail)console.error(`Capability parity ledger: ${message}`);process.exit(1)}

const ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
const allowed=new Set(ledger.classifications||[]);
const chainDimensions=ledger.chainDimensions||[];
const items=ledger.items||[];
const ids=new Set();

must(ledger.version===1,'unsupported ledger version');
must(typeof ledger.asOf==='string'&&ledger.asOf.length>0,'asOf is required');
must(ledger.productionRepo==='matthagersenior/Kleenest_Production','productionRepo must point at the canonical monorepo');
must(Array.isArray(ledger.sourceRepos)&&ledger.sourceRepos.length>=9,'sourceRepos must cover the known Kleenest repository estate');
must(new Set(ledger.sourceRepos).size===ledger.sourceRepos.length,'sourceRepos contains duplicates');
for(const required of ['matthagersenior/Kleenest_Business','matthagersenior/Kleenest_Fleet','matthagersenior/Kleenest_Owner','matthagersenior/Kleenest_Architecture','matthagersenior/Kleenest_App','matthagersenior/KleenestApp','matthagersenior/Kleenest','matthagersenior/Kleenest-'])must(ledger.sourceRepos.includes(required),`source repo is not tracked: ${required}`);
for(const required of ['fully-present','equivalent','partial','missing','disconnected','duplicated','obsolete'])must(allowed.has(required),`classification enum missing ${required}`);
for(const required of ['ui','service','backend','authorization','stateRefresh','offline'])must(chainDimensions.includes(required),`chain dimension missing ${required}`);

const snapshot=ledger.liveBackendSnapshot||{};
must(snapshot.projectRef==='ssgesjzdvdsqacdtasje','live backend project ref changed unexpectedly');
for(const key of ['publicTables','publicViews','publicFunctions','rlsPolicies','realtimeTables'])must(Number.isInteger(snapshot[key])&&snapshot[key]>0,`live backend snapshot ${key} must be a positive integer`);
must(Array.isArray(snapshot.edgeFunctions)&&snapshot.edgeFunctions.length>=32,'live Edge Function snapshot is unexpectedly smaller than the audited baseline');
must(new Set(snapshot.edgeFunctions).size===snapshot.edgeFunctions.length,'live Edge Function snapshot contains duplicates');

for(const item of items){
  const prefix=item?.id||'<missing-id>';
  must(typeof item?.id==='string'&&item.id.length>0,'ledger item id is required');
  if(item?.id){must(!ids.has(item.id),`duplicate ledger item id: ${item.id}`);ids.add(item.id)}
  must(typeof item?.product==='string'&&item.product.length>0,`${prefix}: product is required`);
  must(typeof item?.domain==='string'&&item.domain.length>0,`${prefix}: domain is required`);
  must(allowed.has(item?.classification),`${prefix}: invalid classification ${String(item?.classification)}`);
  must(item?.source&&typeof item.source.kind==='string',`${prefix}: source.kind is required`);
  must(item?.chain&&typeof item.chain==='object',`${prefix}: chain is required`);
  for(const dimension of chainDimensions)must(dimension in (item.chain||{}),`${prefix}: chain.${dimension} is required`);

  const incomplete=['partial','missing','disconnected','duplicated'].includes(item?.classification);
  if(incomplete)must(typeof item?.gap==='string'&&item.gap.trim().length>0,`${prefix}: incomplete classifications require a concrete gap`);

  if(['fully-present','equivalent'].includes(item?.classification)){
    for(const dimension of ['ui','service','backend','authorization','stateRefresh'])must(item.chain?.[dimension]===true,`${prefix}: ${item.classification} requires chain.${dimension}=true`);
    must((item.productionEvidence?.files||[]).length>0,`${prefix}: ${item.classification} requires Production evidence`);
  }

  if(item?.protect!==false){
    for(const file of item?.productionEvidence?.files||[])must(exists(file),`${prefix}: protected Production evidence disappeared: ${file}`);
    for(const marker of item?.productionEvidence?.markers||[]){
      must(exists(marker.file),`${prefix}: marker file disappeared: ${marker.file}`);
      if(!exists(marker.file))continue;
      const source=read(marker.file);
      for(const token of marker.contains||[])must(source.includes(token),`${prefix}: ${marker.file} lost required marker: ${token}`);
    }
  }
}

for(const required of ['business.enterprise-economy','business.governance-reporting','fleet.map-dispatch','fleet.live-geofence','fleet.device-offline-queue','owner.authorization-control-plane','owner.capability-governance','architecture.runtime-workspace-stabilization','legacy.web-runtime-wiring','backend.edge-function-source-drift','backend.live-source-migration-parity'])must(ids.has(required),`required reconciliation domain is missing from ledger: ${required}`);

if(fail.length){
  console.error(`Capability parity ledger audit failed with ${fail.length} issue${fail.length===1?'':'s'}:`);
  for(const message of fail)console.error(`- ${message}`);
  process.exit(1);
}

const counts=Object.fromEntries([...allowed].map(status=>[status,items.filter(item=>item.classification===status).length]));
const open=items.filter(item=>['partial','missing','disconnected','duplicated'].includes(item.classification));
console.log(`Capability parity ledger passed: ${items.length} tracked domains across ${ledger.sourceRepos.length} repositories; ${open.length} open reconciliation gap${open.length===1?'':'s'}.`);
console.log(`Classifications: ${Object.entries(counts).map(([key,value])=>`${key}=${value}`).join(', ')}`);
console.log('Open gaps remain intentionally visible in the ledger; this audit fails when protected evidence disappears or the ledger contract regresses.');
