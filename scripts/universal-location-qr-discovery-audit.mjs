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
assert.match(poster,/QRCode\.toCanvas/);
assert.match(poster,/errorCorrectionLevel:'H'/);
assert.match(poster,/Print sticker/);
assert.match(poster,/Open this location's details & reviews/);
assert.match(poster,/cleanliness_pct/);
const landing=read('src/runtime/QrLandingPage.jsx');
assert.match(landing,/get_public_qr_landing/);
assert.match(landing,/verify_checkin/);
assert.match(landing,/p_qr_code:code/);
assert.match(landing,/brand\.offer_text/);
assert.match(landing,/brand\.welcome_message/);
assert.match(landing,/Get directions to this location/);
assert.match(landing,/directNavigationUrl/);
assert.match(landing,/OUTSIDE_GEOFENCE/);
assert.match(landing,/View full location details & reviews/);

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
assert.match(qrPoster,/PlaceIcon/);
assert.match(qrPoster,/ecl="H"/);
assert.match(qrPoster,/qrCenterIcon/);
assert.match(qrPoster,/Open location details & reviews/);
assert.match(qrPoster,/disabled={!defaultCode}/);
assert.match(qrPoster,/Scan another QR/);
const mobileScanner=read('apps/consumer-mobile/app/qr.tsx');
assert.match(mobileScanner,/Scan a QR\. See the location/);
assert.match(mobileScanner,/Open location details →/);
assert.match(mobileScanner,/Directions to this location/);
assert.match(qrPoster,/kleenest\.us\/qr\?code=/);

const studio=read('apps/business-mobile/app/qr-studio.tsx');
assert.match(studio,/openPermanentLocationQr/);
assert.match(studio,/verified business claim/i);
assert.match(studio,/permanent&&/);
assert.match(studio,/brand:\{/);
assert.match(studio,/claimApproved/);

const guard=read('supabase/migrations/20261014200158_lock_permanent_location_qr.sql');
assert.match(guard,/PERMANENT_QR_CANNOT_BE_DELETED/);
assert.match(guard,/PERMANENT_QR_IDENTITY_LOCKED/);
assert.match(guard,/VERIFIED_LOCATION_CLAIM_REQUIRED_FOR_QR_CUSTOMIZATION/);
assert.match(guard,/c.status='approved'/);
assert.match(guard,/b.verification_status::text='verified'/);

console.log('Universal location QR discovery audit passed: preassigned identifiers, public scan/QR check-in, consumer entry points and verified business customization UI.');
