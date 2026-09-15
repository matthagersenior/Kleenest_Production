create table if not exists public.organic_hero_policies (
  surface_code text primary key,
  active boolean not null default true,
  max_cards smallint not null default 5 check (max_cards between 1 and 8),
  allowed_kinds text[] not null default array['review_ready','active_mission','fresh_kleenest','saved_choice','top_ranked','next_objective','find_bathroom']::text[],
  weights jsonb not null default '{"review_ready":100,"active_mission":95,"fresh_kleenest":88,"saved_choice":80,"top_ranked":75,"next_objective":70,"find_bathroom":60}'::jsonb,
  swipe_enabled boolean not null default true,
  dot_indicators boolean not null default true,
  autoplay boolean not null default false,
  owner_notes text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organic_hero_no_paid_kinds check (
    not (allowed_kinds && array['sponsored','ad','advertisement','paid']::text[])
  )
);

alter table public.organic_hero_policies enable row level security;
revoke all on table public.organic_hero_policies from anon, authenticated;

insert into public.organic_hero_policies(surface_code,allowed_kinds,weights,max_cards)
values
 ('consumer_home',array['review_ready','active_mission','fresh_kleenest','saved_choice','top_ranked','next_objective','find_bathroom']::text[],'{"review_ready":100,"active_mission":95,"fresh_kleenest":88,"saved_choice":80,"top_ranked":75,"next_objective":70,"find_bathroom":60}'::jsonb,5),
 ('consumer_saved',array['active_mission','saved_choice','top_ranked','next_objective']::text[],'{"active_mission":100,"saved_choice":90,"top_ranked":80,"next_objective":70}'::jsonb,4),
 ('consumer_progress',array['active_mission','next_objective','progression','season']::text[],'{"active_mission":100,"next_objective":95,"progression":85,"season":80}'::jsonb,4),
 ('consumer_community',array['community_update','ranking','season','saved_choice']::text[],'{"community_update":100,"ranking":90,"season":80,"saved_choice":70}'::jsonb,4),
 ('consumer_games',array['next_game','challenge','ranking','progression']::text[],'{"challenge":100,"next_game":90,"ranking":80,"progression":70}'::jsonb,4)
on conflict (surface_code) do nothing;

alter table public.ad_placements
  add column if not exists priority integer not null default 0,
  add column if not exists frequency_cap_daily integer not null default 3,
  add column if not exists format text not null default 'native_card',
  add column if not exists context_rules jsonb not null default '{}'::jsonb,
  add column if not exists owner_enabled boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table public.ad_placements drop constraint if exists ad_placements_not_hero_check;
alter table public.ad_placements add constraint ad_placements_not_hero_check check (
  position('hero' in lower(placement_code)) = 0
  and position('hero' in lower(slot)) = 0
);

insert into public.ad_placements(placement_code,surface,slot,active,eligible_tiers,priority,frequency_cap_daily,format,context_rules,owner_enabled)
values
 ('home_after_relevance','home','after_relevance',true,array['free']::text[],90,2,'native_card','{"contextual":true}'::jsonb,true),
 ('progress_between_sections','progress','between_sections',true,array['free']::text[],60,2,'native_card','{"contextual":true}'::jsonb,true),
 ('game_center_between_groups','games','between_groups',true,array['free']::text[],60,2,'native_card','{"contextual":true}'::jsonb,true)
on conflict (placement_code) do update set
  surface=excluded.surface,
  slot=excluded.slot,
  active=excluded.active,
  eligible_tiers=excluded.eligible_tiers,
  priority=excluded.priority,
  frequency_cap_daily=excluded.frequency_cap_daily,
  format=excluded.format,
  context_rules=excluded.context_rules,
  owner_enabled=excluded.owner_enabled,
  updated_at=now();

