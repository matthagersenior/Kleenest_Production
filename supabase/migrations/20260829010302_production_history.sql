create or replace function public.refresh_location_trust_state(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare c record; v_age_days numeric; v_freshness numeric; v_status text; v_due timestamptz; v_conf numeric; v_last_verified timestamptz;
begin
  if p_location_id is null then raise exception 'location is required'; end if;
  select lc.*, l.id as canonical_id into c from public.locations l left join public.location_confidence lc on lc.location_id=l.id where l.id=p_location_id;
  if not found then raise exception 'location not found'; end if;
  select greatest(
    (select max(observed_at) from public.location_verification_observations where location_id=p_location_id and is_public=true),
    (select max(created_at) from public.location_bathroom_verifications where location_id=p_location_id),
    (select max(observed_at) from public.location_quality_observations where location_id=p_location_id),
    (select max(created_at) from public.restroom_observations where location_id=p_location_id),
    (select max(checked_in_at) from public.check_ins where location_id=p_location_id and verification_method in ('gps','qr','place')),
    (select max(observed_at) from public.location_sources where location_id=p_location_id),
    (select max(observed_at) from public.external_observations where location_id=p_location_id)
  ) into v_last_verified;
  v_age_days := case when v_last_verified is null then 9999 else greatest(0,extract(epoch from (now()-v_last_verified))/86400) end;
  v_freshness := case when v_last_verified is null then 0 when v_age_days<=7 then 100 when v_age_days<=30 then round(100-((v_age_days-7)/23)*20,2) when v_age_days<=90 then round(80-((v_age_days-30)/60)*35,2) when v_age_days<=180 then round(45-((v_age_days-90)/90)*30,2) else greatest(0,round(15-least(15,(v_age_days-180)/30),2)) end;
  v_status := case when v_last_verified is null then 'unknown' when v_age_days<=7 then 'fresh' when v_age_days<=30 then 'recent' when v_age_days<=90 then 'aging' when v_age_days<=180 then 'stale' else 'very_stale' end;
  v_due := case when v_last_verified is null then now() else v_last_verified + case when v_status in ('fresh','recent') then interval '30 days' when v_status='aging' then interval '14 days' else interval '3 days' end end;
  v_conf := coalesce(c.score,0);
  insert into public.location_confidence(location_id,score,level,verification_count,positive_verifications,negative_verifications,source_count,review_count,last_verified_at,computed_at,factors,freshness_score,staleness_status,reverification_due_at,freshness_computed_at)
  values(p_location_id,v_conf,coalesce(c.level,'unknown'),coalesce(c.verification_count,0),coalesce(c.positive_verifications,0),coalesce(c.negative_verifications,0),coalesce(c.source_count,0),coalesce(c.review_count,0),v_last_verified,now(),coalesce(c.factors,'{}'::jsonb)||jsonb_build_object('freshness_score',v_freshness,'staleness_status',v_status,'reverification_due_at',v_due,'freshness_age_days',v_age_days,'freshness_source','authoritative_verified_evidence_clock'),v_freshness,v_status,v_due,now())
  on conflict(location_id) do update set last_verified_at=excluded.last_verified_at,computed_at=now(),factors=excluded.factors,freshness_score=excluded.freshness_score,staleness_status=excluded.staleness_status,reverification_due_at=excluded.reverification_due_at,freshness_computed_at=now();
  return jsonb_build_object('location_id',p_location_id,'confidence_score',v_conf,'freshness_score',v_freshness,'staleness_status',v_status,'last_verified_at',v_last_verified,'reverification_due_at',v_due,'freshness_age_days',round(v_age_days,2));
end $function$;

grant execute on function public.refresh_location_trust_state(uuid) to authenticated;
revoke execute on function public.refresh_location_trust_state(uuid) from anon;
