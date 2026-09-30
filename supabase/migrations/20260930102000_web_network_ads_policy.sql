-- Extend owner-controlled Google network-ad placement policy to Consumer Web/AdSense.
-- Native AdMob and web AdSense remain independent from direct Kleenest Sponsored campaigns.

alter table public.network_ad_placements
  add column if not exists web_enabled boolean not null default true;

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
  if v_platform not in ('android','ios','web') then
    return false;
  end if;
  if not public.consumer_network_ads_enabled(p_user_id) then
    return false;
  end if;

  select coalesce(s.global_enabled,false)
    and p.active
    and case
      when v_platform='android' then p.android_enabled
      when v_platform='ios' then p.ios_enabled
      else p.web_enabled
    end
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

create or replace function public.owner_update_network_ad_placement_v2(
  p_placement_code text,
  p_active boolean,
  p_android_enabled boolean,
  p_ios_enabled boolean,
  p_web_enabled boolean,
  p_max_per_session integer,
  p_owner_notes text default null,
  p_reason text default 'KleenestOS Google network ad placement update'
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
      web_enabled=coalesce(p_web_enabled,web_enabled),
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

revoke all on function public.owner_update_network_ad_placement_v2(text,boolean,boolean,boolean,boolean,integer,text,text) from public,anon;
grant execute on function public.owner_update_network_ad_placement_v2(text,boolean,boolean,boolean,boolean,integer,text,text) to authenticated,service_role;

comment on column public.network_ad_placements.web_enabled is
  'Whether this owner-controlled network placement may render Google AdSense inventory on Consumer Web.';
comment on function public.consumer_network_ad_placement_enabled(text,text,uuid) is
  'Returns whether a Google network-ad placement may request inventory on Android, iOS, or Web for this entitlement state.';
comment on function public.owner_update_network_ad_placement_v2(text,boolean,boolean,boolean,boolean,integer,text,text) is
  'KleenestOS owner mutation for active state, Android, iOS and Web network-ad serving controls.';
