-- Owner-controlled Google network-ad placement policy.
-- Keeps AdMob inventory independent from direct Kleenest Sponsored campaigns.

create table if not exists public.network_ad_settings (
  singleton boolean primary key default true check (singleton),
  global_enabled boolean not null default true,
  session_cap smallint not null default 4 check (session_cap between 0 and 20),
  updated_at timestamptz not null default now()
);

insert into public.network_ad_settings(singleton,global_enabled,session_cap)
values(true,true,4)
on conflict(singleton) do nothing;

create table if not exists public.network_ad_placements (
  placement_code text primary key,
  surface text not null,
  slot text not null,
  active boolean not null default true,
  android_enabled boolean not null default true,
  ios_enabled boolean not null default true,
  max_per_session smallint not null default 1 check (max_per_session between 0 and 5),
  owner_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint network_ad_placements_code_check
    check (placement_code ~ '^[a-z0-9_-]{1,80}$')
);

insert into public.network_ad_placements(
  placement_code,surface,slot,active,android_enabled,ios_enabled,max_per_session,owner_notes
)
values
  ('maps_network_after_results_4','maps','after_results_4',true,true,true,1,'Early Explore visibility without interrupting search, route, check-in or review actions.'),
  ('maps_network_after_results_14','maps','after_results_14',true,true,true,1,'Deep-scroll Explore inventory only after a long result session.'),
  ('progress_network_after_trust','progress','after_trust',true,true,true,1,'Between grouped progression sections.'),
  ('game_center_network_after_first_group','games','after_first_group',true,true,true,1,'Between game groups, never during active gameplay.'),
  ('home_feed_network_after_updates_4','home','feed_after_updates_4',true,true,true,1,'Merged Home/Community feed after four updates.'),
  ('home_feed_network_after_updates_12','home','feed_after_updates_12',true,true,true,1,'Second Home/Community slot only for long feed sessions.'),
  ('profile_network_before_account','profile','before_account',true,true,true,1,'Lower Profile placement before account management.')
on conflict(placement_code) do update set
  surface=excluded.surface,
  slot=excluded.slot,
  owner_notes=excluded.owner_notes;

alter table public.network_ad_settings enable row level security;
alter table public.network_ad_placements enable row level security;

revoke all on public.network_ad_settings from public,anon,authenticated;
revoke all on public.network_ad_placements from public,anon,authenticated;
grant select,insert,update,delete on public.network_ad_settings to service_role;
grant select,insert,update,delete on public.network_ad_placements to service_role;

create or replace function public.consumer_network_ad_placement_enabled(
  p_placement_code text,
  p_platform text,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_code text := lower(trim(coalesce(p_placement_code,'')));
  v_platform text := lower(trim(coalesce(p_platform,'')));
  v_enabled boolean := false;
begin
  if v_code !~ '^[a-z0-9_-]{1,80}$' then
    return false;
  end if;
  if v_platform not in ('android','ios') then
    return false;
  end if;
  if not public.consumer_network_ads_enabled(p_user_id) then
    return false;
  end if;

  select coalesce(s.global_enabled,false)
    and p.active
    and case when v_platform='android' then p.android_enabled else p.ios_enabled end
  into v_enabled
  from public.network_ad_placements p
  cross join public.network_ad_settings s
  where p.placement_code=v_code
    and s.singleton=true;

  return coalesce(v_enabled,false);
end;
$$;

revoke all on function public.consumer_network_ad_placement_enabled(text,text,uuid) from public;
grant execute on function public.consumer_network_ad_placement_enabled(text,text,uuid) to anon,authenticated,service_role;

create or replace function public.consumer_network_ad_placement_policy(
  p_placement_code text,
  p_platform text,
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_code text := lower(trim(coalesce(p_placement_code,'')));
  v_platform text := lower(trim(coalesce(p_platform,'')));
  v_row public.network_ad_placements;
  v_settings public.network_ad_settings;
  v_enabled boolean := false;
begin
  select * into v_settings
  from public.network_ad_settings s
  where s.singleton=true;

  select * into v_row
  from public.network_ad_placements p
  where p.placement_code=v_code;

  if v_row.placement_code is null or v_settings.singleton is null then
    return jsonb_build_object(
      'enabled',false,
      'placement_code',v_code,
      'session_cap',coalesce(v_settings.session_cap,0),
      'max_per_session',0
    );
  end if;

  v_enabled := public.consumer_network_ad_placement_enabled(v_code,v_platform,p_user_id);

  return jsonb_build_object(
    'enabled',v_enabled,
    'placement_code',v_row.placement_code,
    'surface',v_row.surface,
    'slot',v_row.slot,
    'platform',v_platform,
    'session_cap',v_settings.session_cap,
    'max_per_session',v_row.max_per_session
  );
end;
$$;

revoke all on function public.consumer_network_ad_placement_policy(text,text,uuid) from public;
grant execute on function public.consumer_network_ad_placement_policy(text,text,uuid) to anon,authenticated,service_role;

create or replace function public.owner_network_ad_placement_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_settings public.network_ad_settings;
  v_placements jsonb := '[]'::jsonb;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;

  select * into v_settings
  from public.network_ad_settings s
  where s.singleton=true;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.surface,p.slot),'[]'::jsonb)
  into v_placements
  from public.network_ad_placements p;

  return jsonb_build_object(
    'global_enabled',coalesce(v_settings.global_enabled,false),
    'session_cap',coalesce(v_settings.session_cap,0),
    'placements',v_placements,
    'rules',jsonb_build_object(
      'remove_ads_scope','network_only',
      'sponsored_inventory_separate',true,
      'ad_unit_ids_owner_editable',false
    )
  );
