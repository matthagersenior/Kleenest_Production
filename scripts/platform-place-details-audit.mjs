import fs from 'node:fs';

function file(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function need(condition, message) {
  if (!condition) throw new Error(message);
}

const api = file('supabase/functions/platform-api/index.ts');
need(api.includes('/v1/places/'), 'Platform API must expose canonical place details route.');
need(api.includes('mobile_location_detail_v1'), 'Place details must delegate to canonical mobile location detail authority.');
need(api.includes('publicPlaceDetails'), 'Platform API must sanitize the internal location detail payload.');

const sdk = file('packages/sdk-js/src/index.ts');
need(sdk.includes('getPlace('), 'JavaScript SDK must expose getPlace.');
need(sdk.includes('/v1/places/'), 'JavaScript SDK getPlace must call the public v1 place route.');

const core = file('packages/platform-core/src/types.ts');
need(core.includes('export type PlaceDetails'), 'Platform core must define PlaceDetails.');

const smoke = file('supabase/functions/platform-integration-smoke/index.ts');
need(smoke.includes('placeDetails'), 'Live integration smoke must cover place details.');

console.log('Kleenest Platform place-details audit passed.');
