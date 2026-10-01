import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const servicePath=path.join(root,'apps/consumer-mobile/services/discoveryIntent.ts');

function loadService(){
  assert.ok(fs.existsSync(servicePath),'discoveryIntent service exists');
  let source=fs.readFileSync(servicePath,'utf8');
  source=source.replace(/^import[^;]+;\s*/gm,'');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  const module={exports};
  vm.runInNewContext(compiled,{exports,module,console,setTimeout,clearTimeout,URL,fetch:()=>Promise.reject(new Error('network disabled in unit test')),getKleenestSupabaseClient:()=>({functions:{invoke:()=>Promise.reject(new Error('network disabled'))}})});
  return module.exports;
}

test('plain brand and address searches stay on the deterministic fast path',()=>{
  const {shouldInterpretDiscoveryQuery}=loadService();
  assert.equal(shouldInterpretDiscoveryQuery('Pizza Hut'),false);
  assert.equal(shouldInterpretDiscoveryQuery('123 Main St, Sparta, IL 62286'),false);
  assert.equal(shouldInterpretDiscoveryQuery('clean restroom with a changing table on my way to St. Louis'),true);
});

test('deterministic intent extracts route, destination, restroom need and amenity',()=>{
  const {deterministicDiscoveryIntent}=loadService();
  const intent=deterministicDiscoveryIntent(
    'clean restroom with a changing table on my way to St. Louis',
    'nearby',
    ['Changing table','Wheelchair accessible','Family restroom'],
  );
  assert.equal(intent.mode,'route');
  assert.equal(intent.destinationText,'St. Louis');
  assert.equal(intent.restroomRequired,true);
  assert.ok(intent.amenityTerms.some(value=>/changing table/i.test(value)));
  assert.match(intent.summary,/Along route/i);
  assert.match(intent.summary,/Changing table/i);
});

test('nearby constraints remain structured without inventing a place',()=>{
  const {deterministicDiscoveryIntent}=loadService();
  const intent=deterministicDiscoveryIntent(
    'wheelchair accessible bathroom within 10 miles',
    'nearby',
    ['Changing table','Wheelchair accessible','Family restroom'],
  );
  assert.equal(intent.mode,'nearby');
  assert.equal(intent.destinationText,'');
  assert.equal(intent.restroomRequired,true);
  assert.ok(intent.amenityTerms.some(value=>/wheelchair|accessible/i.test(value)));
  assert.equal(intent.maxRadiusMiles,10);
});
