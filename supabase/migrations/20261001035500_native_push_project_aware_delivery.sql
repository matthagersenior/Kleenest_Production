-- Keep native push delivery project-aware so Expo never receives tokens from
-- multiple Expo experiences in the same request. Also target owner/business
-- notifications at the correct Kleenest app and retire historical failures
-- caused by the mixed-project batching defect.

create or replace function internal.normalize_push_app_id(p_app_id text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  with value as (
    select pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_app_id,''))) as app_id
  )
  select case
    when app_id='' then null
    when app_id in ('consumer','kleenest-consumer','com.kleenest.consumer','@kleenest/kleenest-consumer') then 'consumer'
    when app_id in ('business','kleenest-business','com.kleenest.business','@kleenest/kleenest-business') then 'business'
    when app_id in ('fleet','kleenest-fleet','com.kleenest.fleet','@kleenest/kleenest-fleet') then 'fleet'
    when app_id in ('owner','kleenest-owner','com.kleenest.owner','@kleenest/kleenest-owner') then 'owner'
    else app_id
  end
  from value;
$$;

revoke all on function internal.normalize_push_app_id(text) from public,anon,authenticated;

create or replace function public.claim_native_push_deliveries(p_notification_id uuid, p_max_attempts integer default 5)
returns table(id uuid, token_id uuid, token text, platform text, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_notification_id is null then raise exception 'notification_id is required'; end if;
  if p_max_attempts is null or p_max_attempts<1 or p_max_attempts>20 then raise exception 'invalid max attempts'; end if;

  return query
  with eligible as (
    select t.id token_id,t.token,t.platform,coalesce(d.attempts,0) prior_attempts
    from public.notification_native_push_tokens t
    left join public.notification_native_push_deliveries d
      on d.notification_id=p_notification_id and d.token_id=t.id
    join public.notifications n
      on n.id=p_notification_id and n.user_id=t.user_id
    where t.active=true
      and (
        not (coalesce(n.data,'{}'::jsonb) ? 'app_targets')
        or (
          jsonb_typeof(n.data->'app_targets')='array'
          and exists(
            select 1
            from jsonb_array_elements_text(n.data->'app_targets') a
            where internal.normalize_push_app_id(a)=internal.normalize_push_app_id(t.app_id)
          )
        )
      )
      and coalesce(d.attempts,0)<p_max_attempts
      and (
        d.id is null
        or d.status='failed'
        or (d.status='pending' and d.updated_at<pg_catalog.now()-interval '5 minutes')
      )
    for update of t
  ), claimed as (
    insert into public.notification_native_push_deliveries(notification_id,token_id,status,attempts,updated_at)
    select p_notification_id,e.token_id,'pending',e.prior_attempts+1,pg_catalog.now()
    from eligible e
    on conflict(notification_id,token_id) do update
      set status='pending',
          attempts=public.notification_native_push_deliveries.attempts+1,
          updated_at=pg_catalog.now(),
          last_error=null
      where public.notification_native_push_deliveries.attempts<p_max_attempts
        and (
          public.notification_native_push_deliveries.status='failed'
          or (
            public.notification_native_push_deliveries.status='pending'
            and public.notification_native_push_deliveries.updated_at<pg_catalog.now()-interval '5 minutes'
          )
        )
    returning public.notification_native_push_deliveries.id,
              public.notification_native_push_deliveries.token_id,
              public.notification_native_push_deliveries.attempts
  )
  select c.id,c.token_id,e.token,e.platform,c.attempts
  from claimed c
  join eligible e on e.token_id=c.token_id;
end;
$$;

revoke all on function public.claim_native_push_deliveries(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_native_push_deliveries(uuid,integer) to service_role;

create or replace function internal.enforce_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_allowed boolean:=true;
  v_personalized boolean:=coalesce((new.data->>'personalized')::boolean,false);
  v_location_targeted boolean:=coalesce((new.data->>'location_targeted')::boolean,false);
begin
  new.data:=coalesce(new.data,'{}'::jsonb);

  if not (new.data ? 'app_targets') then
    if new.type in ('beta_incident','tell_kleenest_feedback') then
      new.data:=new.data || pg_catalog.jsonb_build_object('app_targets',pg_catalog.jsonb_build_array('owner'));
    elsif new.type in ('preventive_work_due_soon','preventive_work_overdue','preventive_work_critical_overdue') then
      new.data:=new.data || pg_catalog.jsonb_build_object('app_targets',pg_catalog.jsonb_build_array('business'));
    end if;
  end if;

  v_category:=internal.notification_preference_category(new.type,new.data);
  if v_category is null then return new; end if;

  if v_category='community' then
    select coalesce(np.community,true) and coalesce(np.social,true) into v_allowed
    from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_category='progression' then
    select coalesce(np.rewards,true) and coalesce(np.progression,true) into v_allowed
    from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_category='intelligence' then
    select coalesce(np.intelligence,true) into v_allowed
    from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_category='platform' then
    select coalesce(np.platform_updates,true) into v_allowed
    from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_category='offers' then
    select coalesce(np.offers,true) into v_allowed
    from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_category='location' then
    select coalesce(np.location_alerts,true) into v_allowed
    from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_category='sponsored' then
    select coalesce(np.sponsored,false)
      and (not v_personalized or coalesce(np.personalized_ads,false))
      and (not v_location_targeted or coalesce(np.location_based_offers,false))
      into v_allowed
    from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  end if;

  if coalesce(v_allowed,true) then return new; end if;

  insert into internal.notification_preference_suppressions(user_id,notification_type,preference_category)
  values(new.user_id,new.type,v_category);
  return null;
end;
$$;

update public.notification_native_push_deliveries
set status='superseded',
    updated_at=pg_catalog.now()
where status='failed'
  and last_error like '%PUSH_TOO_MANY_EXPERIENCE_IDS%';
