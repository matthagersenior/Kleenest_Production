-- Role-aware Fleet workspaces: operators keep the full control plane while
-- assigned drivers and Fleet client members get a safely gated "For Me"
-- workspace tied to Consumer discovery, Premium, notifications and their
-- own route execution context.

create or replace function public.fleet_product_enabled(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.businesses b
    where b.id=p_business_id
      and (
        b.business_tier::text='fleet'
        or exists(
          select 1
          from public.business_members bm
          join public.account_service_entitlements ase on ase.account_user_id=bm.user_id
          where bm.business_id=b.id
            and lower(bm.role::text) in ('owner','admin')
            and (coalesce(ase.fleet_enabled,false) or coalesce(ase.enterprise_fleet_enabled,false))
        )
      )
  );
$$;

revoke all on function public.fleet_product_enabled(uuid) from public,anon,authenticated;
grant execute on function public.fleet_product_enabled(uuid) to service_role;

create or replace function public.fleet_user_has_workspace_access(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select auth.uid() is not null
     and public.fleet_product_enabled(p_business_id)
     and (
       public.fleet_actor_is_manager(p_business_id)
       or exists(
         select 1 from public.fleet_drivers d
         where d.business_id=p_business_id
           and d.user_id=auth.uid()
           and lower(coalesce(d.status,'active')) not in ('deleted','revoked')
       )
       or exists(
         select 1 from public.fleet_premium_memberships m
         where m.business_id=p_business_id and m.user_id=auth.uid() and m.status='active'
       )
       or exists(
         select 1 from public.business_members bm
         where bm.business_id=p_business_id and bm.user_id=auth.uid()
       )
     );
$$;

revoke all on function public.fleet_user_has_workspace_access(uuid) from public,anon;
grant execute on function public.fleet_user_has_workspace_access(uuid) to authenticated,service_role;

-- "Observe" is operational Fleet data. It is intentionally narrower than
-- general Fleet workspace membership: only managers and assigned drivers
-- can observe route/geofence operational data.
create or replace function public.fleet_observe_access(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select auth.uid() is not null
     and public.fleet_product_enabled(p_business_id)
     and (
       public.fleet_actor_is_manager(p_business_id)
       or exists(
         select 1 from public.fleet_drivers d
         where d.business_id=p_business_id
           and d.user_id=auth.uid()
           and lower(coalesce(d.status,'active')) not in ('deleted','revoked')
       )
     );
$$;

revoke all on function public.fleet_observe_access(uuid) from public,anon;
grant execute on function public.fleet_observe_access(uuid) to authenticated,service_role;

create or replace function public.fleet_current_user_workspace_manifest()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  rows jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  with candidates as (
    select bm.business_id
    from public.business_members bm
    where bm.user_id=uid
    union
    select d.business_id
    from public.fleet_drivers d
    where d.user_id=uid and lower(coalesce(d.status,'active')) not in ('deleted','revoked')
    union
    select m.business_id
    from public.fleet_premium_memberships m
    where m.user_id=uid and m.status='active'
  ),
  scoped as (
    select
      b.id business_id,
      b.name business_name,
      b.logo_url,
      b.business_tier::text business_tier,
      b.is_demo_test,
      public.fleet_actor_is_manager(b.id) can_manage,
      exists(
        select 1 from public.fleet_drivers d
        where d.business_id=b.id and d.user_id=uid
          and lower(coalesce(d.status,'active')) not in ('deleted','revoked')
      ) can_drive,
      exists(
        select 1 from public.fleet_premium_memberships m
        where m.business_id=b.id and m.user_id=uid and m.status='active'
      ) premium_entitled,
      (
        select d.id from public.fleet_drivers d
        where d.business_id=b.id and d.user_id=uid
          and lower(coalesce(d.status,'active')) not in ('deleted','revoked')
        order by d.updated_at desc limit 1
      ) driver_id,
      (
        select bm.role::text from public.business_members bm
        where bm.business_id=b.id and bm.user_id=uid
        limit 1
      ) membership_role
    from candidates c
    join public.businesses b on b.id=c.business_id
    where public.fleet_product_enabled(b.id)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'business_id',s.business_id,
      'business_name',s.business_name,
      'logo_url',s.logo_url,
      'business_tier',s.business_tier,
      'is_demo_test',s.is_demo_test,
      'workspace_role',case when s.can_manage then 'operator' when s.can_drive then 'driver' else 'member' end,
      'role',coalesce(s.membership_role,case when s.can_drive then 'driver' else 'fleet_member' end),
      'driver_id',s.driver_id,
      'premium_entitled',s.premium_entitled,
      'capabilities',jsonb_build_object(
        'consumer_experience',true,
        'nearby_discovery',true,
        'consumer_premium',s.premium_entitled,
        'route_execution',s.can_drive,
        'route_geofencing',s.can_drive,
        'route_notifications',s.can_drive or s.can_manage,
        'dispatch_control',s.can_manage,
        'route_planning',s.can_manage,
        'asset_management',s.can_manage,
        'operations_intelligence',s.can_manage
      )
    )
    order by s.can_manage desc,s.can_drive desc,s.premium_entitled desc,s.is_demo_test asc,s.business_name
  ),'[]'::jsonb)
  into rows
  from scoped s;

  return jsonb_build_object(
    'user_id',uid,
    'workspaces',coalesce(rows,'[]'::jsonb),
    'model','fleet_role_workspace_v1'
  );
