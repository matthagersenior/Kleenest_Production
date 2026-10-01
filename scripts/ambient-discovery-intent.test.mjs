// Contract: natural language becomes bounded Kleenest discovery intent, never authoritative place data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const corePath=path.join(root,'apps/consumer-mobile/services/discoveryIntentCore.js');
assert.ok(fs.existsSync(corePath),'discovery intent core exists');
const service=await import(pathToFileURL(corePath).href);

test('plain brand and address searches stay on the deterministic fast path',()=>{
  assert.equal(service.shouldInterpretDiscoveryQuery('Pizza Hut'),false);
  assert.equal(service.shouldInterpretDiscoveryQuery('123 Main St, Sparta, IL 62286'),false);
  assert.equal(service.shouldInterpretDiscoveryQuery('clean restroom with a changing table on my way to St. Louis'),true);
});

test('deterministic intent extracts route, destination, restroom need and amenity',()=>{
  const intent=service.deterministicDiscoveryIntent(
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
  const intent=service.deterministicDiscoveryIntent(
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
