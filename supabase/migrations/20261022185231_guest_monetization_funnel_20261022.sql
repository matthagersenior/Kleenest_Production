-- Guest monetization diagnostics (not a billable ad ledger).
-- Anonymous impressions and clicks are client-reported, untrusted, privacy-limited signals.
create table if not exists private.guest_monetization_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null check (session_id ~ '^[a-zA-Z0-9-]{20,80}$'),
  visitor_key text not null check (visitor_key ~ '^[a-zA-Z0-9-]{18,140}$'),
  event_type text not null check (event_type in (
    'sponsored_impression','sponsored_click','sponsored_dismiss',
    'network_slot_missing_config','network_request_attempt','network_impression','network_no_fill',
    'install_upsell_view','install_upsell_click','upgrade_intent'
  )),
  placement_code text,
  campaign_id uuid,
  source text,
  created_at timestamptz not null default now()
);
create table if not exists private.guest_monetization_housekeeping (
  singleton boolean primary key default true check (singleton),
  last_pruned_at timestamptz not null default now()
);
insert into private.guest_monetization_housekeeping(singleton)
values(true) on conflict(singleton) do nothing;
revoke all on private.guest_monetization_housekeeping from public,anon,authenticated;
grant select,update on private.guest_monetization_housekeeping to service_role;
alter table private.guest_monetization_events enable row level security;
revoke all on private.guest_monetization_events from public,anon,authenticated;
grant select,insert,delete on private.guest_monetization_events to service_role;
create index if not exists guest_monetization_created_idx on private.guest_monetization_events(created_at desc);
create index if not exists guest_monetization_session_created_idx on private.guest_monetization_events(session_id,created_at desc);

