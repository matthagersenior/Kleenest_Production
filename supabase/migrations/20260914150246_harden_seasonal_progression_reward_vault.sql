drop policy if exists progression_reward_catalog_deny_direct on public.progression_reward_catalog;
create policy progression_reward_catalog_deny_direct
on public.progression_reward_catalog
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists user_progression_reward_grants_deny_direct on public.user_progression_reward_grants;
create policy user_progression_reward_grants_deny_direct
on public.user_progression_reward_grants
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists review_trust_discovery_awards_deny_direct on public.review_trust_discovery_awards;
create policy review_trust_discovery_awards_deny_direct
on public.review_trust_discovery_awards
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create or replace function internal.is_actual_platform_owner(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select p_user_id is not null and exists(
    select 1 from public.profiles p
    where p.id=p_user_id and coalesce(p.is_platform_owner,false)=true
  );
$$;

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
          when exists(select 1 from public.user_progression_reward_grants g where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null) then 'owner_grant'
          when c.progression_unlock_enabled and not c.owner_only
            and coalesce((v_identity->>'level')::integer,1)>=c.min_global_level
            and coalesce((v_identity->>'trust_score')::integer,0)>=c.min_trust_score
            and coalesce((v_identity->>'lifetime_xp')::bigint,0)>=c.min_lifetime_xp
            and coalesce((v_identity->>'badge_count')::integer,0)>=c.min_badges then 'progression'
          else 'locked' end,
        'requirements',jsonb_build_object(
          'level',c.min_global_level,'trust_score',c.min_trust_score,'lifetime_xp',c.min_lifetime_xp,'badges',c.min_badges
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

create or replace function public.owner_progression_reward_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not internal.is_actual_platform_owner(auth.uid()) then raise exception 'platform owner authorization required'; end if;
  return (
    select coalesce(jsonb_agg(
      to_jsonb(c) || jsonb_build_object(
        'active_grants',(select count(*) from public.user_progression_reward_grants g where g.reward_code=c.code and g.revoked_at is null),
        'recent_grants',(select coalesce(jsonb_agg(jsonb_build_object(
          'id',g.id,'user_id',g.user_id,'display_name',p.display_name,'username',p.username,
          'source',g.source,'reason',g.reason,'granted_at',g.granted_at
        ) order by g.granted_at desc),'[]'::jsonb)
        from (
          select * from public.user_progression_reward_grants gg
          where gg.reward_code=c.code and gg.revoked_at is null
          order by gg.granted_at desc limit 10
        ) g
        join public.profiles p on p.id=g.user_id)
      )
      order by c.sort_order,c.name
    ),'[]'::jsonb)
    from public.progression_reward_catalog c
  );
end
$$;

create or replace function public.owner_grant_progression_reward(
  p_target_user_id uuid,p_reward_code text,p_reason text default 'Owner seasonal reward grant'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  if not internal.is_actual_platform_owner(auth.uid()) then raise exception 'platform owner authorization required'; end if;
  if not exists(select 1 from public.profiles where id=p_target_user_id) then raise exception 'profile not found'; end if;
  if not exists(select 1 from public.progression_reward_catalog where code=p_reward_code and active) then raise exception 'reward not found'; end if;

  if exists(select 1 from public.user_progression_reward_grants where user_id=p_target_user_id and reward_code=p_reward_code and revoked_at is null) then
    return jsonb_build_object('granted',true,'duplicate',true,'user_id',p_target_user_id,'reward_code',p_reward_code);
  end if;

  insert into public.user_progression_reward_grants(user_id,reward_code,granted_by,source,reason)
  values(p_target_user_id,p_reward_code,auth.uid(),'owner',coalesce(nullif(trim(p_reason),''),'Owner seasonal reward grant'))
  returning id into v_id;

  return jsonb_build_object('granted',true,'duplicate',false,'grant_id',v_id,'user_id',p_target_user_id,'reward_code',p_reward_code);
end
$$;

create or replace function public.owner_revoke_progression_reward(
  p_target_user_id uuid,p_reward_code text,p_reason text default 'Owner seasonal reward revoke'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer;
begin
  if not internal.is_actual_platform_owner(auth.uid()) then raise exception 'platform owner authorization required'; end if;
  update public.user_progression_reward_grants
  set revoked_at=now(),reason=coalesce(nullif(trim(p_reason),''),reason,'Owner seasonal reward revoke')
  where user_id=p_target_user_id and reward_code=p_reward_code and revoked_at is null;
  get diagnostics v_count=row_count;
  return jsonb_build_object('revoked',v_count>0,'count',v_count,'user_id',p_target_user_id,'reward_code',p_reward_code);
end
$$;

create or replace function public.owner_update_progression_reward_policy(
  p_reward_code text,
  p_owner_only boolean,
  p_progression_unlock_enabled boolean,
  p_min_global_level integer,
  p_min_trust_score integer,
  p_min_lifetime_xp bigint,
  p_min_badges integer,
  p_reason text default 'Owner progression reward policy update'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_row public.progression_reward_catalog;
begin
  if not internal.is_actual_platform_owner(auth.uid()) then raise exception 'platform owner authorization required'; end if;
  if p_min_global_level<1 or p_min_trust_score<0 or p_min_trust_score>100 or p_min_lifetime_xp<0 or p_min_badges<0 then
    raise exception 'invalid progression requirement';
  end if;
  update public.progression_reward_catalog
  set owner_only=p_owner_only,
      progression_unlock_enabled=p_progression_unlock_enabled,
      min_global_level=p_min_global_level,
      min_trust_score=p_min_trust_score,
      min_lifetime_xp=p_min_lifetime_xp,
      min_badges=p_min_badges,
      metadata=metadata||jsonb_build_object('last_policy_reason',coalesce(nullif(trim(p_reason),''),'Owner progression reward policy update'),'last_policy_actor',auth.uid(),'last_policy_at',now()),
      updated_at=now()
  where code=p_reward_code
  returning * into v_row;
  if not found then raise exception 'reward not found'; end if;
  return to_jsonb(v_row);
end
$$;

create or replace function internal.evaluate_review_trust_discovery(p_review_id uuid,p_source text default 'review')
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_review public.reviews%rowtype;
  v_verified boolean:=false;
  v_amenities integer:=0;
  v_photos integer:=0;
  v_score integer:=0;
  v_band integer:=1;
  v_cumulative integer:=0;
  v_previous integer:=0;
  v_delta integer:=0;
  v_event uuid;
  v_daily_count integer:=0;
  v_daily_cap integer:=20;
begin
  select * into v_review from public.reviews where id=p_review_id and status='published';
  if not found or v_review.user_id is null then return jsonb_build_object('awarded',false); end if;

  if v_review.check_in_id is not null then
    select exists(
      select 1 from public.check_ins c
      where c.id=v_review.check_in_id
        and c.user_id=v_review.user_id
        and c.location_id=v_review.location_id
        and coalesce((c.metadata->>'progression_eligible')::boolean,false)
    ) into v_verified;
  end if;

  select count(distinct ao.amenity_id)::integer into v_amenities
  from public.location_amenity_observations ao
  where ao.user_id=v_review.user_id and ao.location_id=v_review.location_id
    and v_review.check_in_id is not null and ao.check_in_id=v_review.check_in_id;

  select count(*)::integer into v_photos
  from public.review_photos rp
  where rp.review_id=v_review.id and rp.moderation_status='visible';

  v_score:=
    (case when v_verified then 1 else 0 end)+
    (case when v_review.cleanliness_pct is not null then 1 else 0 end)+
    (case when length(coalesce(v_review.comment,''))>=80 then 1 else 0 end)+
    (case when length(coalesce(v_review.comment,''))>=180 then 1 else 0 end)+
    (case when v_amenities>0 then 1 else 0 end)+
    (case when v_photos>0 then 1 else 0 end);

  v_band:=greatest(1,least(6,v_score));
  v_cumulative:=case v_band
    when 1 then 0
    when 2 then 8
    when 3 then 18
    when 4 then 32
    when 5 then 48
    else 70 end;

  insert into public.review_trust_discovery_awards(review_id,user_id,highest_band,cumulative_xp,last_source,internal_signals)
  values(v_review.id,v_review.user_id,1,0,p_source,jsonb_build_object('verified',v_verified,'amenity_count',v_amenities,'photo_count',v_photos,'quality_score',v_score))
  on conflict(review_id) do nothing;

  select cumulative_xp into v_previous
  from public.review_trust_discovery_awards
  where review_id=v_review.id
  for update;

  v_delta:=greatest(0,v_cumulative-coalesce(v_previous,0));

  select coalesce(max(a.max_per_day),20) into v_daily_cap
  from public.progression_xp_actions a
  where a.action='substantive_review' and a.enabled;

  select count(*)::integer into v_daily_count
  from public.progression_events_v2 e
  where e.user_id=v_review.user_id
    and e.action='substantive_review'
    and e.status='awarded'
    and e.created_at>=date_trunc('day',now());

  if v_delta>0 and v_daily_count < v_daily_cap then
    insert into public.progression_events_v2(
      user_id,action,location_id,subject,evidence_tier,base_xp,multiplier,xp_awarded,idempotency_key,status
    ) values(
      v_review.user_id,'substantive_review',v_review.location_id,
      jsonb_build_object('source_type','review','source_id',v_review.id,'trust_discovery',true,'mystery',true,'quality_band',v_band),
      v_band,v_delta,1,v_delta,'trust-discovery:'||v_review.id::text||':'||v_band::text,'awarded'
    )
    on conflict(user_id,idempotency_key) do nothing
    returning id into v_event;

    if v_event is not null then
      insert into public.progression_metric_events(user_id,metric,source_type,source_id,quantity,points_awarded,metadata)
      values(v_review.user_id,'review_trust_discovery','review',v_review.id,1,v_delta,jsonb_build_object('quality_band',v_band,'mystery',true));
    end if;
  else
    v_delta:=0;
  end if;

  update public.review_trust_discovery_awards
  set highest_band=greatest(highest_band,v_band),
      cumulative_xp=case when v_event is not null then greatest(cumulative_xp,v_cumulative) else cumulative_xp end,
      last_source=p_source,
      internal_signals=jsonb_build_object('verified',v_verified,'amenity_count',v_amenities,'photo_count',v_photos,'quality_score',v_score),
      updated_at=now()
  where review_id=v_review.id;

  perform internal.award_progression_identity_badges(v_review.user_id);

  return jsonb_build_object(
    'awarded',v_event is not null,
    'xp_awarded',case when v_event is not null then v_delta else 0 end,
    'quality_band',v_band,
    'withheld',v_event is null and v_cumulative>coalesce(v_previous,0),
    'withheld_reason',case when v_event is null and v_daily_count>=v_daily_cap then 'daily_limit' else null end,
    'message',case when v_event is not null then 'Trust Discovery unlocked' else null end
  );
end
$$;

revoke all on function internal.is_actual_platform_owner(uuid) from public, anon, authenticated;