end;
$$;

revoke all on function public.owner_network_ad_placement_snapshot() from public,anon;
grant execute on function public.owner_network_ad_placement_snapshot() to authenticated,service_role;

create or replace function public.owner_update_network_ad_settings(
  p_global_enabled boolean,
  p_session_cap integer,
  p_reason text default 'KleenestOS AdMob settings update'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_cap integer := greatest(0,least(coalesce(p_session_cap,4),20));
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;

  update public.network_ad_settings
  set global_enabled=coalesce(p_global_enabled,global_enabled),
      session_cap=v_cap,
      updated_at=now()
  where singleton=true;

  return public.owner_network_ad_placement_snapshot();
end;
$$;

revoke all on function public.owner_update_network_ad_settings(boolean,integer,text) from public,anon;
grant execute on function public.owner_update_network_ad_settings(boolean,integer,text) to authenticated,service_role;

create or replace function public.owner_update_network_ad_placement(
  p_placement_code text,
  p_active boolean,
  p_android_enabled boolean,
  p_ios_enabled boolean,
  p_max_per_session integer,
  p_owner_notes text default null,
  p_reason text default 'KleenestOS AdMob placement update'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_code text := lower(trim(coalesce(p_placement_code,'')));
  v_row public.network_ad_placements;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  if v_code !~ '^[a-z0-9_-]{1,80}$' then
    raise exception 'invalid network ad placement code' using errcode='22023';
  end if;

  update public.network_ad_placements
  set active=coalesce(p_active,active),
      android_enabled=coalesce(p_android_enabled,android_enabled),
      ios_enabled=coalesce(p_ios_enabled,ios_enabled),
      max_per_session=greatest(0,least(coalesce(p_max_per_session,max_per_session),5)),
      owner_notes=coalesce(p_owner_notes,owner_notes),
      updated_at=now()
  where placement_code=v_code
  returning * into v_row;

  if v_row.placement_code is null then
    raise exception 'unknown network ad placement' using errcode='22023';
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.owner_update_network_ad_placement(text,boolean,boolean,boolean,integer,text,text) from public,anon;
grant execute on function public.owner_update_network_ad_placement(text,boolean,boolean,boolean,integer,text,text) to authenticated,service_role;

comment on table public.network_ad_placements is
  'Owner-controlled serving policy for Google/third-party network ad placements. Direct Kleenest Sponsored inventory is separate.';
comment on function public.consumer_network_ad_placement_enabled(text,text,uuid) is
  'Returns whether a specific native network-ad placement may request inventory for this platform and entitlement state.';
comment on function public.owner_network_ad_placement_snapshot() is
  'KleenestOS owner snapshot for global and per-placement AdMob serving controls.';
