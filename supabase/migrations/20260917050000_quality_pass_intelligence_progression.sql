-- Kleenest 1.0 quality-pass intelligence extensions.
-- These projections intentionally reuse progression_events_v2, consumer_progression_world,
-- consumer_nearby_progression_opportunities, canonical route plans and the existing Owner
-- capability control plane. No parallel XP, League, mission, route or control authority is created.

create table if not exists public.location_trust_watches (
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_notified_at timestamptz,
  last_fingerprint text,
  last_snapshot jsonb not null default '{}'::jsonb,
  primary key (user_id, location_id)
);

create index if not exists location_trust_watches_location_idx on public.location_trust_watches(location_id);
alter table public.location_trust_watches enable row level security;

drop policy if exists location_trust_watches_select_own on public.location_trust_watches;
create policy location_trust_watches_select_own on public.location_trust_watches for select to authenticated using (user_id=auth.uid());
drop policy if exists location_trust_watches_insert_own on public.location_trust_watches;
create policy location_trust_watches_insert_own on public.location_trust_watches for insert to authenticated with check (user_id=auth.uid());
drop policy if exists location_trust_watches_update_own on public.location_trust_watches;
create policy location_trust_watches_update_own on public.location_trust_watches for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists location_trust_watches_delete_own on public.location_trust_watches;
create policy location_trust_watches_delete_own on public.location_trust_watches for delete to authenticated using (user_id=auth.uid());

grant select,insert,update,delete on public.location_trust_watches to authenticated;

create or replace function public.location_trust_snapshot(p_location_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare v_now jsonb;
begin
  v_now:=public.location_kleenest_now(p_location_id);
  return jsonb_build_object(
    'freshness_label',coalesce(v_now->>'freshness_label','unknown'),
    'freshness_score',coalesce((v_now->>'freshness_score')::numeric,0),
    'confidence_level',coalesce(v_now->>'confidence_level','unknown'),
    'confidence_score',coalesce((v_now->>'confidence_score')::numeric,0),
    'recent_conflicts',coalesce((v_now->>'recent_conflicts')::integer,0),
    'bathroom_status',coalesce(v_now->>'bathroom_status','unknown'),
    'availability',coalesce(v_now->>'availability','unknown'),
    'service_event',coalesce(v_now->'latest_service'->>'event_kind','none'),
    'freshness_at',v_now->>'freshness_at'
  );
end;
$$;

create or replace function public.location_intelligence_explanation(p_location_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_location public.locations;
  v_now jsonb;
  v_recent jsonb;
  v_sources jsonb;
  v_watched boolean:=false;
begin
  select * into v_location from public.locations where id=p_location_id and is_active is distinct from false;
  if not found then raise exception 'Location not found'; end if;
  v_now:=public.location_kleenest_now(p_location_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind',e.evidence_kind,
    'provenance',e.provenance,
    'observed_at',e.observed_at,
    'confidence',e.confidence,
    'source_type',e.source_type
  ) order by e.observed_at desc),'[]'::jsonb)
  into v_recent
  from (select evidence_kind,provenance,observed_at,confidence,source_type from public.kleenest_evidence_events where location_id=p_location_id order by observed_at desc limit 12) e;

  select coalesce(jsonb_object_agg(q.provenance,q.total),'{}'::jsonb)
  into v_sources
  from (select coalesce(provenance,'unknown') provenance,count(*) total from public.kleenest_evidence_events where location_id=p_location_id group by coalesce(provenance,'unknown')) q;

  if auth.uid() is not null then
    select exists(select 1 from public.location_trust_watches w where w.user_id=auth.uid() and w.location_id=p_location_id) into v_watched;
  end if;

  return jsonb_build_object(
    'location',jsonb_build_object('id',v_location.id,'name',v_location.name,'address',v_location.address,'city',v_location.city,'state',v_location.state),
    'now',v_now,
    'rationale',jsonb_build_array(
      format('Freshness is %s%% and is currently driven by %s.',coalesce(v_now->>'freshness_score','0'),replace(coalesce(v_now->>'freshness_provenance','inferred'),'_',' ')),
      format('Confidence is %s%% with %s independent confirmation(s).',coalesce(v_now->>'confidence_score','0'),coalesce(v_now->>'independent_confirmations','0')),
      case when coalesce((v_now->>'recent_conflicts')::integer,0)>0 then format('%s recent contradictory signal(s) are reducing certainty.',v_now->>'recent_conflicts') else 'No recent contradictory evidence is currently flagged.' end,
      'Claimed-business service can improve freshness, but it does not become an independent consumer confirmation.'
    ),
    'source_counts',v_sources,
    'recent_evidence',v_recent,
    'watched',v_watched,
    'generated_at',now()
  );
