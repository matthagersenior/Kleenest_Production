-- Turn the staged 2026 seasonal theme vault into a live, persistent progression reward track.
-- Manual owner grants remain a bypass, and the platform owner keeps automatic access.

update public.progression_reward_catalog
set owner_only=false,
    progression_unlock_enabled=true,
    metadata=metadata || jsonb_build_object(
      'unlock_model','earned_progression',
      'progression_live',true,
      'progression_live_since','2026-09-15',
      'owner_override',true,
      'earned_access_persists',true
    ),
    updated_at=now()
where code in (
  'theme_fall_2026',
  'theme_halloween_2026',
  'theme_thanksgiving_2026',
  'theme_christmas_2026'
);

create or replace function internal.award_progression_theme_rewards(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_identity jsonb;
  v_count integer:=0;
begin
  if p_user_id is null then return 0; end if;
  v_identity:=internal.progression_public_identity(p_user_id);

  with eligible as (
    select c.code
    from public.progression_reward_catalog c
    where c.active
      and c.reward_kind='theme'
      and c.progression_unlock_enabled
      and not c.owner_only
      and (c.available_from is null or c.available_from<=now())
      and (c.available_until is null or c.available_until>=now())
      and coalesce((v_identity->>'level')::integer,1)>=c.min_global_level
      and coalesce((v_identity->>'trust_score')::integer,0)>=c.min_trust_score
      and coalesce((v_identity->>'lifetime_xp')::bigint,0)>=c.min_lifetime_xp
      and coalesce((v_identity->>'badge_count')::integer,0)>=c.min_badges
  ), inserted as (
    insert into public.user_progression_reward_grants(user_id,reward_code,granted_by,source,reason)
    select p_user_id,e.code,null,'progression','Earned automatically through Kleenest progression'
    from eligible e
    where not exists(
      select 1
      from public.user_progression_reward_grants g
      where g.user_id=p_user_id
        and g.reward_code=e.code
        and g.revoked_at is null
    )
    on conflict do nothing
    returning 1
  )
  select count(*)::integer into v_count from inserted;

  return v_count;
end
$$;

revoke all on function internal.award_progression_theme_rewards(uuid) from public, anon, authenticated;

create or replace function internal.award_progression_identity_badges(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_identity jsonb;
  v_level integer;
  v_trust integer;
  v_count integer:=0;
begin
  if p_user_id is null then return 0; end if;
  v_identity:=internal.progression_public_identity(p_user_id);
  v_level:=coalesce((v_identity->>'level')::integer,1);
  v_trust:=coalesce((v_identity->>'trust_score')::integer,0);

  with eligible as (
    select b.id
    from public.badges b
    where b.criteria->>'type'='progression_identity'
      and v_level>=coalesce((b.criteria->>'min_level')::integer,1)
      and v_trust>=coalesce((b.criteria->>'min_trust')::integer,0)
  ), inserted as (
    insert into public.user_badges(user_id,badge_id)
    select p_user_id,id from eligible
    on conflict do nothing
    returning 1
  )
  select count(*)::integer into v_count from inserted;

  -- Re-read identity after badge awards so badge-count gates can unlock on the same event.
  perform internal.award_progression_theme_rewards(p_user_id);
  return v_count;
end
$$;

revoke all on function internal.award_progression_identity_badges(uuid) from public, anon, authenticated;

create or replace function public.consumer_progression_rewards()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_owner boolean:=false;
  v_identity jsonb;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  v_owner:=internal.is_actual_platform_owner(v_user);
  v_identity:=internal.progression_public_identity(v_user);

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'code',c.code,
        'reward_kind',c.reward_kind,
        'reward_key',c.reward_key,
        'name',c.name,
        'description',c.description,
        'owner_only',c.owner_only,
        'progression_unlock_enabled',c.progression_unlock_enabled,
        'unlocked',(
          v_owner
          or exists(select 1 from public.user_progression_reward_grants g where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null)
          or (
            c.progression_unlock_enabled and not c.owner_only
            and coalesce((v_identity->>'level')::integer,1)>=c.min_global_level
            and coalesce((v_identity->>'trust_score')::integer,0)>=c.min_trust_score
            and coalesce((v_identity->>'lifetime_xp')::bigint,0)>=c.min_lifetime_xp
            and coalesce((v_identity->>'badge_count')::integer,0)>=c.min_badges
          )
        ),
        'unlock_source',case
          when v_owner then 'platform_owner'
          when exists(
            select 1 from public.user_progression_reward_grants g
            where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null and g.source='progression'
          ) then 'progression_earned'
          when exists(
            select 1 from public.user_progression_reward_grants g
            where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null
          ) then 'owner_grant'
          when c.progression_unlock_enabled and not c.owner_only
            and coalesce((v_identity->>'level')::integer,1)>=c.min_global_level
            and coalesce((v_identity->>'trust_score')::integer,0)>=c.min_trust_score
            and coalesce((v_identity->>'lifetime_xp')::bigint,0)>=c.min_lifetime_xp
            and coalesce((v_identity->>'badge_count')::integer,0)>=c.min_badges then 'progression_eligible'
          else 'locked' end,
        'requirements',jsonb_build_object(
          'level',c.min_global_level,
          'trust_score',c.min_trust_score,
          'lifetime_xp',c.min_lifetime_xp,
          'badges',c.min_badges
        ),
        'identity',v_identity,
        'metadata',c.metadata,
        'sort_order',c.sort_order
      ) order by c.sort_order,c.name
    ),'[]'::jsonb)
    from public.progression_reward_catalog c
    where c.active
      and (c.available_from is null or c.available_from<=now())
      and (c.available_until is null or c.available_until>=now())
  );
end
$$;

revoke all on function public.consumer_progression_rewards() from public, anon;
grant execute on function public.consumer_progression_rewards() to authenticated;

-- Existing qualified contributors should receive persistent grants immediately.
do $$
declare
  v_profile record;
begin
  for v_profile in
    select p.id
    from public.profiles p
    where coalesce(p.is_demo_test,false)=false
  loop
    perform internal.award_progression_identity_badges(v_profile.id);
  end loop;
end
$$;
