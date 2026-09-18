begin;

update public.progression_reward_catalog
set metadata=(coalesce(metadata,'{}'::jsonb)-'equip_slot')
  || jsonb_build_object('permanent_capability',true,'stackable',true)
where reward_kind='map_filter';

delete from public.user_progression_reward_equipment
where slot='map_filter';

create or replace function public.consumer_equip_progression_reward(p_reward_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  c public.progression_reward_catalog%rowtype;
  v_slot text;
  v_unlocked boolean:=false;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into c from public.progression_reward_catalog where code=p_reward_code and active;
  if not found then raise exception 'reward not found'; end if;

  v_unlocked:=internal.is_actual_platform_owner(v_user)
    or exists(select 1 from public.user_progression_reward_grants g where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null)
    or internal.progression_reward_eligible(v_user,c.code);
  if not v_unlocked then raise exception 'reward is locked'; end if;

  v_slot:=case c.reward_kind
    when 'theme' then 'theme'
    when 'title' then 'title'
    when 'profile_frame' then 'profile_frame'
    when 'profile_background' then 'profile_background'
    when 'map_flair' then 'map_flair'
    when 'checkin_animation' then 'checkin_animation'
    when 'reaction_pack' then 'reaction_pack'
    else null end;
  if v_slot is null then raise exception 'reward is not equipable'; end if;

  insert into public.user_progression_reward_equipment(user_id,slot,reward_code,equipped_at,updated_at)
  values(v_user,v_slot,c.code,now(),now())
  on conflict(user_id,slot) do update
    set reward_code=excluded.reward_code,equipped_at=now(),updated_at=now();

  return jsonb_build_object('equipped',true,'slot',v_slot,'reward_code',c.code,'reward_key',c.reward_key);
end
$$;

create or replace function public.consumer_reward_capabilities()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_owner boolean:=false;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  v_owner:=internal.is_actual_platform_owner(v_user);
  return (
    with unlocked as (
      select c.*
      from public.progression_reward_catalog c
      where c.active and (
        v_owner
        or exists(select 1 from public.user_progression_reward_grants g where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null)
        or internal.progression_reward_eligible(v_user,c.code)
      )
    )
    select jsonb_build_object(
      'platform_owner',v_owner,
      'showcase_slot_bonus',coalesce(sum(coalesce((metadata->>'showcase_slot_bonus')::integer,0)),0),
      'saved_collection_bonus',coalesce(sum(coalesce((metadata->>'saved_collection_bonus')::integer,0)),0),
      'mission_rerolls',coalesce(sum(coalesce((metadata->>'mission_rerolls')::integer,0)),0),
      'quest_slots',coalesce(sum(coalesce((metadata->>'quest_slots')::integer,0)),0),
      'streak_shields',coalesce(sum(coalesce((metadata->>'streak_shields')::integer,0)),0),
      'community_challenge_creator',coalesce(bool_or(coalesce((metadata->>'community_challenge_creator')::boolean,false)),false),
      'community_vote',coalesce(bool_or(coalesce((metadata->>'community_vote')::boolean,false)),false),
      'beta_access',coalesce(bool_or(coalesce((metadata->>'beta_access')::boolean,false)),false),
      'stats_pack',coalesce(bool_or(coalesce((metadata->>'stats_pack')::boolean,false)),false),
      'verification_privilege',coalesce(bool_or(coalesce((metadata->>'verification_privilege')::boolean,false)),false),
      'unlocked_map_filters',(
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'code',u.code,
            'reward_key',u.reward_key,
            'name',u.name,
            'filters',coalesce(u.metadata->'filters','[]'::jsonb)
          )
          order by u.sort_order,u.name
        ),'[]'::jsonb)
        from unlocked u
        where u.reward_kind='map_filter'
      ),
      'beta_features',(select coalesce(jsonb_object_agg(feature_code,enabled),'{}'::jsonb) from public.user_beta_feature_preferences where user_id=v_user),
      'streak_shield_last_used',(select max(used_on) from public.user_reward_streak_shield_usage where user_id=v_user),
      'equipped',(select coalesce(jsonb_object_agg(eq.slot,jsonb_build_object('code',c2.code,'reward_key',c2.reward_key,'name',c2.name,'metadata',c2.metadata)),'{}'::jsonb)
        from public.user_progression_reward_equipment eq
        join public.progression_reward_catalog c2 on c2.code=eq.reward_code
        where eq.user_id=v_user and eq.slot<>'map_filter')
    )
    from unlocked
  );
end
$$;

revoke all on function public.consumer_equip_progression_reward(text) from public,anon;
grant execute on function public.consumer_equip_progression_reward(text) to authenticated;
revoke all on function public.consumer_reward_capabilities() from public,anon;
grant execute on function public.consumer_reward_capabilities() to authenticated;

commit;