end;
$$;

create or replace function public.location_proof_card(p_location_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_location public.locations;
  v_now jsonb;
  v_amenities jsonb;
  v_age_days integer;
begin
  select * into v_location from public.locations where id=p_location_id and is_active is distinct from false;
  if not found then raise exception 'Location not found'; end if;
  v_now:=public.location_kleenest_now(p_location_id);
  select coalesce(jsonb_agg(a.name order by a.name),'[]'::jsonb) into v_amenities
  from public.location_amenities la join public.amenities a on a.id=la.amenity_id where la.location_id=p_location_id;
  v_age_days:=case when nullif(v_now->>'freshness_at','') is null then null else greatest(0,floor(extract(epoch from(now()-(v_now->>'freshness_at')::timestamptz))/86400)::integer) end;
  return jsonb_build_object(
    'version',1,
    'location_id',v_location.id,
    'name',v_location.name,
    'address',v_location.address,
    'city',v_location.city,
    'state',v_location.state,
    'freshness_score',v_now->'freshness_score',
    'freshness_label',v_now->>'freshness_label',
    'confidence_score',v_now->'confidence_score',
    'confidence_level',v_now->>'confidence_level',
    'freshness_provenance',v_now->>'freshness_provenance',
    'independent_confirmations',v_now->'independent_confirmations',
    'recent_conflicts',v_now->'recent_conflicts',
    'evidence_age_days',v_age_days,
    'bathroom_status',v_now->>'bathroom_status',
    'availability',v_now->>'availability',
    'amenities',v_amenities,
    'deep_link','kleenest://location/'||v_location.id::text,
    'share_text',format('%s on Kleenest · freshness %s%% · confidence %s%% · %s independent confirmation(s) · %s',v_location.name,coalesce(v_now->>'freshness_score','0'),coalesce(v_now->>'confidence_score','0'),coalesce(v_now->>'independent_confirmations','0'),'kleenest://location/'||v_location.id::text),
    'generated_at',now()
  );
end;
$$;

create or replace function public.consumer_location_trust_watch(p_location_id uuid,p_enabled boolean default true)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid();v_snapshot jsonb;v_fingerprint text;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if not exists(select 1 from public.locations where id=p_location_id and is_active is distinct from false) then raise exception 'Location not found'; end if;
  if not p_enabled then
    delete from public.location_trust_watches where user_id=v_user and location_id=p_location_id;
    return jsonb_build_object('location_id',p_location_id,'watched',false,'xp_awarded',0);
  end if;
  v_snapshot:=public.location_trust_snapshot(p_location_id);
  v_fingerprint:=md5(v_snapshot::text);
  insert into public.location_trust_watches(user_id,location_id,last_fingerprint,last_snapshot,updated_at)
  values(v_user,p_location_id,v_fingerprint,v_snapshot,now())
  on conflict(user_id,location_id) do update set updated_at=now();
  return jsonb_build_object('location_id',p_location_id,'watched',true,'xp_awarded',0,'snapshot',v_snapshot);
end;
$$;

create or replace function public.consumer_location_trust_changes(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_rows jsonb:='[]'::jsonb;
  r record;
  v_snapshot jsonb;
  v_fingerprint text;
  v_reasons text[];
begin
  if v_user is null then raise exception 'authentication required'; end if;
  for r in
    select w.location_id,w.last_fingerprint,w.last_snapshot,l.name,l.address
    from public.location_trust_watches w join public.locations l on l.id=w.location_id
    where w.user_id=v_user order by w.updated_at desc limit greatest(1,least(coalesce(p_limit,20),100))
  loop
    v_snapshot:=public.location_trust_snapshot(r.location_id);
    v_fingerprint:=md5(v_snapshot::text);
    if r.last_fingerprint is distinct from v_fingerprint then
      v_reasons:=array[]::text[];
      if r.last_snapshot->>'freshness_label' is distinct from v_snapshot->>'freshness_label' then v_reasons:=array_append(v_reasons,'freshness changed'); end if;
      if r.last_snapshot->>'confidence_level' is distinct from v_snapshot->>'confidence_level' then v_reasons:=array_append(v_reasons,'confidence changed'); end if;
      if r.last_snapshot->>'recent_conflicts' is distinct from v_snapshot->>'recent_conflicts' then v_reasons:=array_append(v_reasons,'contradiction signal changed'); end if;
      if r.last_snapshot->>'bathroom_status' is distinct from v_snapshot->>'bathroom_status' then v_reasons:=array_append(v_reasons,'bathroom status changed'); end if;
      if r.last_snapshot->>'availability' is distinct from v_snapshot->>'availability' then v_reasons:=array_append(v_reasons,'access or availability changed'); end if;
      if r.last_snapshot->>'service_event' is distinct from v_snapshot->>'service_event' then v_reasons:=array_append(v_reasons,'service status changed'); end if;
      if cardinality(v_reasons)>0 then
        v_rows:=v_rows||jsonb_build_array(jsonb_build_object('location_id',r.location_id,'name',r.name,'address',r.address,'changes',to_jsonb(v_reasons),'previous',r.last_snapshot,'current',v_snapshot,'changed_at',now()));
      end if;
      update public.location_trust_watches set last_fingerprint=v_fingerprint,last_snapshot=v_snapshot,last_notified_at=case when cardinality(v_reasons)>0 then now() else last_notified_at end,updated_at=now() where user_id=v_user and location_id=r.location_id;
    end if;
  end loop;
  return v_rows;
end;
$$;

create or replace function public.consumer_route_confidence(p_route_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_route public.route_plans;
  v_total integer:=0;
  v_covered integer:=0;
  v_longest integer:=0;
  v_coverage numeric:=0;
  v_per_stop numeric:=0;
  v_gap_minutes numeric:=0;
  v_label text:='weak';
  v_stops jsonb:='[]'::jsonb;
  v_gap_location uuid;
  v_gap_name text;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_route from public.route_plans where id=p_route_id and user_id=v_user;
  if not found then raise exception 'Route not found'; end if;
  with base as(
    select rs.id,rs.stop_order,rs.location_id,l.name,public.location_kleenest_now(rs.location_id) n
    from public.route_stops rs join public.locations l on l.id=rs.location_id
    where rs.route_id=p_route_id order by rs.stop_order
  ),tagged as(
    select *,coalesce((n->>'freshness_score')::numeric,0)>=50 and coalesce((n->>'confidence_score')::numeric,0)>=40 and coalesce(n->>'bathroom_status','unknown')<>'no_bathroom' covered from base
  )
  select count(*),count(*) filter(where covered),coalesce(jsonb_agg(jsonb_build_object('stop_id',id,'stop_order',stop_order,'location_id',location_id,'name',name,'covered',covered,'kleenest_now',n) order by stop_order),'[]'::jsonb)
  into v_total,v_covered,v_stops from tagged;
  with t as(
    select rs.stop_order,(coalesce((public.location_kleenest_now(rs.location_id)->>'freshness_score')::numeric,0)>=50 and coalesce((public.location_kleenest_now(rs.location_id)->>'confidence_score')::numeric,0)>=40) covered
    from public.route_stops rs where rs.route_id=p_route_id
  ),g as(select *,sum(case when covered then 1 else 0 end) over(order by stop_order) grp from t),runs as(select count(*) n from g where not covered group by grp)
  select coalesce(max(n),0) into v_longest from runs;
  select rs.location_id,l.name into v_gap_location,v_gap_name
  from public.route_stops rs join public.locations l on l.id=rs.location_id
  where rs.route_id=p_route_id and not(coalesce((public.location_kleenest_now(rs.location_id)->>'freshness_score')::numeric,0)>=50 and coalesce((public.location_kleenest_now(rs.location_id)->>'confidence_score')::numeric,0)>=40)
  order by rs.stop_order limit 1;
  v_coverage:=case when v_total=0 then 0 else round(100.0*v_covered/v_total,1) end;
  v_per_stop:=case when v_total=0 then 0 else coalesce(v_route.estimated_minutes,0)::numeric/v_total end;
  v_gap_minutes:=round(v_longest*v_per_stop,1);
  v_label:=case when v_total=0 then 'unknown' when v_coverage>=75 and v_longest<=1 then 'strong' when v_coverage>=40 then 'mixed' else 'weak' end;
  return jsonb_build_object(
    'route_id',p_route_id,'confidence_label',v_label,'coverage_pct',v_coverage,'trusted_stop_count',v_covered,'total_stops',v_total,
    'longest_uncovered_stops',v_longest,'longest_uncovered_minutes_estimate',v_gap_minutes,
    'rationale',case when v_label='strong' then 'Most planned stops have current, independently supported restroom evidence.' when v_label='mixed' then 'The route has useful restroom support, but one or more gaps need fresher or stronger evidence.' when v_label='weak' then 'Too much of this route lacks current, independently supported restroom evidence.' else 'Add route stops to calculate restroom coverage confidence.' end,
    'coverage_mission',case when v_gap_location is null then null else jsonb_build_object('kind','route_gap_verification','location_id',v_gap_location,'name',v_gap_name,'title','Close this route coverage gap','detail','Verify this stop through the existing contribution flow. If the evidence qualifies, its awarded XP feeds progression and League standing.','mission_action','reverify_stale','mission_value',1,'xp_suggestion',30) end,
    'stops',v_stops,'generated_at',now()
  );
end;
$$;

create or replace function public.consumer_nearby_progression_opportunities(p_lat double precision,p_lon double precision,p_radius_m integer default 5000)
returns jsonb
language sql
stable
set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id','coverage:'||l.id::text,
    'location_id',l.id,'name',l.name,'address',l.address,'latitude',l.latitude,'longitude',l.longitude,
    'kind',case when coalesce(l.bathroom_verification_count,0)=0 then 'coverage_verification' when l.bathroom_verified_at is null or l.bathroom_verified_at<now()-interval '180 days' then 'freshness_recheck' when l.amenity_count=0 then 'amenity_confirmation' else 'coverage_verification' end,
    'title',case when coalesce(l.bathroom_verification_count,0)=0 then 'Verify restroom coverage' when l.bathroom_verified_at is null or l.bathroom_verified_at<now()-interval '180 days' then 'Refresh stale evidence' when l.amenity_count=0 then 'Confirm restroom amenities' else 'Strengthen coverage evidence' end,
    'detail',case when coalesce(l.bathroom_verification_count,0)=0 then 'This place is on the map but still needs a real restroom verification.' when l.bathroom_verified_at is null or l.bathroom_verified_at<now()-interval '180 days' then 'This place has aging verification and is ready for a fresh independent recheck.' when l.amenity_count=0 then 'The restroom is known, but practical amenity coverage is still incomplete.' else 'Another qualified independent contribution can strengthen network confidence.' end,
    'xp_suggestion',case when coalesce(l.bathroom_verification_count,0)=0 then 35 when l.bathroom_verified_at is null or l.bathroom_verified_at<now()-interval '180 days' then 30 when l.amenity_count=0 then 20 else 15 end,
    'mission_action',case when coalesce(l.bathroom_verification_count,0)=0 then 'verify_location' when l.bathroom_verified_at is null or l.bathroom_verified_at<now()-interval '180 days' then 'reverify_stale' when l.amenity_count=0 then 'add_amenity' else 'helpful_contribution' end,
    'mission_value',1,
    'metadata',jsonb_build_object('progression_authority','progression_events_v2','league_effect','Only awarded evidence XP counts toward League standing.','trust_effect','Contributor Trust changes only when the evidence qualifies.'),
    'distance_m',round((111320*sqrt(power(l.latitude-p_lat,2)+power((l.longitude-p_lon)*cos(radians(p_lat)),2)))::numeric,0)
  ) order by power(l.latitude-p_lat,2)+power(l.longitude-p_lon,2)),'[]'::jsonb)
  from (
    select x.*,(select count(*) from public.location_amenities la where la.location_id=x.id) amenity_count
    from public.locations x
    where x.is_active is distinct from false and x.latitude is not null and x.longitude is not null
      and 111320*sqrt(power(x.latitude-p_lat,2)+power((x.longitude-p_lon)*cos(radians(p_lat)),2))<=p_radius_m
    order by power(x.latitude-p_lat,2)+power(x.longitude-p_lon,2) limit 30
  ) l;
