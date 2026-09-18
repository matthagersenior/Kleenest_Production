create table if not exists public.network_leaderboard_sources (
  id uuid primary key default gen_random_uuid(),
  leaderboard_key text not null unique,
  display_name text not null,
  description text,
  scope text not null default 'platform' check (scope in ('platform','consumer','business','fleet','enterprise','contributor','location')),
  metric_key text not null,
  rewardable boolean not null default true,
  featured boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.network_leaderboard_participation (
  id uuid primary key default gen_random_uuid(),
  leaderboard_key text not null references public.network_leaderboard_sources(leaderboard_key) on delete cascade,
  actor_id uuid,
  actor_type text not null default 'user' check (actor_type in ('user','business','fleet','enterprise','location','contributor')),
  metric_value numeric not null default 0,
  source_event text not null,
  source_id uuid,
  period_start date,
  period_end date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_network_leaderboard_participation_key_period on public.network_leaderboard_participation(leaderboard_key, period_start, period_end);
create index if not exists idx_network_leaderboard_participation_actor on public.network_leaderboard_participation(actor_id, created_at desc);

create table if not exists public.geofence_events (
  id uuid primary key default gen_random_uuid(),
  geofence_id uuid references public.business_geofences(id) on delete set null,
  user_id uuid,
  location_id uuid,
  business_id uuid,
  event_type text not null check (event_type in ('enter','exit','dwell','nearby','conversion')),
  occurred_at timestamptz not null default now(),
  dwell_seconds integer,
  metadata jsonb not null default '{}'::jsonb,
  notification_id uuid,
  qr_code_id uuid,
  check_in_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_geofence_events_user_time on public.geofence_events(user_id, occurred_at desc);
create index if not exists idx_geofence_events_location_time on public.geofence_events(location_id, occurred_at desc);

create table if not exists public.qr_engagement_programs (
  id uuid primary key default gen_random_uuid(),
  qr_code_id uuid not null references public.qr_codes(id) on delete cascade,
  program_type text not null check (program_type in ('check_in','reward','promotion','review','survey','event','contest','content','navigation','support','custom')),
  name text not null,
  description text,
  trigger_count integer not null default 1,
  reward_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_qr_engagement_programs_qr_active on public.qr_engagement_programs(qr_code_id, active);

create or replace function public.record_network_leaderboard_participation(
  p_leaderboard_key text,
  p_actor_id uuid,
  p_actor_type text,
  p_metric_value numeric,
  p_source_event text,
  p_source_id uuid default null,
  p_period_start date default null,
  p_period_end date default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.network_leaderboard_sources where leaderboard_key=p_leaderboard_key and active) then
    raise exception 'Unknown or inactive leaderboard: %', p_leaderboard_key;
  end if;
  insert into public.network_leaderboard_participation(leaderboard_key,actor_id,actor_type,metric_value,source_event,source_id,period_start,period_end,metadata)
  values(p_leaderboard_key,p_actor_id,p_actor_type,p_metric_value,p_source_event,p_source_id,p_period_start,p_period_end,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.record_geofence_event(
  p_geofence_id uuid,
  p_user_id uuid,
  p_location_id uuid,
  p_business_id uuid,
  p_event_type text,
  p_dwell_seconds integer default null,
  p_metadata jsonb default '{}'::jsonb,
  p_notification_id uuid default null,
  p_qr_code_id uuid default null,
  p_check_in_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  insert into public.geofence_events(geofence_id,user_id,location_id,business_id,event_type,dwell_seconds,metadata,notification_id,qr_code_id,check_in_id)
  values(p_geofence_id,p_user_id,p_location_id,p_business_id,p_event_type,p_dwell_seconds,coalesce(p_metadata,'{}'::jsonb),p_notification_id,p_qr_code_id,p_check_in_id) returning id into v_id;
  return v_id;
end; $$;

insert into public.network_leaderboard_sources(leaderboard_key,display_name,description,scope,metric_key) values
('consumer_checkins','Check-in Champions','Verified participation through check-ins','consumer','check_ins'),
('consumer_reviews','Community Review Leaders','Helpful verified reviews and reputation contribution','contributor','reviews'),
('location_quality','Location Quality Leaders','Verified location quality contribution','location','quality_score'),
('evidence_contributors','Evidence Contributors','Verified evidence and observation contribution','contributor','evidence'),
('business_engagement','Business Engagement Leaders','Network engagement generated by participating businesses','business','engagement'),
('enterprise_network','Enterprise Network Leaders','Network contribution generated by enterprise programs','enterprise','network_contribution'),
('fleet_network','Fleet Network Leaders','Operational contribution shared with the wider network','fleet','network_contribution')
on conflict (leaderboard_key) do nothing;

comment on table public.network_leaderboard_sources is 'Cross-tier leaderboard registry for measurable platform participation and derived intelligence.';
comment on table public.network_leaderboard_participation is 'Append-only participation facts feeding leaderboard, reward, and network intelligence consumers.';
comment on table public.geofence_events is 'Canonical geofence enter/exit/dwell/conversion facts that can drive notifications, QR, check-ins, rewards, and intelligence.';
comment on table public.qr_engagement_programs is 'Reusable QR engagement programs connecting scans to check-ins, rewards, promotions, reviews, events, content, navigation, support, or custom actions.';
