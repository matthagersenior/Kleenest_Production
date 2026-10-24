// Regression contract for national restroom discovery: filter before limiting, retain the verified category.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const v2=fs.readFileSync('supabase/migrations/20261024004207_preserve_restroom_filter_in_nearby_v2.sql','utf8');
const v3=fs.readFileSync('supabase/migrations/20261024004123_repair_us_restroom_nearby_v3_candidate_selection.sql','utf8');

test('v2 passes the selected category down to the strictly filtered location search',()=>{
  assert.match(v2,/public\.map_network_nearby_v1\([\s\S]*?v_category,\s*v_search,v_amenities/i);
  assert.doesNotMatch(v2,/when lower\(coalesce\(v_category,''\)\)='restroom' then 'all'/i);
});
test('v3 queries restroom candidates first, not all-place candidates',()=>{
  assert.match(v3,/CASE WHEN v_category='restroom' THEN 'restroom' ELSE 'all' END/);
  assert.match(v3,/v_category='all' OR lower\(coalesce\(n->>'category',''\)\)='restroom'/);
  assert.match(v3,/CASE WHEN cardinality\(v_names\)>0 THEN 500 ELSE p_limit END/);
  assert.doesNotMatch(v3,/n->>'place_type'.*IN \('restroom','bathroom','toilet'\)/);
});
test('v3 preserves unmodified coordinate, radius, search and amenity validation',()=>{
  for(const token of ['latitude out of range','longitude out of range','radius must be between','unsupported category','amenity match must be all or any','search is too long']){
    assert.ok(v3.includes(token),token);
  }
});

test('failed restroom evidence queries keep nearby places available as unverified candidates',()=>{
  const core=fs.readFileSync('packages/mobile-core/src/adaptiveDiscovery.ts','utf8');
  assert.match(core,/listNearbyRestroomsV3\([\s\S]*?\.catch\(\(\)=>\{/);
  assert.match(core,/return \[\] as any\[\];/);
  assert.match(core,/return mergeNearbyDiscoveryRows\(restroomRows,candidateRows,limit\)/);
  assert.match(core,/restroom_candidate_status:'needs_verification'/);
});
