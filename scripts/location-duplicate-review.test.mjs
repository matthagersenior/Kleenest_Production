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
  assert.equal(result.suggestedStatus,'co_located');
  assert.match(result.headline,/two tenants/i);
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
