import fs from 'node:fs';

const failures=[];
const read=file=>fs.readFileSync(file,'utf8');
const required=[
  'supabase/migrations/20260915180500_unclaimed_location_qr_identity.sql',
  'apps/consumer-mobile/services/qrActions.ts',
  'apps/consumer-mobile/app/location-qr.tsx',
  'apps/consumer-mobile/app/qr.tsx',
  'apps/consumer-mobile/app/location/[id].tsx',
  'apps/business-mobile/app/locations.tsx',
  'apps/platform-mobile/services/ownerAdmin.ts',
  'apps/platform-mobile/app/moderation.tsx',
  'apps/consumer-mobile/package.json',
];
for(const file of required)if(!fs.existsSync(file))failures.push('Missing canonical location QR surface: '+file);

if(!failures.length){
  const migration=read(required[0]);
  const service=read(required[1]);
  const identity=read(required[2]);
  const scanner=read(required[3]);
  const detail=read(required[4]);
  const business=read(required[5]);
  const ownerService=read(required[6]);
  const ownerUi=read(required[7]);
  const pkg=read(required[8]);

  for(const token of [
    'alter column business_id drop not null',
    'canonical_location_identity',
    'qr_codes_one_canonical_location_identity_idx',
    'qr_location_placement_events',
    'ensure_location_qr_identity',
    'record_location_qr_placement_event',
    'sync_canonical_location_qr_identity',
    "'business_claimed'",
    "'kleenest_verified'",
    "'placement_verified'",
    "'community'",
    'INDEPENDENT_PLACEMENT_REQUIRED',
    'admin_list_location_qr_placement_events',
    'admin_resolve_location_qr_placement_event',
    'kleenest_map_check_in',
    "'qr_location_identity'"
  ])if(!migration.includes(token))failures.push('QR identity migration missing '+token);

  if(!migration.includes("code=trim(p_code)")||!migration.includes("update public.qr_codes\n  set business_id=v_business"))
    failures.push('Claim/attribution continuity must preserve the existing QR code while authority changes.');
  if(migration.includes("set code="))failures.push('Canonical location QR code must never rotate during claim synchronization.');

  for(const token of ['normalizeQrCode','ensureLocationQrIdentity','recordLocationQrPlacementEvent','canonical_location_identity','claimable'])
    if(!service.includes(token))failures.push('Consumer QR authority missing '+token);

  for(const token of ['KLEENEST COMMUNITY QR','A sticker is evidence, not ownership.','I placed this QR here','Verify this placement','Unauthorized placement','kleenest-business://locations'])
    if(!identity.includes(token))failures.push('Location QR experience missing '+token);

  for(const token of ['COMMUNITY LOCATION QR','Verify visit & review','Open location & feedback','business_claimed','canonical_location_identity'])
    if(!scanner.includes(token))failures.push('QR scanner community identity handling missing '+token);

  if(!detail.includes("pathname:'/location-qr'"))failures.push('Full location details must expose the permanent Location QR.');
  for(const token of ['claimLocationId','claimName','search(String(claimName))'])
    if(!business.includes(token))failures.push('Business claim deep link missing '+token);
  for(const token of ['qrPlacementReports','admin_list_location_qr_placement_events','resolveOwnerQrPlacementReport'])
    if(!ownerService.includes(token))failures.push('KleenestOS QR moderation authority missing '+token);
  for(const token of ['QR placement reports','Confirm issue','Mark removed'])
    if(!ownerUi.includes(token))failures.push('KleenestOS QR moderation UI missing '+token);
  for(const token of ['"react-native-qrcode-svg": "6.3.22"','"react-native-svg": "15.15.4"'])
    if(!pkg.includes(token))failures.push('Consumer QR renderer dependency missing '+token);
}

if(failures.length){
  console.error('Canonical location QR identity audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Canonical location QR identity audit passed: unclaimed QR identity, independent placement verification, claim continuity, and owner moderation remain converged.');
