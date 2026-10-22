// Regression contract for production map pin authority and owner coordinate review.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const explore = fs.readFileSync('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx','utf8');
const owner = fs.readFileSync('apps/platform-mobile/app/location-coordinate-review.tsx','utf8');
const reviews = fs.readFileSync('apps/platform-mobile/app/location-duplicates.tsx','utf8');
const migration = fs.readFileSync('supabase/migrations/20261022031557_location_coordinate_guard_review_20261021.sql','utf8');

assert.match(explore,/const anchor=bucket\.reduce\(/,'Clusters must choose an actual physical member as anchor');
assert.match(explore,/center:\[Number\(anchor\.longitude\),Number\(anchor\.latitude\)\]/,'Cluster marker must use member coordinates');
assert.doesNotMatch(explore,/center:\[longitude,latitude\]/,'Cluster marker must not float between buildings');
assert.match(owner,/owner_location_coordinate_review/,'Owner must be able to load the coordinate discrepancy queue');
assert.match(owner,/owner_resolve_location_coordinate_case/,'Owner must have a decision action');
assert.match(owner,/same_source_identity/,'Coordinate approval must require a matching source identity');
assert.match(owner,/item\.distance_m<=250/,'Coordinate approval must reject large unexplained jumps');
assert.match(owner,/\(notes\[item\.id\]\|\|''\)\.trim\(\)/,'Every decision must have a written rationale');
assert.match(reviews,/location-coordinate-review/,'Existing owner reviews must expose coordinate controls');
assert.match(migration,/ENABLE ROW LEVEL SECURITY/,'Source evidence must be access controlled');
assert.match(migration,/is_platform_owner_session/,'Owner RPC must enforce owner capability');
assert.match(migration,/trg_track_external_coordinate_drift/,'Source ingestion must trigger coordinate validation');
assert.match(migration,/location_coordinate_review_cases/,'Discrepancies must remain reviewable');
console.log('Map pin integrity contracts pass.');
