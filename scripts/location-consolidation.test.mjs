import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const migration=(dir,name)=>{
 const file=fs.readdirSync(path.join(root,dir)).find(f=>f.includes(name));
 assert.ok(file,'Migration '+name+' must be tracked in source control');
 return read(dir+'/'+file);
};
const prod=migration('supabase/migrations','location_owner_consolidation_guarded_preview_v1');
const extra=migration('supabase/migrations','location_consolidation_extra_unconstrained_reference_guard_v2');
const undo=migration('supabase/migrations','location_owner_consolidation_undo_v3');
const geo=migration('supabase/kleenest-data/migrations','geo_owner_consolidation_tombstone_v1');
const ownerUI=read('apps/platform-mobile/app/location-consolidate.tsx');
const sender=read('supabase/functions/geo-catalog-exporter/index.ts');
const receiver=read('supabase/kleenest-data/functions/geo-catalog-receiver/index.ts');

test('only owner-authorized confirmed cases can consolidate with explicit fingerprint',()=>{
 assert.match(prod,/is_platform_owner_session\(\)/);
 assert.match(prod,/v_case.status<>'confirmed'/);
 assert.match(extra,/reviewed_at IS NULL/);
 assert.match(prod,/p_confirmation<>'CONSOLIDATE'/);
 assert.match(prod,/p_fingerprint IS DISTINCT FROM v_preview->>'fingerprint'/);
});
test('every FK and unconstrained location reference is audited before merge',()=>{
 assert.match(prod,/pg_catalog.pg_constraint/);
 assert.match(prod,/v_source_count\s*:=\s*v_source_count\s*\+/);
 assert.match(extra,/location_consolidation_unconstrained_refs/);
 assert.match(extra,/source_total/);
 assert.match(prod,/Consolidation blocked/);
});
test('no existing reviews, claims, QR codes or photos are rewritten or deleted',()=>{
 assert.doesNotMatch(prod,/DELETE FROM public\.(reviews|qr_codes|location_claims|location_photos)/);
 assert.doesNotMatch(prod,/UPDATE public\.(reviews|qr_codes|location_claims|location_photos)/);
 assert.match(prod,/internal.location_identity_redirects/);
 assert.match(prod,/source_snapshot/);
 assert.match(prod,/survivor_snapshot/);
});
test('owner interface requires choice, impact preview and typed confirmation',()=>{
 assert.match(ownerUI,/Keep record/);
 assert.match(ownerUI,/Consolidation impact preview/);
 assert.match(ownerUI,/preview\.allowed/);
 assert.match(ownerUI,/confirm!=='CONSOLIDATE'/);
 assert.match(ownerUI,/preview\.fingerprint/);
});
test('undo and geo retirement stay auditable, idempotent and authorized',()=>{
 assert.match(undo,/p_confirmation<>'RESTORE'/);
 assert.match(undo,/latest|geo_status/);
 assert.match(undo,/location_consolidation_outbox/);
 assert.match(geo,/latest_outbox_id>=v_outbox/);
 assert.match(geo,/archived_record/);
 assert.match(sender,/location_consolidation_geo_outbox_ack/);
 assert.match(receiver,/x-kleenest-geo-archive/);
 assert.match(receiver,/apply_geo_catalog_retirements/);
});
test('public owner RPCs cannot be executed anonymously',()=>{
 for(const fn of ['preview_location_consolidation','execute_location_consolidation']){
  assert.ok(prod.includes('REVOKE ALL ON FUNCTION public.'+fn));
 }
 assert.match(undo,/REVOKE ALL ON FUNCTION public\.undo_location_consolidation/);
 assert.match(geo,/GRANT EXECUTE ON FUNCTION public\.apply_geo_catalog_retirements\(jsonb\) TO service_role/);
});

test('preview exposes specific associated identity samples for evidence review',()=>{
 const samples=migration('supabase/migrations','location_consolidation_linked_identity_samples_v5');
 assert.match(samples,/linked_samples/);
 for(const key of ['qr_codes','reviews','check_ins','location_claims','location_photos','external_location_records']){
  assert.ok(samples.includes(key), 'impact evidence must include '+key);
 }
 assert.match(ownerUI,/Affected record identities/);
});
