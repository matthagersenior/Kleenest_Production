-- Reviewed public SECURITY DEFINER contract.
-- These functions intentionally expose constrained public projections over private tables.
-- Normalize ACLs to explicit anon/authenticated/service grants and remove broad PUBLIC execution.

revoke all on function public.discovery_photos_for_location(uuid) from public;
grant execute on function public.discovery_photos_for_location(uuid) to anon, authenticated, service_role;
comment on function public.discovery_photos_for_location(uuid) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: public sanitized discovery-photo metadata projection; underlying photo rows remain private.';

revoke all on function public.get_location_amenity_inventory(uuid) from public;
grant execute on function public.get_location_amenity_inventory(uuid) to anon, authenticated, service_role;
comment on function public.get_location_amenity_inventory(uuid) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: public aggregated amenity/trust inventory over private observation and remediation evidence.';

revoke all on function public.get_location_occupancy_summary(uuid) from public;
grant execute on function public.get_location_occupancy_summary(uuid) to anon, authenticated, service_role;
comment on function public.get_location_occupancy_summary(uuid) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: public aggregated occupancy summary; raw occupancy observations remain private.';

revoke all on function public.get_location_occupancy_trend(uuid,integer,integer) from public;
grant execute on function public.get_location_occupancy_trend(uuid,integer,integer) to anon, authenticated, service_role;
comment on function public.get_location_occupancy_trend(uuid,integer,integer) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: public privacy-thresholded occupancy trend; raw contributor observations remain private.';

revoke all on function public.get_location_preventive_maintenance_status(uuid) from public;
grant execute on function public.get_location_preventive_maintenance_status(uuid) to anon, authenticated, service_role;
comment on function public.get_location_preventive_maintenance_status(uuid) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: public preventive-maintenance transparency summary over private business work-order data.';

revoke all on function public.get_location_recovery_confidence(uuid) from public;
grant execute on function public.get_location_recovery_confidence(uuid) to anon, authenticated, service_role;
comment on function public.get_location_recovery_confidence(uuid) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: public recovery-confidence projection over private remediation evidence.';

revoke all on function public.get_location_recovery_history(uuid) from public;
grant execute on function public.get_location_recovery_history(uuid) to anon, authenticated, service_role;
comment on function public.get_location_recovery_history(uuid) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: public remediation/recovery history projection intentionally exposing constrained proof metadata.';

revoke all on function public.get_public_qr_landing(text) from public;
grant execute on function public.get_public_qr_landing(text) to anon, authenticated, service_role;
comment on function public.get_public_qr_landing(text) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: intentional unauthenticated QR landing projection with constrained business/location output.';

revoke all on function public.map_network_nearby_v2(double precision,double precision,integer,integer,text,text,text[]) from public;
grant execute on function public.map_network_nearby_v2(double precision,double precision,integer,integer,text,text,text[]) to anon, authenticated, service_role;
comment on function public.map_network_nearby_v2(double precision,double precision,integer,integer,text,text,text[]) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: public map projection requiring private business joins; output is the reviewed mobile/map contract.';

revoke all on function public.mobile_location_detail_v1(uuid) from public;
grant execute on function public.mobile_location_detail_v1(uuid) to anon, authenticated, service_role;
comment on function public.mobile_location_detail_v1(uuid) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: public sanitized canonical location detail projection; private owner fields are explicitly omitted.';

revoke all on function public.mobile_location_review_evidence(uuid,integer) from public;
grant execute on function public.mobile_location_review_evidence(uuid,integer) to anon, authenticated, service_role;
comment on function public.mobile_location_review_evidence(uuid,integer) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: public evidence summary limited to published reviews while raw check-in evidence remains private.';

revoke all on function public.mobile_location_trust_summaries(uuid[]) from public;
grant execute on function public.mobile_location_trust_summaries(uuid[]) to anon, authenticated, service_role;
comment on function public.mobile_location_trust_summaries(uuid[]) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: public aggregate trust summary for requested locations; raw verification/check-in rows remain private.';

revoke all on function public.mobile_review_evidence(uuid) from public;
grant execute on function public.mobile_review_evidence(uuid) to anon, authenticated, service_role;
comment on function public.mobile_review_evidence(uuid) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: public evidence projection for a published review; private raw evidence remains inaccessible.';

revoke all on function public.mobile_review_photos_for_reviews(uuid[]) from public;
grant execute on function public.mobile_review_photos_for_reviews(uuid[]) to anon, authenticated, service_role;
comment on function public.mobile_review_photos_for_reviews(uuid[]) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: public photo metadata projection limited to published reviews.';

create or replace function public.kleenest_public_security_definer_drift()
returns table(function_name text, identity_arguments text, owner_name text, review_comment text)
language sql
stable
security invoker
set search_path=''
as $$
  select
    p.proname::text,
    pg_get_function_identity_arguments(p.oid)::text,
    pg_get_userbyid(p.proowner)::text,
    obj_description(p.oid,'pg_proc')::text
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and has_function_privilege('anon',p.oid,'EXECUTE')
    and coalesce(obj_description(p.oid,'pg_proc'),'')
      not like 'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER:%'
  order by p.proname,pg_get_function_identity_arguments(p.oid)
$$;

revoke all on function public.kleenest_public_security_definer_drift()
  from public, anon, authenticated;
grant execute on function public.kleenest_public_security_definer_drift()
  to service_role;

create or replace function public.assert_kleenest_public_security_definer_allowlist()
returns void
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_drift jsonb;
begin
  select jsonb_agg(to_jsonb(d) order by d.function_name,d.identity_arguments)
  into v_drift
  from public.kleenest_public_security_definer_drift() d;

  if v_drift is not null then
    raise exception 'Unreviewed anonymous SECURITY DEFINER function(s) detected'
      using detail=v_drift::text;
  end if;
end
$$;

revoke all on function public.assert_kleenest_public_security_definer_allowlist()
  from public, anon, authenticated;
grant execute on function public.assert_kleenest_public_security_definer_allowlist()
  to service_role;
