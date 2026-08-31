import fs from 'node:fs';

const migration = 'supabase/migrations/20260831093500_mobile_public_security_definer_rpc_authority.sql';
const failures = [];
if (!fs.existsSync(migration)) failures.push(`missing public RPC authority migration: ${migration}`);

if (!failures.length) {
  const sql = fs.readFileSync(migration, 'utf8');
  const signatures = [
    'get_location_amenity_inventory(uuid)',
    'get_location_occupancy_summary(uuid)',
    'get_location_occupancy_trend(uuid,integer,integer)',
    'get_location_trust_conflicts(uuid)',
    'get_public_qr_landing(text)',
    'map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[])',
    'mobile_location_review_evidence(uuid,integer)',
    'mobile_location_trust_summaries(uuid[])',
    'mobile_review_evidence(uuid)',
    'mobile_review_photos_for_reviews(uuid[])',
  ];

  for (const signature of signatures) {
    if (!sql.includes(`alter function public.${signature} set search_path = '';`)) failures.push(`${signature} must use an empty search path`);
    if (!sql.includes(`revoke all on function public.${signature} from public;`)) failures.push(`${signature} must revoke implicit PUBLIC execution`);
    if (!sql.includes(`grant execute on function public.${signature} to anon, authenticated, service_role;`)) failures.push(`${signature} must explicitly preserve intended public/auth/service execution`);
  }

  if (signatures.length !== 10) failures.push('public RPC authority catalog must contain exactly 10 classified functions');
}

if (failures.length) {
  console.error('Native public RPC authority audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Native public RPC authority audit passed.');
