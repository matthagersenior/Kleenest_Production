alter table public.platform_notification_rule_runs
  add column if not exists suppression_breakdown jsonb not null default '{}'::jsonb;

alter table public.platform_notification_rules
  alter column frequency_cap_window_minutes set default 30;

create or replace function internal.platform_notification_default_cap_minutes(p_class text)
returns integer
language sql
immutable
set search_path=''
as $$
  select case lower(coalesce(p_class,'platform'))
    when 'operational' then 10
    when 'location' then 15
    when 'progression' then 20
    when 'incentive' then 20
    when 'sponsored' then 60
    when 'social' then 30
    when 'intelligence' then 30
    else 30
  end;
$$;

revoke all on function internal.platform_notification_default_cap_minutes(text) from public,anon,authenticated;

create or replace function internal.apply_platform_notification_default_cap()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(new.frequency_cap_count,1)=1
     and coalesce(new.frequency_cap_window_minutes,120)=120 then
    new.frequency_cap_window_minutes:=internal.platform_notification_default_cap_minutes(new.notification_class);
  end if;
  return new;
end;
$$;

revoke all on function internal.apply_platform_notification_default_cap() from public,anon,authenticated;

drop trigger if exists platform_notification_default_cap on public.platform_notification_rules;
create trigger platform_notification_default_cap
before insert on public.platform_notification_rules
for each row execute function internal.apply_platform_notification_default_cap();

update public.platform_notification_rules
set frequency_cap_window_minutes=internal.platform_notification_default_cap_minutes(notification_class),
    updated_at=now()
where frequency_cap_count=1
  and frequency_cap_window_minutes=120;

