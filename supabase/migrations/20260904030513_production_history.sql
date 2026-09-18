create or replace function public.record_progression_event_v2(p_action text,p_subject jsonb default '{}'::jsonb,p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_cfg public.progression_xp_actions%rowtype;
  v_key text := coalesce(nullif(p_idempotency_key,''), p_action||':'||coalesce(p_subject->>'source_id',gen_random_uuid()::text));
  v_existing public.progression_events_v2%rowtype;
  v_tier integer := greatest(1,least(6,coalesce((p_subject->>'evidence_tier')::integer,1)));
  v_mult numeric;
  v_xp integer;
  v_event uuid;
  v_location uuid := nullif(p_subject->>'location_id','')::uuid;
  v_total bigint;
  v_level jsonb;
  v_specialty jsonb := '[]'::jsonb;
  v_count integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_cfg from public.progression_xp_actions where action=p_action and enabled;
  if not found then raise exception 'unsupported progression action'; end if;

  select * into v_existing from public.progression_events_v2 where user_id=v_user and idempotency_key=v_key;
  if found then
    return jsonb_build_object('event_id',v_existing.id,'xp_awarded',0,'duplicate',true,'objective_updates','[]'::jsonb);
  end if;

  if v_cfg.max_per_day is not null then
    select count(*) into v_count
    from public.progression_events_v2
    where user_id=v_user and action=p_action and created_at>=date_trunc('day',now()) and status='awarded';
    if v_count >= v_cfg.max_per_day then
      return jsonb_build_object('xp_awarded',0,'withheld',true,'reason','daily_limit','objective_updates','[]'::jsonb);
    end if;
  end if;

  if p_action like 'discover_%' and v_location is not null then
    if not exists(select 1 from public.discovery_contributions d where d.location_id=v_location and d.user_id=v_user and d.evidence_tier>=v_tier) then
      raise exception 'discovery evidence does not support requested tier';
    end if;
  end if;

  v_mult := case v_tier when 1 then 1.0 when 2 then 1.15 when 3 then 1.35 when 4 then 1.75 when 5 then 2.0 else 2.25 end;
  v_xp := round(v_cfg.base_xp*v_mult)::integer;

  insert into public.progression_events_v2(user_id,action,location_id,subject,evidence_tier,base_xp,multiplier,xp_awarded,idempotency_key)
  values(v_user,p_action,v_location,coalesce(p_subject,'{}'::jsonb),v_tier,v_cfg.base_xp,v_mult,v_xp,v_key)
  returning id into v_event;

  insert into public.progression_metric_events(user_id,metric,source_type,source_id,quantity,points_awarded,metadata)
  values(v_user,'xp_v2','progression_event_v2',v_event,1,v_xp,jsonb_build_object('action',p_action,'evidence_tier',v_tier))
  on conflict do nothing;

  if v_cfg.specialty is not null then
    v_specialty := jsonb_build_array(jsonb_build_object('specialty',v_cfg.specialty,'xp_awarded',v_xp));
  end if;

  insert into public.user_objective_progress_v2(objective_id,user_id,progress,target,state,completed_at,updated_at)
  select o.id,
         v_user,
         least(coalesce((o.rules->>'target')::numeric,1),1),
         coalesce((o.rules->>'target')::numeric,1),
         case when coalesce((o.rules->>'target')::numeric,1)<=1 then 'completed' else 'active' end,
         case when coalesce((o.rules->>'target')::numeric,1)<=1 then now() else null end,
         now()
  from public.progression_objectives_v2 o
  where o.status='active'
    and (o.starts_at is null or o.starts_at<=now())
    and (o.ends_at is null or o.ends_at>=now())
    and (
      o.rules->>'action'=p_action
      or (o.rules->>'action'='discover_any' and p_action like 'discover_%')
      or coalesce(o.rules->'actions','[]'::jsonb) ? p_action
    )
  on conflict(objective_id,user_id) do update
  set progress=least(public.user_objective_progress_v2.target,public.user_objective_progress_v2.progress+1),
      updated_at=now(),
      state=case when public.user_objective_progress_v2.progress+1>=public.user_objective_progress_v2.target then 'completed' else public.user_objective_progress_v2.state end,
      completed_at=case when public.user_objective_progress_v2.progress+1>=public.user_objective_progress_v2.target then coalesce(public.user_objective_progress_v2.completed_at,now()) else public.user_objective_progress_v2.completed_at end;

  select coalesce(sum(xp_awarded),0)::bigint into v_total
  from public.progression_events_v2
  where user_id=v_user and status='awarded';
  v_level:=public._progression_level_for_xp(v_total);

  return jsonb_build_object(
    'event_id',v_event,
    'base_xp',v_cfg.base_xp,
    'multiplier',v_mult,
    'xp_awarded',v_xp,
    'evidence_tier',v_tier,
    'global_level',v_level,
    'specialty_updates',v_specialty,
    'objective_updates',(
      select coalesce(jsonb_agg(jsonb_build_object('objective_id',up.objective_id,'progress',up.progress,'target',up.target,'state',up.state)),'[]'::jsonb)
      from public.user_objective_progress_v2 up
      join public.progression_objectives_v2 o on o.id=up.objective_id
      where up.user_id=v_user and (
        o.rules->>'action'=p_action
        or (o.rules->>'action'='discover_any' and p_action like 'discover_%')
        or coalesce(o.rules->'actions','[]'::jsonb) ? p_action
      )
    ),
    'duplicate',false
  );
end $$;
