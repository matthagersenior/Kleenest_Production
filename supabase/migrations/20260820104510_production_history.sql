create index if not exists locations_missing_address_idx on public.locations (id) where (latitude is not null and longitude is not null and nullif(trim(address),'') is null);
create index if not exists locations_verification_priority_idx on public.locations (id) where is_active = true;

create table if not exists public.location_address_backfills (
  location_id uuid primary key references public.locations(id) on delete cascade,
  provider text not null default 'nominatim',
  display_address text,
  house_number text,
  road text,
  city text,
  state text,
  postal_code text,
  country text,
  latitude double precision,
  longitude double precision,
  fetched_at timestamptz not null default now(),
  source_url text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.location_verification_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft','active','completed','paused')),
  target_count integer not null default 0 check (target_count >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.location_verification_targets (
  campaign_id uuid not null references public.location_verification_campaigns(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  priority numeric not null default 0,
  reason text,
  status text not null default 'pending' check (status in ('pending','verified','rejected','skipped')),
  selected_at timestamptz not null default now(),
  primary key (campaign_id, location_id)
);

create index if not exists location_verification_targets_priority_idx on public.location_verification_targets (campaign_id, priority desc);

alter table public.location_address_backfills enable row level security;
alter table public.location_verification_campaigns enable row level security;
alter table public.location_verification_targets enable row level security;

create or replace function public.select_location_verification_targets(p_limit integer default 100)
returns table(location_id uuid, priority numeric, reason text)
language sql security definer set search_path = public
as $$
  select l.id,
    (case when coalesce(l.review_count,0) > 0 then ln(1 + l.review_count::numeric) * 10 else 0 end)
    + case when l.is_active then 5 else 0 end
    + case when l.source = 'osm' then 2 else 0 end
    + case when l.verification_status <> 'verified' then 8 else 0 end
    + case when coalesce(l.bathroom_verification_count,0) = 0 then 4 else 0 end as priority,
    'high-traffic or low-verification location' as reason
  from public.locations l
  where l.is_active = true
    and l.latitude is not null and l.longitude is not null
    and l.verification_status <> 'verified'
  order by priority desc, l.updated_at asc nulls first
  limit greatest(0, least(coalesce(p_limit,100),500));
$$;

create or replace function public.seed_location_verification_campaign(p_name text, p_limit integer default 100)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_campaign uuid;
begin
  insert into public.location_verification_campaigns(name,target_count,status)
  values(p_name,0,'draft') returning id into v_campaign;
  insert into public.location_verification_targets(campaign_id,location_id,priority,reason)
  select v_campaign, x.location_id, x.priority, x.reason from public.select_location_verification_targets(p_limit) x;
  update public.location_verification_campaigns c set target_count=(select count(*) from public.location_verification_targets t where t.campaign_id=c.id) where c.id=v_campaign;
  return v_campaign;
end;
$$;

create or replace function public.submit_location_verification(p_location_id uuid,p_is_open boolean,p_has_bathroom boolean default true,p_note text default null)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare v_user uuid; v_status text;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'Authentication required'; end if;
  v_status := case when p_is_open then 'open' else 'closed' end;
  insert into public.restroom_observations(location_id,user_id,observation_type,note,source,confidence)
  values(p_location_id,v_user,v_status,p_note,'community_verification',1.0);
  insert into public.location_bathroom_verifications(location_id,user_id,has_public_bathroom,verification_method)
  values(p_location_id,v_user,p_has_bathroom,'community_verification');
  update public.locations set bathroom_verification_count=coalesce(bathroom_verification_count,0)+1,
    bathroom_positive_count=coalesce(bathroom_positive_count,0)+case when p_has_bathroom then 1 else 0 end,
    bathroom_negative_count=coalesce(bathroom_negative_count,0)+case when p_has_bathroom then 0 else 1 end,
    bathroom_verification_status=case when p_has_bathroom then 'has_bathroom' else 'no_bathroom' end,
    bathroom_verified_at=now(), bathroom_verified_by=v_user, bathroom_verification_source='community_verification'
  where id=p_location_id;
  return jsonb_build_object('location_id',p_location_id,'open',p_is_open,'has_bathroom',p_has_bathroom,'verified_at',now());
end;
$$;
