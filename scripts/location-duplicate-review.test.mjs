import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual TypeScript recommendation module with type-only imports erased.
const source=fs.readFileSync(new URL('../apps/platform-mobile/services/locationDuplicateInsights.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  reportDiagnostics:true,
});
const failures=(compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
assert.equal(failures.length,0,'TypeScript must transpile without errors');
const exports={};
vm.runInNewContext(compiled.outputText,{exports,console}, {timeout:1000});
const analyze=exports.analyzeDuplicateCase;
assert.equal(typeof analyze,'function');

const location=(changes={})=>({
  id:'id',name:'BGR Construction',address:'404 W Liberty St',city:'Wauconda',
  state:'IL',postal_code:'60084',phone:'8473828772',website:null,
  place_type:'service',brand_name:null,source_dataset:'overture_places',
  source_external_id:'record',is_active:true,latitude:42,longitude:-88,...changes,
});
const caseOf=(changes={})=>({
  id:1,rule:'same_name_address_nearby',confidence:0.97,status:'pending',
  distance_m:6.3,first:location(),second:location({name:'B.G.R. Construction',phone:'(847) 382-8772'}),...changes,
});

test('formatting-only changes are flagged but a strong match is suggested for human confirmation',()=>{
  const result=analyze(caseOf());
  assert.equal(result.suggestedStatus,'confirmed');
  assert.equal(result.differences.find(x=>x.field==='Business name').kind,'variant');
  assert.equal(result.differences.find(x=>x.field==='Phone').kind,'variant');
});

test('large coordinate conflicts take priority over names and addresses',()=>{
  const result=analyze(caseOf({distance_m:3400}));
  assert.equal(result.suggestedStatus,'needs_geocoding');
  assert.equal(result.urgency,'urgent');
});

test('same-building distinct names are never automatically merged',()=>{
  const result=analyze(caseOf({distance_m:0,
    second:location({name:'Tenant B',phone:null})}));
  assert.equal(result.suggestedStatus,null);
  assert.match(result.headline,/separate tenants or aliases/i);
});

test('conflicting categories prevent automatic duplicate recommendations',()=>{
  const result=analyze(caseOf({second:location({place_type:'park'})}));
  assert.equal(result.suggestedStatus,null);
  assert.equal(result.differences.find(x=>x.field==='Place category').kind,'conflict');
});

test('different phone numbers require investigating even if maps match',()=>{
  const result=analyze(caseOf({second:location({phone:'8471119999'})}));
  assert.equal(result.suggestedStatus,null);
  assert.equal(result.differences.find(x=>x.field==='Phone').kind,'conflict');
});

test('closed cases do not receive a new automatic recommendation',()=>{
  const result=analyze(caseOf({status:'confirmed'}));
  assert.equal(result.suggestedStatus,null);
});

test('missing records never get a confident recommendation',()=>{
  const result=analyze(caseOf({second:undefined}));
  assert.equal(result.suggestedStatus,null);
  assert.equal(result.urgency,'high');
});

test('same address but unrelated tenants needs investigation before co-location',()=>{
  const result=analyze(caseOf({distance_m:3,
    second:location({name:'Tenant B',phone:null})}));
  assert.equal(result.suggestedStatus,null);
  assert.match(result.headline,/separate tenants or aliases/i);
});
test('abbreviated brand names with matching contact can be proposed as duplicates',()=>{
  const result=analyze(caseOf({
    second:location({name:'QuikTrip',brand_name:'QuikTrip',phone:'(847) 382-8772'}),
    first:location({name:'QT',brand_name:'QT'}),distance_m:6,
  }));
  assert.equal(result.suggestedStatus,'confirmed');
  assert.match(result.headline,/brand alias/i);
});
test('brand-name alias alone is insufficient to confirm two storefronts',()=>{
  const result=analyze(caseOf({
    first:location({name:'QT',brand_name:'QT',phone:null}),
    second:location({name:'QuikTrip',brand_name:'QuikTrip',phone:null}),
  }));
  assert.equal(result.suggestedStatus,null);
});
test('matching name is not enough when state or postal code conflicts',()=>{
  const result=analyze(caseOf({second:location({state:'MO',postal_code:'63101'})}));
  assert.equal(result.suggestedStatus,null);
  assert.match(result.headline,/address details/i);
});
test('two different websites require investigation before confirming same business',()=>{
  const result=analyze(caseOf({first:location({website:'https://first.example'}),
    second:location({website:'https://second.example'})}));
  assert.equal(result.suggestedStatus,null);
});
test('geocoding lane does not repeatedly recommend selecting the same status',()=>{
  const result=analyze(caseOf({status:'needs_geocoding',distance_m:7300}));
  assert.equal(result.suggestedStatus,null);
});
test('two generic restroom listings cannot be confirmed by near-identical map pins',()=>{
  const result=analyze(caseOf({
    first:location({name:'Public Restroom'}),
    second:location({name:'Public Restroom'}),distance_m:0,
  }));
  assert.equal(result.suggestedStatus,null);
});

test('review pagination does not use unstable offsets while statuses change',()=>{
  const service=fs.readFileSync(new URL('../apps/platform-mobile/services/locationDedup.ts',import.meta.url),'utf8');
  assert.doesNotMatch(service,/\.range\(start,/);
  assert.match(service,/query\.or\(filter\)/);
  assert.match(service,/distance_m\.lt\./);
  assert.match(service,/confidence\.lt\./);
});
test('review saves require unchanged status and timestamp',()=>{
  const service=fs.readFileSync(new URL('../apps/platform-mobile/services/locationDedup.ts',import.meta.url),'utf8');
  assert.match(service,/eq\('status',item\.status\)/);
  assert.match(service,/eq\('reviewed_at',item\.reviewed_at\)/);
  assert.match(service,/is\('reviewed_at',null\)/);
});
test('review workflow retains an explicit confirmation step and cursor navigation',()=>{
  const screen=fs.readFileSync(new URL('../apps/platform-mobile/app/location-duplicates.tsx',import.meta.url),'utf8');
  assert.match(screen,/setCursorHistory/);
  assert.match(screen,/nextBatch\(/);
  assert.match(screen,/Save and continue/);
  assert.match(screen,/no business records merged/i);
});
