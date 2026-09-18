create or replace function public.get_location_trust_state(p_location_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare r record; v_age_days numeric; v_freshness numeric; v_status text; v_due timestamptz; v_conf numeric; v_last_verified timestamptz;
begin
  if p_location_id is null then raise exception 'location is required'; end if;
  select lc.location_id,lc.score confidence_score,lc.level confidence_level,lc.verification_count,lc.review_count,lc.last_verified_at,lc.freshness_score,lc.staleness_status,lc.reverification_due_at,lc.freshness_computed_at,lc.factors into r from public.location_confidence lc where lc.location_id=p_location_id;
  if not found or r.freshness_computed_at < now()-interval '1 hour' then return public.refresh_location_trust_state(p_location_id); end if;
  return to_jsonb(r);
end $function$;
grant execute on function public.get_location_trust_state(uuid) to authenticated;
revoke execute on function public.get_location_trust_state(uuid) from anon;