create table if not exists public.sponsored_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sponsor_name text not null,
  label text not null default 'Sponsored',
  headline text not null,
  body text,
  cta_label text not null default 'Learn more',
  destination_url text not null,
  target_location_id uuid references public.locations(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','active','paused','ended')),
  starts_at timestamptz,
  ends_at timestamptz,
  targeting jsonb not null default '{}'::jsonb,
  frequency_cap_daily integer not null default 2 check (frequency_cap_daily between 1 and 20),
  impression_cap_total bigint,
  owner_priority integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sponsored_campaigns enable row level security;
revoke all on table public.sponsored_campaigns from anon, authenticated;

create table if not exists public.sponsored_campaign_placements (
  campaign_id uuid not null references public.sponsored_campaigns(id) on delete cascade,
  placement_code text not null references public.ad_placements(placement_code) on delete cascade,
  primary key(campaign_id,placement_code)
);
alter table public.sponsored_campaign_placements enable row level security;
revoke all on table public.sponsored_campaign_placements from anon, authenticated;

create table if not exists public.sponsored_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sponsored_campaigns(id) on delete cascade,
  placement_code text not null references public.ad_placements(placement_code) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('impression','click','dismiss')),
  context_class text,
  created_at timestamptz not null default now()
);
alter table public.sponsored_events enable row level security;
revoke all on table public.sponsored_events from anon, authenticated;
create index if not exists sponsored_events_user_campaign_day_idx on public.sponsored_events(user_id,campaign_id,created_at desc);
create index if not exists sponsored_events_campaign_type_idx on public.sponsored_events(campaign_id,event_type,created_at desc);

create table if not exists public.relevance_sponsorship_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_key text,
  previous_state jsonb,
  next_state jsonb,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.relevance_sponsorship_audit enable row level security;
revoke all on table public.relevance_sponsorship_audit from anon, authenticated;

create or replace function public.consumer_ads_enabled(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when p_user_id is null then true
    when p_user_id <> auth.uid() then true
    else not public.has_kleenest_premium()
  end;
$$;
revoke all on function public.consumer_ads_enabled(uuid) from public;
grant execute on function public.consumer_ads_enabled(uuid) to anon, authenticated;

create or replace function public.consumer_hero_policy(p_surface_code text default 'consumer_home')
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select jsonb_build_object(
      'surface_code',p.surface_code,
      'active',p.active,
      'max_cards',p.max_cards,
      'allowed_kinds',p.allowed_kinds,
      'weights',p.weights,
      'swipe_enabled',p.swipe_enabled,
      'dot_indicators',p.dot_indicators,
      'autoplay',p.autoplay
    )
    from public.organic_hero_policies p
    where p.surface_code=p_surface_code and p.active=true
  ), '{}'::jsonb);
$$;
revoke all on function public.consumer_hero_policy(text) from public;
grant execute on function public.consumer_hero_policy(text) to anon, authenticated;

create or replace function public.consumer_sponsored_cards(
  p_surface text,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_user uuid := auth.uid();
  v_ads_enabled boolean;
  v_result jsonb;
begin
  v_ads_enabled := public.consumer_ads_enabled(v_user);
  if not v_ads_enabled then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(item order by score desc, owner_priority desc),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'campaign_id',c.id,
      'placement_code',p.placement_code,
      'label',c.label,
      'sponsor_name',c.sponsor_name,
      'headline',c.headline,
      'body',c.body,
      'cta_label',c.cta_label,
      'destination_url',c.destination_url,
      'target_location_id',c.target_location_id
    ) as item,
    c.owner_priority,
    (
      case when c.targeting='{}'::jsonb then 1 else 0 end
      + case when c.targeting ? 'coarse_region' and c.targeting->>'coarse_region'=p_context->>'coarse_region' then 8 else 0 end
      + case when c.targeting ? 'route_context' and c.targeting->>'route_context'=p_context->>'route_context' then 6 else 0 end
      + case when c.targeting ? 'time_bucket' and c.targeting->>'time_bucket'=p_context->>'time_bucket' then 3 else 0 end
      + case when c.targeting ? 'amenities' and exists (
          select 1
          from jsonb_array_elements_text(coalesce(c.targeting->'amenities','[]'::jsonb)) a
          join jsonb_array_elements_text(coalesce(p_context->'amenities','[]'::jsonb)) b on a.value=b.value
        ) then 5 else 0 end
      + case when c.targeting ? 'broad_interests' and exists (
          select 1
          from jsonb_array_elements_text(coalesce(c.targeting->'broad_interests','[]'::jsonb)) a
          join jsonb_array_elements_text(coalesce(p_context->'broad_interests','[]'::jsonb)) b on a.value=b.value
        ) then 4 else 0 end
    ) as score
    from public.sponsored_campaigns c
    join public.sponsored_campaign_placements cp on cp.campaign_id=c.id
    join public.ad_placements p on p.placement_code=cp.placement_code
    where p.surface=p_surface
      and p.active=true and p.owner_enabled=true
      and c.status='active'
      and (c.starts_at is null or c.starts_at<=now())
      and (c.ends_at is null or c.ends_at>now())
      and (
        v_user is null
        or (
          select count(*)
          from public.sponsored_events e
          where e.user_id=v_user and e.campaign_id=c.id and e.event_type='impression'
            and e.created_at>=date_trunc('day',now())
        ) < least(c.frequency_cap_daily,p.frequency_cap_daily)
      )
      and (
        c.impression_cap_total is null
        or (
          select count(*) from public.sponsored_events e
          where e.campaign_id=c.id and e.event_type='impression'
        ) < c.impression_cap_total
      )
    order by score desc,c.owner_priority desc
    limit 3
  ) ranked;

  return coalesce(v_result,'[]'::jsonb);