create or replace function public.record_guest_monetization_event(
 p_session_id text, p_visitor_key text, p_event_type text,
 p_placement_code text default null, p_campaign_id uuid default null,
 p_source text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_event text:=lower(trim(coalesce(p_event_type,'')));
  v_placement text:=nullif(lower(trim(coalesce(p_placement_code,''))),'');
  v_source text:=nullif(left(lower(trim(coalesce(p_source,''))),40),'');
begin
  -- Registered accounts use the existing authenticated sponsor ledger.
  if auth.uid() is not null and exists (
    select 1 from auth.users u where u.id=auth.uid() and not coalesce(u.is_anonymous,false)
  ) then return; end if;
  if p_session_id is null or p_session_id !~ '^[a-zA-Z0-9-]{20,80}$'
      or p_visitor_key is null or p_visitor_key !~ '^[a-zA-Z0-9-]{18,140}$' then
    raise exception 'invalid guest session' using errcode='22023';
  end if;
  if v_event not in (
    'sponsored_impression','sponsored_click','sponsored_dismiss',
    'network_slot_missing_config','network_request_attempt','network_impression','network_no_fill',
    'install_upsell_view','install_upsell_click','upgrade_intent'
  ) then raise exception 'invalid guest monetization event' using errcode='22023'; end if;
  if v_placement is not null and v_placement !~ '^[a-z0-9_-]{1,80}$' then
    raise exception 'invalid ad placement' using errcode='22023';
  end if;
  if v_event like 'sponsored_%' then
    if p_campaign_id is null or v_placement is null or not exists (
      select 1 from public.sponsored_campaign_placements cp
      join public.sponsored_campaigns c on c.id=cp.campaign_id
      join public.ad_placements p on p.placement_code=cp.placement_code
      where cp.campaign_id=p_campaign_id and cp.placement_code=v_placement
        and p.active and p.owner_enabled and c.status='active'
    ) then raise exception 'invalid sponsored placement' using errcode='22023'; end if;
  elsif v_event like 'network_%' then
    if p_campaign_id is not null or v_placement is null or not exists(
      select 1 from public.network_ad_placements p where p.placement_code=v_placement
    ) then raise exception 'invalid network ad placement' using errcode='22023'; end if;
  elsif p_campaign_id is not null or v_placement is not null then
    raise exception 'unexpected placement for conversion event' using errcode='22023';
  end if;
  -- Client telemetry can be forged: never bill a sponsor on these events.
  if (select count(*) from private.guest_monetization_events e
      where e.session_id=p_session_id and e.created_at>now()-interval '1 minute')>=45 then return; end if;
  if exists(select 1 from private.guest_monetization_events e
      where e.session_id=p_session_id and e.event_type=v_event
        and e.placement_code is not distinct from v_placement
        and e.campaign_id is not distinct from p_campaign_id
        and e.created_at>now()-interval '60 seconds') then return; end if;
  insert into private.guest_monetization_events(session_id,visitor_key,event_type,placement_code,campaign_id,source)
  values(p_session_id,p_visitor_key,v_event,v_placement,p_campaign_id,v_source);
  -- Batched retention once per day, piggybacking on active guest traffic.
  update private.guest_monetization_housekeeping
  set last_pruned_at=now()
  where singleton and last_pruned_at<now()-interval '1 day';
  if found then
    delete from private.guest_monetization_events
    where created_at<now()-interval '30 days';
  end if;
end;
$$;
revoke all on function public.record_guest_monetization_event(text,text,text,text,uuid,text) from public;
grant execute on function public.record_guest_monetization_event(text,text,text,text,uuid,text) to anon,authenticated,service_role;

create or replace function public.owner_guest_monetization_snapshot(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_days integer:=greatest(1,least(coalesce(p_days,7),30));
  v_since timestamptz;
  v_guest jsonb;
  v_events jsonb;
  v_native jsonb;
  v_sponsored jsonb;
  v_purchases jsonb;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  v_since:=now()-make_interval(days=>v_days);
  select jsonb_build_object(
    'sessions',count(distinct e.session_id),
    'visitor_keys',count(distinct e.visitor_key),
    'install_intents',count(*) filter(where e.event_name='install_intent'),
    'install_successes',count(*) filter(where e.event_name='install_success')
  ) into v_guest from private.guest_journey_events e where e.occurred_at>=v_since;
  select jsonb_build_object(
    'network_request_attempts',count(*) filter(where e.event_type='network_request_attempt'),
    'network_impressions',count(*) filter(where e.event_type='network_impression'),
    'web_missing_config',count(*) filter(where e.event_type='network_slot_missing_config'),
    'network_no_fills',count(*) filter(where e.event_type='network_no_fill'),
    'sponsored_impressions',count(*) filter(where e.event_type='sponsored_impression'),
    'sponsored_clicks',count(*) filter(where e.event_type='sponsored_click'),
    'install_upsell_views',count(*) filter(where e.event_type='install_upsell_view'),
    'install_upsell_clicks',count(*) filter(where e.event_type='install_upsell_click'),
    'upgrade_intents',count(*) filter(where e.event_type='upgrade_intent'),
    'sessions_with_signals',count(distinct e.session_id)
  ) into v_events from private.guest_monetization_events e where e.created_at>=v_since;
  select jsonb_build_object(
    'requests',count(*) filter(where e.event_type='request'),
    'fills',count(*) filter(where e.event_type='fill'),
    'impressions',count(*) filter(where e.event_type='impression'),
    'paid_callbacks',count(*) filter(where e.event_type='paid'),
    'last_event_at',max(e.created_at)
  ) into v_native from public.admob_telemetry_events e where e.created_at>=v_since;
  select jsonb_build_object(
    'authenticated_impressions',count(*) filter(where e.event_type='impression'),
    'authenticated_clicks',count(*) filter(where e.event_type='click')
  ) into v_sponsored from public.sponsored_events e where e.created_at>=v_since;
  select jsonb_build_object(
    'verified_store_purchases',count(*)
  ) into v_purchases from public.mobile_store_purchases p where p.verified_at>=v_since;
  return jsonb_build_object(
    'days',v_days,'updated_at',now(),'guest',v_guest,'guest_ad_diagnostics',v_events,
    'native_admob',v_native,'authenticated_sponsorship',v_sponsored,'purchases',v_purchases,
    'measurement_note','Guest ad signals are client-reported diagnostics, not verified ad deliveries or billable revenue. Native AdMob telemetry and store purchases are platform totals, not attributable to guests. Revenue must be reconciled from the ad network or payment provider.'
  );
end;
$$;
revoke all on function public.owner_guest_monetization_snapshot(integer) from public,anon;
grant execute on function public.owner_guest_monetization_snapshot(integer) to authenticated,service_role;

comment on table private.guest_monetization_events is 'Pseudonymous short-lived client-reported guest monetization diagnostics; never a billable impression ledger.';
