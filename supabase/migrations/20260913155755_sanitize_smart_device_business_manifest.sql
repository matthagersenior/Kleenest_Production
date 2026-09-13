
create or replace function public.smart_device_manifest(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_role text;
  v_controller boolean;
  v_result jsonb;
begin
  if not public.smart_device_business_authorized(p_business_id,false) then
    raise exception 'Smart-device read authority required' using errcode='42501';
  end if;

  v_role:=public.current_user_business_role(p_business_id);
  v_controller:=public.is_platform_owner_session() or v_role in ('owner','admin','manager');

  select jsonb_build_object(
    'business_id',p_business_id,
    'access_mode',case when v_controller then 'controller' else 'observer' end,
    'connectors',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,
        'business_id',c.business_id,
        'location_id',c.location_id,
        'platform_partner_id',case when v_controller then c.platform_partner_id else null end,
        'name',c.name,
        'protocol',c.protocol,
        'status',c.status,
        'control_enabled',case when v_controller then c.control_enabled else false end,
        'telemetry_enabled',c.telemetry_enabled,
        'capabilities',c.capabilities,
        'last_health_at',c.last_health_at,
        'created_at',c.created_at,
        'updated_at',c.updated_at
      ) order by c.name)
      from public.smart_device_connectors c
      where c.business_id=p_business_id
    ),'[]'::jsonb),

    'devices',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,
        'business_id',d.business_id,
        'location_id',d.location_id,
        'connector_id',d.connector_id,
        'external_device_id',case when v_controller then d.external_device_id else null end,
        'name',d.name,
        'device_type',d.device_type,
        'manufacturer',d.manufacturer,
        'model',d.model,
        'firmware_version',d.firmware_version,
        'capabilities',d.capabilities,
        'tags',d.tags,
        'status',d.status,
        'control_enabled',case when v_controller then d.control_enabled else false end,
        'telemetry_enabled',d.telemetry_enabled,
        'last_seen_at',d.last_seen_at,
        'last_event_at',d.last_event_at,
        'last_command_at',case when v_controller then d.last_command_at else null end,
        'created_at',d.created_at,
        'updated_at',d.updated_at
      ) order by d.name)
      from public.smart_devices d
      where d.business_id=p_business_id
    ),'[]'::jsonb),

    'recent_events',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,
        'business_id',e.business_id,
        'device_id',e.device_id,
        'connector_id',e.connector_id,
        'event_type',e.event_type,
        'severity',e.severity,
        'metric',e.metric,
        'value_numeric',e.value_numeric,
        'value_text',e.value_text,
        'unit',e.unit,
        'source',e.source,
        'observed_at',e.observed_at,
        'received_at',e.received_at,
        'expires_at',e.expires_at
      ) order by e.observed_at desc)
      from (
        select *
        from public.smart_device_events
        where business_id=p_business_id
        order by observed_at desc
        limit 100
      ) e
    ),'[]'::jsonb),

    'recent_commands',case when v_controller then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',cmd.id,
        'business_id',cmd.business_id,
        'device_id',cmd.device_id,
        'connector_id',cmd.connector_id,
        'command',cmd.command,
        'risk_class',cmd.risk_class,
        'status',cmd.status,
        'requested_at',cmd.requested_at,
        'expires_at',cmd.expires_at,
        'claimed_at',cmd.claimed_at,
        'dispatched_at',cmd.dispatched_at,
        'completed_at',cmd.completed_at,
        'attempt_count',cmd.attempt_count
      ) order by cmd.requested_at desc)
      from (
        select *
        from public.smart_device_commands
        where business_id=p_business_id
        order by requested_at desc
        limit 100
      ) cmd
    ),'[]'::jsonb) else '[]'::jsonb end,

    'automations',case when v_controller then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,
        'business_id',r.business_id,
        'location_id',r.location_id,
        'device_id',r.device_id,
        'name',r.name,
        'enabled',r.enabled,
        'trigger_type',r.trigger_type,
        'trigger_config',r.trigger_config,
        'command',r.command,
        'command_arguments',r.command_arguments,
        'cooldown_seconds',r.cooldown_seconds,
        'last_fired_at',r.last_fired_at,
        'created_at',r.created_at,
        'updated_at',r.updated_at
      ) order by r.name)
      from public.smart_device_automation_rules r
      where r.business_id=p_business_id
    ),'[]'::jsonb) else '[]'::jsonb end,

    'health',jsonb_build_object(
      'total_devices',(select count(*) from public.smart_devices where business_id=p_business_id),
      'online_devices',(select count(*) from public.smart_devices where business_id=p_business_id and status='online'),
      'offline_devices',(select count(*) from public.smart_devices where business_id=p_business_id and status='offline'),
      'open_commands',case when v_controller then (
        select count(*) from public.smart_device_commands
        where business_id=p_business_id
          and status in ('pending_approval','queued','claimed','dispatched','acknowledged')
      ) else null end,
      'critical_events_24h',(
        select count(*) from public.smart_device_events
        where business_id=p_business_id
          and severity='critical'
          and observed_at>now()-interval '24 hours'
      )
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.smart_device_manifest(uuid) from public,anon;
grant execute on function public.smart_device_manifest(uuid) to authenticated,service_role;