$$;

-- consumer_progression_world remains the single League/trust world projection. Coverage Missions
-- are nearby progression opportunities whose qualified completion is awarded through the existing
-- progression_events_v2 ledger; this deliberately avoids a second mission or League authority.
comment on function public.consumer_progression_world() is 'Canonical Progression World. Coverage Missions enter through consumer_nearby_progression_opportunities and existing evidence-backed actions; progression_events_v2 remains the XP/League ledger and Contributor Trust remains evidence-capped.';

create or replace function public.owner_product_truth()
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare v_latest public.capability_audit_runs;v_changed jsonb;v_degraded jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'Platform owner access required'; end if;
  select * into v_latest from public.capability_audit_runs order by executed_at desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('feature_code',f.feature_code,'name',f.name,'enabled',f.enabled,'updated_at',f.updated_at) order by f.updated_at desc),'[]'::jsonb)
  into v_changed from (select feature_code,name,enabled,updated_at from public.feature_catalog where updated_at>=now()-interval '24 hours' order by updated_at desc limit 50) f;
  select coalesce(jsonb_agg(jsonb_build_object('feature_code',c.feature_code,'name',c.name,'blocked_events',c.blocked_events,'allowed_events',c.allowed_events,'access_events',c.access_events) order by c.blocked_events desc),'[]'::jsonb)
  into v_degraded from (select * from public.capability_coverage_rollup where feature_enabled and access_events>0 and blocked_events>allowed_events order by blocked_events desc limit 40) c;
  return jsonb_build_object(
    'counts',jsonb_build_object(
      'live_enabled',(select count(*) from public.capability_coverage_rollup where feature_enabled),
      'hidden_disabled',(select count(*) from public.capability_coverage_rollup where not feature_enabled),
      'insufficient_data',(select count(*) from public.capability_coverage_rollup where feature_enabled and access_events=0),
      'degraded_failing',(select count(*) from public.capability_coverage_rollup where feature_enabled and access_events>0 and blocked_events>allowed_events)
    ),
    'latest_audit',case when v_latest.id is null then null else jsonb_build_object('id',v_latest.id,'executed_at',v_latest.executed_at,'source',v_latest.source,'domain_count',v_latest.domain_count,'issue_count',v_latest.issue_count,'duplicate_domain_count',v_latest.duplicate_domain_count,'uncovered_rpc_count',v_latest.uncovered_rpc_count) end,
    'changed_24h',v_changed,
    'degraded',v_degraded,
    'generated_at',now()
  );
end;
$$;

revoke all on function public.location_trust_snapshot(uuid) from public;
revoke all on function public.consumer_location_trust_watch(uuid,boolean) from public;
revoke all on function public.consumer_location_trust_changes(integer) from public;
revoke all on function public.consumer_route_confidence(uuid) from public;
revoke all on function public.owner_product_truth() from public;
grant execute on function public.location_intelligence_explanation(uuid) to anon,authenticated;
grant execute on function public.location_proof_card(uuid) to anon,authenticated;
grant execute on function public.consumer_location_trust_watch(uuid,boolean) to authenticated;
grant execute on function public.consumer_location_trust_changes(integer) to authenticated;
grant execute on function public.consumer_route_confidence(uuid) to authenticated;
grant execute on function public.owner_product_truth() to authenticated;
grant execute on function public.consumer_nearby_progression_opportunities(double precision,double precision,integer) to authenticated;