end;
$$;

revoke all on function public.fleet_current_user_workspace_manifest() from public,anon;
grant execute on function public.fleet_current_user_workspace_manifest() to authenticated,service_role;

create or replace function public.fleet_member_context(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  manifest jsonb;
  workspace jsonb;
  dispatch jsonb:='{}'::jsonb;
  policy jsonb:='{}'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not public.fleet_user_has_workspace_access(p_business_id) then
    raise exception 'Fleet workspace access required';
  end if;

  manifest:=public.fleet_current_user_workspace_manifest();
  select value into workspace
  from jsonb_array_elements(coalesce(manifest->'workspaces','[]'::jsonb))
  where value->>'business_id'=p_business_id::text
  limit 1;

  if workspace is null then raise exception 'Fleet workspace is unavailable'; end if;

  if coalesce((workspace->'capabilities'->>'route_execution')::boolean,false) then
    dispatch:=public.fleet_current_user_dispatch(p_business_id);
    policy:=public.fleet_exception_policy(p_business_id);
  end if;

  return jsonb_build_object(
    'workspace',workspace,
    'dispatch',coalesce(dispatch,'{}'::jsonb),
    'exception_policy',coalesce(policy,'{}'::jsonb),
    'generated_at',now()
  );
end;
$$;

revoke all on function public.fleet_member_context(uuid) from public,anon;
grant execute on function public.fleet_member_context(uuid) to authenticated,service_role;

-- Fleet includes up to 75 Consumer Premium seats by default. Explicit account
-- entitlement overrides still win.
create or replace function public.business_fleet_premium_limit(p_business_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_explicit integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_user_has_workspace_access(p_business_id)
     and not public.fleet_actor_is_manager(p_business_id)
     and not public.is_platform_owner_session() then
    raise exception 'Fleet workspace access required';
  end if;
  if not public.fleet_product_enabled(p_business_id) and not public.is_platform_owner_session() then
    return 0;
  end if;

  select ase.fleet_premium_limit into v_explicit
  from public.business_members bm
  join public.account_service_entitlements ase on ase.account_user_id=bm.user_id
  where bm.business_id=p_business_id
    and lower(bm.role::text) in ('owner','admin')
    and ase.fleet_premium_limit is not null
    and ase.fleet_premium_limit>0
  order by case when bm.user_id=auth.uid() then 0 else 1 end,
           case when lower(bm.role::text)='owner' then 0 else 1 end,
           ase.updated_at desc
  limit 1;

  return coalesce(v_explicit,75);
end;
$$;

revoke all on function public.business_fleet_premium_limit(uuid) from public,anon;
grant execute on function public.business_fleet_premium_limit(uuid) to authenticated,service_role;

comment on function public.fleet_current_user_workspace_manifest() is
  'Returns only Fleet workspaces connected to the signed-in user, with operator/driver/member role and capability gates.';
comment on function public.fleet_member_context(uuid) is
  'Returns a signed-in Fleet user safe workspace context plus only that assigned driver route context when applicable.';
comment on function public.fleet_observe_access(uuid) is
  'Restricts Fleet operational observation to managers or an assigned driver instead of any authenticated user.';


-- Convert an open route-stop geofence entry into a durable dwell/stall exception.
-- This closes the gap between native geofence enter/exit callbacks and the
-- server-side exception/notification system: the server can recognize a
-- driver who remains inside a stop geofence even when the app is backgrounded.
create or replace function public.materialize_fleet_active_dwell_exceptions()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  rec record;
  v_threshold_minutes integer;
  v_dwell_seconds integer;
  v_alert_id uuid;
  v_notification_id uuid;
  v_count integer:=0;
begin
  for rec in
    select
      s.id route_stop_id,
      s.business_id,
      s.route_id,
      s.stop_order,
      coalesce(s.stop_name,'Route stop') stop_name,
      s.planned_dwell_minutes,
      r.driver_id,
      r.vehicle_id,
      d.user_id driver_user_id,
      g.id geofence_id,
      e.id entry_event_id,
      e.user_id entry_user_id,
      e.occurred_at entered_at,
      coalesce(p.geofence_dwell_minutes,30) geofence_dwell_minutes,
      coalesce(p.dwell_overrun_minutes,10) dwell_overrun_minutes
    from public.fleet_route_stops s
    join public.fleet_routes r
      on r.id=s.route_id and r.business_id=s.business_id
    join public.business_geofences g
      on g.route_stop_id=s.id and g.business_id=s.business_id and coalesce(g.active,true)
    left join public.fleet_drivers d
      on d.id=r.driver_id and d.business_id=r.business_id
    left join public.fleet_exception_policies p
      on p.business_id=s.business_id
    join lateral (
      select ge.id,ge.user_id,ge.occurred_at
      from public.geofence_events ge
      where ge.geofence_id=g.id
        and lower(ge.event_type) in ('enter','entered','entry')
      order by ge.occurred_at desc
      limit 1
    ) e on true
    where s.notify_dwell
      and r.status in ('active','paused')
      and s.status not in ('completed','skipped','cancelled')
      and not exists(
        select 1
        from public.geofence_events gx
        where gx.geofence_id=g.id
          and gx.occurred_at>e.occurred_at
          and lower(gx.event_type) in ('exit','exited')
      )
  loop
    v_threshold_minutes:=greatest(
      1,
      rec.geofence_dwell_minutes,
      coalesce(rec.planned_dwell_minutes,0)+rec.dwell_overrun_minutes
    );
    v_dwell_seconds:=greatest(0,floor(extract(epoch from(now()-rec.entered_at)))::integer);

    if v_dwell_seconds < v_threshold_minutes*60 then
      continue;
    end if;

    v_alert_id:=public.materialize_fleet_exception_alert(
      rec.business_id,
      rec.vehicle_id,
      'route_stop_stall',
      'Fleet stop stall / dwell threshold',
      rec.stop_name||' has remained inside its route geofence for '||
        greatest(1,round(v_dwell_seconds/60.0))::text||' minutes.',
      'warning',
      'fleet_route_stop',
      rec.route_stop_id
    );

    -- Preserve a dwell observation in the canonical geofence event stream.
    insert into public.geofence_events(
      geofence_id,user_id,location_id,business_id,event_type,dwell_seconds,metadata
    )
    select
      rec.geofence_id,
      rec.entry_user_id,
      s.location_id,
      rec.business_id,
      'dwell_threshold',
      v_dwell_seconds,
      jsonb_build_object(
        'route_id',rec.route_id,
        'route_stop_id',rec.route_stop_id,
        'stop_order',rec.stop_order,
        'threshold_minutes',v_threshold_minutes,
        'source','fleet_active_dwell_watch'
      )
    from public.fleet_route_stops s
    where s.id=rec.route_stop_id
      and not exists(
        select 1 from public.geofence_events existing
        where existing.geofence_id=rec.geofence_id
          and lower(existing.event_type)='dwell_threshold'
          and existing.metadata->>'route_stop_id'=rec.route_stop_id::text
          and existing.occurred_at>=rec.entered_at
      );

    -- materialize_fleet_exception_alert owns the manager notification. Add the
    -- assigned driver's delivery to the same event so the client user sees
    -- the stall/dwell warning without gaining operator access.
    if rec.driver_user_id is not null then
      select ne.id into v_notification_id
      from public.notification_events ne
      where ne.dedupe_key='fleet-exception:'||v_alert_id::text
      order by ne.created_at desc
      limit 1;

      if v_notification_id is not null then
        insert into public.notification_deliveries(notification_id,recipient_user_id,channel)
        values
          (v_notification_id,rec.driver_user_id,'in_app'),
          (v_notification_id,rec.driver_user_id,'push')
        on conflict(notification_id,recipient_user_id,channel) do nothing;
      end if;
    end if;

    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.materialize_fleet_active_dwell_exceptions() from public,anon,authenticated;
grant execute on function public.materialize_fleet_active_dwell_exceptions() to service_role;

do $$
declare
  v_jobid bigint;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    select jobid into v_jobid from cron.job where jobname='fleet-active-dwell-watch' limit 1;
    if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
    perform cron.schedule(
      'fleet-active-dwell-watch',
      '*/5 * * * *',
      'select public.materialize_fleet_active_dwell_exceptions();'
    );
  end if;
end
$$;

comment on function public.materialize_fleet_active_dwell_exceptions() is
  'Server-side Fleet dwell/stall watchdog for active route-stop geofences; materializes manager alerts and assigned-driver notifications without requiring the mobile app to remain foregrounded.';
