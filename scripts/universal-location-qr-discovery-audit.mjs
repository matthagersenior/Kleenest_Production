import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');

const service=read('src/services/locationQr.js');
assert.match(service,/KLOC-/);
assert.match(service,/kleenest\.us\/qr\?code=/);
assert.match(service,/LOCATION_UUID/);

const app=read('src/runtime/App.jsx');
assert.match(app,/\/location\/:id\/qr/);
assert.match(app,/<Route path="\/qr"/);
const poster=read('src/runtime/LocationQrPage.jsx');
assert.match(poster,/canonicalLocationQrUrl/);
assert.match(poster,/QRCode\.toDataURL/);
const landing=read('src/runtime/QrLandingPage.jsx');
assert.match(landing,/get_public_qr_landing/);
assert.match(landing,/verify_checkin/);
assert.match(landing,/p_qr_code:code/);
assert.match(landing,/brand\.offer_text/);
assert.match(landing,/brand\.welcome_message/);
assert.match(landing,/Get directions to this location/);
assert.match(landing,/directNavigationUrl/);
assert.match(landing,/OUTSIDE_GEOFENCE/);

const explore=read('src/runtime/ExplorePage.jsx');
assert.match(explore,/View QR/);
assert.match(explore,/Location QR/);
const mobileExplore=read('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx');
assert.match(mobileExplore,/openLocationQr\(/);
assert.match(mobileExplore,/View the Kleenest location QR/);
const nativeSearch=read('apps/consumer-mobile/app/search.tsx');
assert.match(nativeSearch,/PLACE · QR READY/);

const qrActions=read('apps/consumer-mobile/services/qrActions.ts');
assert.match(qrActions,/resolve_custom_qr_action/);
assert.match(qrActions,/KLOC-/);
const qrPoster=read('apps/consumer-mobile/app/location-qr.tsx');
assert.match(qrPoster,/defaultCode/);
assert.match(qrPoster,/kleenest\.us\/qr\?code=/);

const studio=read('apps/business-mobile/app/qr-studio.tsx');
assert.match(studio,/openPermanentLocationQr/);
assert.match(studio,/verified business claim/i);
assert.match(studio,/permanent&&/);
assert.match(studio,/brand:\{/);
assert.match(studio,/claimApproved/);
console.log('Universal location QR discovery audit passed: preassigned identifiers, public scan/QR check-in, consumer entry points and verified business customization UI.');