end;
$$;
revoke all on function public.consumer_sponsored_cards(text,jsonb) from public;
grant execute on function public.consumer_sponsored_cards(text,jsonb) to anon, authenticated;

create or replace function public.record_sponsored_event(
  p_campaign_id uuid,
  p_placement_code text,
  p_event_type text,
  p_context_class text default null
)
returns void
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if p_event_type not in ('impression','click','dismiss') then
    raise exception 'invalid sponsored event type' using errcode='22023';
  end if;
  if auth.uid() is null then return; end if;
  insert into public.sponsored_events(campaign_id,placement_code,user_id,event_type,context_class)
  values(p_campaign_id,p_placement_code,auth.uid(),p_event_type,left(p_context_class,80));
end;
$$;
revoke all on function public.record_sponsored_event(uuid,text,text,text) from public;
grant execute on function public.record_sponsored_event(uuid,text,text,text) to authenticated;
grant insert on public.sponsored_events to authenticated;
create policy sponsored_events_insert_own on public.sponsored_events
for insert to authenticated
with check ((select auth.uid())=user_id);

create or replace function public.owner_relevance_sponsorship_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'hero_policies',coalesce((select jsonb_agg(to_jsonb(p) order by p.surface_code) from public.organic_hero_policies p),'[]'::jsonb),
    'placements',coalesce((select jsonb_agg(to_jsonb(a) order by a.surface,a.priority desc) from public.ad_placements a),'[]'::jsonb),
    'campaigns',coalesce((
      select jsonb_agg(
        to_jsonb(c) || jsonb_build_object(
          'placements',coalesce((select jsonb_agg(cp.placement_code) from public.sponsored_campaign_placements cp where cp.campaign_id=c.id),'[]'::jsonb),
          'impressions',(select count(*) from public.sponsored_events e where e.campaign_id=c.id and e.event_type='impression'),
          'clicks',(select count(*) from public.sponsored_events e where e.campaign_id=c.id and e.event_type='click')
        )
        order by c.updated_at desc
      )
      from public.sponsored_campaigns c
    ),'[]'::jsonb),
    'rules',jsonb_build_object(
      'hero_is_organic_only',true,
      'paid_can_change_trust',false,
      'sensitive_targeting_allowed',false,
      'allowed_targeting_keys',jsonb_build_array('coarse_region','route_context','amenities','time_bucket','broad_interests'),
      'premium_removes_sponsored',true
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.owner_relevance_sponsorship_snapshot() from public;
grant execute on function public.owner_relevance_sponsorship_snapshot() to authenticated;

create or replace function public.owner_upsert_hero_policy(
  p_surface_code text,
  p_active boolean,
  p_max_cards integer,
  p_allowed_kinds text[],
  p_weights jsonb,
  p_swipe_enabled boolean,
  p_dot_indicators boolean,
  p_autoplay boolean,
  p_owner_notes text default null,
  p_reason text default 'KleenestOS organic relevance update'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_before jsonb; v_after jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  if p_allowed_kinds && array['sponsored','ad','advertisement','paid']::text[] then
    raise exception 'paid content cannot be configured as an organic hero' using errcode='22023';
  end if;
  select to_jsonb(p) into v_before from public.organic_hero_policies p where p.surface_code=p_surface_code;
  insert into public.organic_hero_policies(surface_code,active,max_cards,allowed_kinds,weights,swipe_enabled,dot_indicators,autoplay,owner_notes,updated_by,updated_at)
  values(p_surface_code,p_active,greatest(1,least(p_max_cards,8)),p_allowed_kinds,coalesce(p_weights,'{}'::jsonb),p_swipe_enabled,p_dot_indicators,p_autoplay,p_owner_notes,auth.uid(),now())
  on conflict(surface_code) do update set active=excluded.active,max_cards=excluded.max_cards,allowed_kinds=excluded.allowed_kinds,weights=excluded.weights,swipe_enabled=excluded.swipe_enabled,dot_indicators=excluded.dot_indicators,autoplay=excluded.autoplay,owner_notes=excluded.owner_notes,updated_by=auth.uid(),updated_at=now();
  select to_jsonb(p) into v_after from public.organic_hero_policies p where p.surface_code=p_surface_code;
  insert into public.relevance_sponsorship_audit(actor_user_id,action,entity_type,entity_key,previous_state,next_state,reason)
  values(auth.uid(),'upsert','hero_policy',p_surface_code,v_before,v_after,p_reason);
  return v_after;
end;
$$;
revoke all on function public.owner_upsert_hero_policy(text,boolean,integer,text[],jsonb,boolean,boolean,boolean,text,text) from public;
grant execute on function public.owner_upsert_hero_policy(text,boolean,integer,text[],jsonb,boolean,boolean,boolean,text,text) to authenticated;

create or replace function public.owner_upsert_ad_placement(
  p_placement_code text,
  p_surface text,
  p_slot text,
  p_active boolean,
  p_priority integer,
  p_frequency_cap_daily integer,
  p_format text,
  p_context_rules jsonb,
  p_owner_enabled boolean,
  p_reason text default 'KleenestOS sponsored placement update'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_before jsonb; v_after jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  if position('hero' in lower(p_placement_code))>0 or position('hero' in lower(p_slot))>0 then
    raise exception 'sponsored inventory cannot occupy hero placement' using errcode='22023';
  end if;
  select to_jsonb(a) into v_before from public.ad_placements a where a.placement_code=p_placement_code;
  insert into public.ad_placements(placement_code,surface,slot,active,eligible_tiers,priority,frequency_cap_daily,format,context_rules,owner_enabled,updated_at)
  values(p_placement_code,p_surface,p_slot,p_active,array['free']::text[],p_priority,greatest(1,least(p_frequency_cap_daily,20)),p_format,coalesce(p_context_rules,'{}'::jsonb),p_owner_enabled,now())
  on conflict(placement_code) do update set surface=excluded.surface,slot=excluded.slot,active=excluded.active,priority=excluded.priority,frequency_cap_daily=excluded.frequency_cap_daily,format=excluded.format,context_rules=excluded.context_rules,owner_enabled=excluded.owner_enabled,updated_at=now();
  select to_jsonb(a) into v_after from public.ad_placements a where a.placement_code=p_placement_code;
  insert into public.relevance_sponsorship_audit(actor_user_id,action,entity_type,entity_key,previous_state,next_state,reason)
  values(auth.uid(),'upsert','ad_placement',p_placement_code,v_before,v_after,p_reason);
  return v_after;
end;
$$;
revoke all on function public.owner_upsert_ad_placement(text,text,text,boolean,integer,integer,text,jsonb,boolean,text) from public;
grant execute on function public.owner_upsert_ad_placement(text,text,text,boolean,integer,integer,text,jsonb,boolean,text) to authenticated;

create or replace function public.owner_upsert_sponsored_campaign(
  p_campaign_id uuid,
  p_name text,
  p_sponsor_name text,
  p_headline text,
  p_body text,
  p_cta_label text,
  p_destination_url text,
  p_target_location_id uuid,
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_targeting jsonb,
  p_frequency_cap_daily integer,
  p_impression_cap_total bigint,
  p_owner_priority integer,
  p_placement_codes text[],
  p_reason text default 'KleenestOS sponsored campaign update'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid := coalesce(p_campaign_id,gen_random_uuid());
  v_before jsonb;
  v_after jsonb;
  v_bad_key text;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  if p_status not in ('draft','active','paused','ended') then raise exception 'invalid campaign status' using errcode='22023'; end if;
  select key into v_bad_key
  from jsonb_object_keys(coalesce(p_targeting,'{}'::jsonb)) key
  where key not in ('coarse_region','route_context','amenities','time_bucket','broad_interests')
  limit 1;
  if v_bad_key is not null then raise exception 'sensitive or unsupported targeting key: %',v_bad_key using errcode='22023'; end if;
  if exists (
    select 1 from public.ad_placements a
    where a.placement_code=any(coalesce(p_placement_codes,array[]::text[]))
      and (position('hero' in lower(a.placement_code))>0 or position('hero' in lower(a.slot))>0)
  ) then raise exception 'sponsored campaigns cannot use hero placement' using errcode='22023'; end if;
  select to_jsonb(c) into v_before from public.sponsored_campaigns c where c.id=v_id;
  insert into public.sponsored_campaigns(id,name,sponsor_name,headline,body,cta_label,destination_url,target_location_id,status,starts_at,ends_at,targeting,frequency_cap_daily,impression_cap_total,owner_priority,created_by,updated_by,updated_at)
  values(v_id,p_name,p_sponsor_name,p_headline,p_body,coalesce(nullif(p_cta_label,''),'Learn more'),p_destination_url,p_target_location_id,p_status,p_starts_at,p_ends_at,coalesce(p_targeting,'{}'::jsonb),greatest(1,least(p_frequency_cap_daily,20)),p_impression_cap_total,p_owner_priority,auth.uid(),auth.uid(),now())
  on conflict(id) do update set name=excluded.name,sponsor_name=excluded.sponsor_name,headline=excluded.headline,body=excluded.body,cta_label=excluded.cta_label,destination_url=excluded.destination_url,target_location_id=excluded.target_location_id,status=excluded.status,starts_at=excluded.starts_at,ends_at=excluded.ends_at,targeting=excluded.targeting,frequency_cap_daily=excluded.frequency_cap_daily,impression_cap_total=excluded.impression_cap_total,owner_priority=excluded.owner_priority,updated_by=auth.uid(),updated_at=now();
  delete from public.sponsored_campaign_placements where campaign_id=v_id;
  insert into public.sponsored_campaign_placements(campaign_id,placement_code)
  select v_id,x from unnest(coalesce(p_placement_codes,array[]::text[])) x
  join public.ad_placements a on a.placement_code=x;
  select to_jsonb(c) || jsonb_build_object('placements',coalesce((select jsonb_agg(cp.placement_code) from public.sponsored_campaign_placements cp where cp.campaign_id=v_id),'[]'::jsonb))
  into v_after from public.sponsored_campaigns c where c.id=v_id;
  insert into public.relevance_sponsorship_audit(actor_user_id,action,entity_type,entity_key,previous_state,next_state,reason)
  values(auth.uid(),'upsert','sponsored_campaign',v_id::text,v_before,v_after,p_reason);
  return v_after;
end;
$$;
revoke all on function public.owner_upsert_sponsored_campaign(uuid,text,text,text,text,text,text,uuid,text,timestamptz,timestamptz,jsonb,integer,bigint,integer,text[],text) from public;
grant execute on function public.owner_upsert_sponsored_campaign(uuid,text,text,text,text,text,text,uuid,text,timestamptz,timestamptz,jsonb,integer,bigint,integer,text[],text) to authenticated;

insert into public.capability_domain_contracts(
  domain,canonical_capability,canonical_rpc,owner_surface,owner_workspace,owner_route,active,exposure_state,release_state,requires_surface,source_repos,notes
)
values(
  'relevance_sponsorship',
  'Organic relevance and sponsored inventory governance',
  'owner_relevance_sponsorship_snapshot',
  'platform',
  'KleenestOS',
  '/relevance',
  true,
  'surface',
  'enabled',
  true,
  array['Kleenest_Production']::text[],
  'Owner controls organic hero policies and paid placements separately. Hero inventory is organic-only; sponsored content cannot alter trust/ranking.'
)
on conflict (domain) do update set
  canonical_capability=excluded.canonical_capability,
  canonical_rpc=excluded.canonical_rpc,
  owner_surface=excluded.owner_surface,
  owner_workspace=excluded.owner_workspace,
  owner_route=excluded.owner_route,
  active=excluded.active,
  exposure_state=excluded.exposure_state,
  release_state=excluded.release_state,
  requires_surface=excluded.requires_surface,
  source_repos=excluded.source_repos,
  notes=excluded.notes,
  updated_at=now();