create or replace function internal.materialize_platform_notification_rule(
  p_rule_id uuid,
  p_event_id uuid,
  p_trigger_type text default 'live_network',
  p_initiated_by uuid default null,
  p_force_dry_run boolean default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rule public.platform_notification_rules%rowtype;
  v_event public.live_network_events%rowtype;
  v_run uuid;
  v_user uuid;
  v_profile public.profiles%rowtype;
  v_candidate integer:=0;
  v_delivered integer:=0;
  v_suppressed integer:=0;
  v_suppressed_targeting integer:=0;
  v_suppressed_preferences integer:=0;
  v_suppressed_frequency integer:=0;
  v_suppressed_downstream integer:=0;
  v_notification_id uuid;
  v_title text;
  v_body text;
  v_location_name text;
  v_business_name text;
  v_recent integer;
  v_dry boolean;
  v_force_frequency boolean:=false;
begin
  select * into v_rule from public.platform_notification_rules where id=p_rule_id;
  select * into v_event from public.live_network_events where id=p_event_id;
  if v_rule.id is null or v_event.id is null then raise exception 'Rule/event not found'; end if;

  v_dry:=coalesce(p_force_dry_run,v_rule.dry_run);
  v_force_frequency:=
    coalesce(p_trigger_type,'')='owner_force'
    and p_initiated_by is not null
    and public.is_platform_owner(p_initiated_by);

  insert into public.platform_notification_rule_runs(rule_id,event_id,trigger_type,dry_run,initiated_by)
  values(v_rule.id,v_event.id,coalesce(p_trigger_type,'live_network'),v_dry,p_initiated_by)
  returning id into v_run;

  select l.name,b.name
  into v_location_name,v_business_name
  from public.locations l
  left join public.businesses b on b.id=l.business_id
  where l.id=v_event.location_id;

  v_title:=replace(
    replace(
      replace(v_rule.title_template,'{{event_type}}',v_event.event_type),
      '{{location_name}}',coalesce(v_location_name,'Kleenest location')
    ),
    '{{business_name}}',coalesce(v_business_name,'Kleenest business')
  );
  v_body:=replace(
    replace(
      replace(v_rule.body_template,'{{event_type}}',v_event.event_type),
      '{{location_name}}',coalesce(v_location_name,'this location')
    ),
    '{{business_name}}',coalesce(v_business_name,'this business')
  );

  for v_user in
    select distinct r.user_id
    from internal.resolve_platform_notification_rule_recipients(v_rule.id,v_event.id) r
  loop
    v_candidate:=v_candidate+1;
    select * into v_profile from public.profiles where id=v_user;

    if v_profile.id is null
      or (v_rule.targeting ? 'min_level' and coalesce(v_profile.level,0)<(v_rule.targeting->>'min_level')::integer)
      or (v_rule.targeting ? 'max_level' and coalesce(v_profile.level,0)>(v_rule.targeting->>'max_level')::integer)
      or (v_rule.targeting ? 'min_streak' and coalesce(v_profile.streak,0)<(v_rule.targeting->>'min_streak')::integer)
      or (v_rule.targeting ? 'min_checkins' and coalesce(v_profile.total_check_ins,0)<(v_rule.targeting->>'min_checkins')::integer)
      or (
        jsonb_typeof(v_rule.targeting->'subscription_tiers')='array'
        and not exists(
          select 1
          from jsonb_array_elements_text(v_rule.targeting->'subscription_tiers') x
          where lower(x)=lower(coalesce(v_profile.subscription_tier::text,''))
        )
      )
    then
      v_suppressed:=v_suppressed+1;
      v_suppressed_targeting:=v_suppressed_targeting+1;
      continue;
    end if;

    if not internal.platform_notification_preference_allowed(
      v_user,
      v_rule.notification_class,
      v_rule.sponsored_message,
      v_rule.personalized,
      v_rule.location_targeted
    ) then
      v_suppressed:=v_suppressed+1;
      v_suppressed_preferences:=v_suppressed_preferences+1;
      continue;
    end if;

    if not v_force_frequency then
      select count(*) into v_recent
      from public.platform_notification_attribution a
      where a.rule_id=v_rule.id
        and a.user_id=v_user
        and a.delivered_at>now()-make_interval(mins=>v_rule.frequency_cap_window_minutes);

      if v_recent>=v_rule.frequency_cap_count then
        v_suppressed:=v_suppressed+1;
        v_suppressed_frequency:=v_suppressed_frequency+1;
        continue;
      end if;
    end if;

    if v_dry then continue; end if;

    v_notification_id:=null;
    insert into public.notifications(user_id,type,title,body,data)
    values(
      v_user,
      case when v_rule.sponsored_message then 'sponsored_campaign' else v_rule.notification_class||'_campaign' end,
      v_title,
      v_body,
      jsonb_build_object(
        'notification_class',v_rule.notification_class,
        'platform_notification_rule_id',v_rule.id,
        'platform_notification_run_id',v_run,
        'live_network_event_id',v_event.id,
        'location_id',v_event.location_id,
        'app_targets',to_jsonb(v_rule.app_targets),
        'channels',to_jsonb(v_rule.channels),
        'priority',v_rule.priority,
        'deep_link',v_rule.deep_link,
        'image_url',v_rule.image_url,
        'incentive',v_rule.incentive,
        'attribution',v_rule.attribution,
        'sponsored',v_rule.sponsored_message,
        'personalized',v_rule.personalized,
        'location_targeted',v_rule.location_targeted,
        'campaign_code',v_rule.code,
        'frequency_cap_bypassed',v_force_frequency
      ) || coalesce(v_event.payload,'{}'::jsonb)
    )
    returning id into v_notification_id;

    if v_notification_id is not null then
      insert into public.platform_notification_attribution(rule_id,run_id,event_id,notification_id,user_id,metadata)
      values(
        v_rule.id,
        v_run,
        v_event.id,
        v_notification_id,
        v_user,
        jsonb_build_object(
          'event_type',v_event.event_type,
          'campaign_code',v_rule.code,
          'frequency_cap_bypassed',v_force_frequency
        )
      );
      v_delivered:=v_delivered+1;
    else
      v_suppressed:=v_suppressed+1;
      v_suppressed_downstream:=v_suppressed_downstream+1;
    end if;
  end loop;

  update public.platform_notification_rule_runs
  set status='completed',
      candidate_count=v_candidate,
      delivered_count=v_delivered,
      suppressed_count=v_suppressed,
      suppression_breakdown=jsonb_build_object(
        'targeting',v_suppressed_targeting,
        'consent_preferences',v_suppressed_preferences,
        'frequency_cap',v_suppressed_frequency,
        'downstream_filter',v_suppressed_downstream
      ),
      finished_at=now()
  where id=v_run;

  return v_run;
exception when others then
  if v_run is not null then
    update public.platform_notification_rule_runs
    set status='failed',
        candidate_count=v_candidate,
        delivered_count=v_delivered,
        suppressed_count=v_suppressed,
        suppression_breakdown=jsonb_build_object(
          'targeting',v_suppressed_targeting,
          'consent_preferences',v_suppressed_preferences,
          'frequency_cap',v_suppressed_frequency,
          'downstream_filter',v_suppressed_downstream
        ),
        error=left(sqlerrm,1000),
        finished_at=now()
    where id=v_run;
  end if;
  raise;
end;
$$;

revoke all on function internal.materialize_platform_notification_rule(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;

create or replace function internal.evaluate_platform_notification_rules()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rule record;
  v_requested uuid;
begin
  if lower(coalesce(new.payload->>'owner_manual_materialize','false')) in ('true','t','1','yes') then
    return new;
  end if;

  begin
    v_requested:=nullif(new.payload->>'platform_rule_id','')::uuid;
  exception when invalid_text_representation then
    v_requested:=null;
  end;

  for v_rule in
    select r.id
    from public.platform_notification_rules r
    where r.enabled=true
      and (r.starts_at is null or r.starts_at<=now())
      and (r.ends_at is null or r.ends_at>now())
      and (v_requested is null or r.id=v_requested)
      and (
        (r.match_mode='exact' and r.event_pattern=new.event_type)
        or (r.match_mode='prefix' and new.event_type like r.event_pattern||'%')
      )
  loop
    begin
      perform internal.materialize_platform_notification_rule(v_rule.id,new.id,'live_network',null,null);
    exception when others then
      null;
    end;
  end loop;
  return new;
end;
$$;

revoke all on function internal.evaluate_platform_notification_rules() from public,anon,authenticated;

create or replace function public.owner_publish_platform_notification_rule(
  p_rule_id uuid,
  p_location_id uuid,
  p_payload jsonb,
  p_force_dry_run boolean,
  p_bypass_frequency_cap boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_rule public.platform_notification_rules%rowtype;
  v_event uuid;
  v_event_type text;
  v_run uuid;
  v_trigger_type text;
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then
    raise exception 'Platform owner access required';
  end if;

  select * into v_rule
  from public.platform_notification_rules
  where id=p_rule_id;

  if v_rule.id is null then raise exception 'Notification rule not found'; end if;

  v_event_type:=case
    when v_rule.match_mode='prefix' then v_rule.event_pattern||'owner_test'
    else v_rule.event_pattern
  end;

  insert into public.live_network_events(event_type,location_id,actor_type,actor_id,payload)
  values(
    v_event_type,
    p_location_id,
    'platform',
    v_uid,
    coalesce(p_payload,'{}'::jsonb)
      || jsonb_build_object(
        'platform_rule_id',v_rule.id,
        'owner_initiated',true,
        'owner_manual_materialize',true,
        'owner_bypass_frequency_cap',coalesce(p_bypass_frequency_cap,false)
      )
  )
  returning id into v_event;

  v_trigger_type:=case
    when coalesce(p_bypass_frequency_cap,false) then 'owner_force'
    when coalesce(p_force_dry_run,v_rule.dry_run) then 'owner_preview'
    else 'owner_manual'
  end;

  v_run:=internal.materialize_platform_notification_rule(
    v_rule.id,
    v_event,
    v_trigger_type,
    v_uid,
    p_force_dry_run
  );

  insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,new_state)
  values(
    v_uid,
    'notifications',
    case when coalesce(p_bypass_frequency_cap,false) then 'force_publish_rule' else 'publish_rule' end,
    v_rule.code,
    jsonb_build_object(
      'rule_id',v_rule.id,
      'event_id',v_event,
      'run_id',v_run,
      'force_dry_run',p_force_dry_run,
      'bypass_frequency_cap',coalesce(p_bypass_frequency_cap,false)
    )
  );

  return jsonb_build_object(
    'rule_id',v_rule.id,
    'event_id',v_event,
    'run_id',v_run,
    'bypass_frequency_cap',coalesce(p_bypass_frequency_cap,false)
  );
end;
$$;

revoke all on function public.owner_publish_platform_notification_rule(uuid,uuid,jsonb,boolean,boolean) from public,anon;
grant execute on function public.owner_publish_platform_notification_rule(uuid,uuid,jsonb,boolean,boolean) to authenticated,service_role;

create or replace function public.owner_publish_platform_notification_rule(
  p_rule_id uuid,
  p_location_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_force_dry_run boolean default null
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select public.owner_publish_platform_notification_rule(
    p_rule_id,
    p_location_id,
    p_payload,
    p_force_dry_run,
    false
  );
$$;

revoke all on function public.owner_publish_platform_notification_rule(uuid,uuid,jsonb,boolean) from public,anon;
grant execute on function public.owner_publish_platform_notification_rule(uuid,uuid,jsonb,boolean) to authenticated,service_role;

create or replace function public.register_notification_native_push_token(
  p_token text,
  p_platform text,
  p_app_id text default 'com.kleenest.app'
)
returns public.notification_native_push_tokens
language plpgsql
security definer
set search_path=''
as $$
declare
  result public.notification_native_push_tokens;
  normalized_token text:=pg_catalog.btrim(p_token);
  normalized_app text:=coalesce(nullif(pg_catalog.btrim(p_app_id),''),'com.kleenest.app');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(normalized_token,'') is null then raise exception 'Push token is required'; end if;
  if p_platform not in ('ios','android') then raise exception 'Unsupported push platform'; end if;
  if normalized_token !~ '^Expo(nent)?PushToken\\[[^]]+\\]$' then raise exception 'Invalid Expo push token'; end if;

  update public.notification_native_push_tokens
  set active=false,updated_at=pg_catalog.now()
  where token=normalized_token
    and user_id<>auth.uid()
    and active=true;

  insert into public.notification_native_push_tokens(
    user_id,token,provider,platform,app_id,active,updated_at
  )
  values(
    auth.uid(),normalized_token,'expo',p_platform,normalized_app,true,pg_catalog.now()
  )
  on conflict(user_id,token) do update
    set platform=excluded.platform,
        app_id=excluded.app_id,
        active=true,
        updated_at=pg_catalog.now()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.register_notification_native_push_token(text,text,text) from public,anon;
grant execute on function public.register_notification_native_push_token(text,text,text) to authenticated,service_role;
