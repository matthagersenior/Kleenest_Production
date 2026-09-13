-- Provider-neutral IoT / Smart Device control plane.
-- Bridges (Matter, MQTT, vendor cloud, generic gateways) authenticate through the
-- existing Partner Platform instead of placing vendor credentials in Kleenest clients.

create table if not exists public.smart_device_connectors (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  platform_partner_id uuid references public.platform_partners(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 160),
  protocol text not null check (protocol in ('matter_bridge','mqtt_bridge','vendor_cloud','generic_gateway','manual')),
  external_account_id text,
  status text not null default 'pending' check (status in ('pending','online','degraded','offline','disabled')),
  control_enabled boolean not null default false,
  telemetry_enabled boolean not null default true,
  capabilities text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  last_health_at timestamptz,
  last_error text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.smart_devices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  connector_id uuid not null references public.smart_device_connectors(id) on delete cascade,
  external_device_id text not null,
  name text not null check (length(trim(name)) between 1 and 160),
  device_type text not null default 'sensor',
  manufacturer text,
  model text,
  firmware_version text,
  capabilities text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  status text not null default 'unknown' check (status in ('unknown','online','degraded','offline','disabled')),
  control_enabled boolean not null default false,
  telemetry_enabled boolean not null default true,
  last_seen_at timestamptz,
  last_event_at timestamptz,
  last_command_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connector_id, external_device_id)
);

create table if not exists public.smart_device_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  device_id uuid not null references public.smart_devices(id) on delete cascade,
  connector_id uuid not null references public.smart_device_connectors(id) on delete cascade,
  event_type text not null,
  severity text not null default 'info' check (severity in ('debug','info','notice','warning','critical')),
  metric text,
  value_numeric double precision,
  value_text text,
  unit text,
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'bridge',
  dedupe_key text,
  observed_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create unique index if not exists smart_device_events_dedupe_idx
  on public.smart_device_events(device_id,dedupe_key)
  where dedupe_key is not null;
create index if not exists smart_device_events_business_time_idx
  on public.smart_device_events(business_id,observed_at desc);
create index if not exists smart_device_events_device_time_idx
  on public.smart_device_events(device_id,observed_at desc);

create table if not exists public.smart_device_commands (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  device_id uuid not null references public.smart_devices(id) on delete cascade,
  connector_id uuid not null references public.smart_device_connectors(id) on delete cascade,
  command text not null,
  arguments jsonb not null default '{}'::jsonb,
  risk_class text not null default 'standard' check (risk_class in ('standard','sensitive','high')),
  status text not null default 'queued' check (status in ('pending_approval','queued','claimed','dispatched','acknowledged','completed','failed','cancelled','expired')),
  idempotency_key text not null,
  requested_by uuid,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  claimed_at timestamptz,
  dispatched_at timestamptz,
  completed_at timestamptz,
  attempt_count integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  error text,
  approval_notes text,
  metadata jsonb not null default '{}'::jsonb,
  unique(business_id,idempotency_key)
);

create index if not exists smart_device_commands_dispatch_idx
  on public.smart_device_commands(status,requested_at)
  where status='queued';
create index if not exists smart_device_commands_business_time_idx
  on public.smart_device_commands(business_id,requested_at desc);

create table if not exists public.smart_device_automation_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  device_id uuid references public.smart_devices(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  enabled boolean not null default true,
  trigger_type text not null check (trigger_type in ('event_type','metric_threshold','status_changed')),
  trigger_config jsonb not null default '{}'::jsonb,
  command text not null,
  command_arguments jsonb not null default '{}'::jsonb,
  cooldown_seconds integer not null default 300 check (cooldown_seconds between 0 and 86400),
  last_fired_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists smart_device_automation_business_idx
  on public.smart_device_automation_rules(business_id,enabled);

alter table public.smart_device_connectors enable row level security;
alter table public.smart_devices enable row level security;
alter table public.smart_device_events enable row level security;
alter table public.smart_device_commands enable row level security;
alter table public.smart_device_automation_rules enable row level security;

create or replace function public.smart_device_business_authorized(
  p_business_id uuid,
  p_write boolean default false
) returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select auth.uid() is not null and (
    public.is_platform_owner_session()
    or (
      public.current_user_business_role(p_business_id) is not null
      and (
        not p_write
        or public.current_user_business_role(p_business_id) in ('owner','admin','manager')
      )
    )
  );
$function$;

revoke all on function public.smart_device_business_authorized(uuid,boolean) from public,anon;
grant execute on function public.smart_device_business_authorized(uuid,boolean) to authenticated,service_role;

drop policy if exists smart_device_connectors_read on public.smart_device_connectors;
create policy smart_device_connectors_read on public.smart_device_connectors
for select to authenticated
using (public.smart_device_business_authorized(business_id,false));

drop policy if exists smart_devices_read on public.smart_devices;
create policy smart_devices_read on public.smart_devices
for select to authenticated
using (public.smart_device_business_authorized(business_id,false));

drop policy if exists smart_device_events_read on public.smart_device_events;
create policy smart_device_events_read on public.smart_device_events
for select to authenticated
using (public.smart_device_business_authorized(business_id,false));

drop policy if exists smart_device_commands_read on public.smart_device_commands;
create policy smart_device_commands_read on public.smart_device_commands
for select to authenticated
using (public.smart_device_business_authorized(business_id,false));

drop policy if exists smart_device_automations_read on public.smart_device_automation_rules;
create policy smart_device_automations_read on public.smart_device_automation_rules
for select to authenticated
using (public.smart_device_business_authorized(business_id,false));

revoke all on table public.smart_device_connectors from anon,authenticated;
revoke all on table public.smart_devices from anon,authenticated;
revoke all on table public.smart_device_events from anon,authenticated;
revoke all on table public.smart_device_commands from anon,authenticated;
revoke all on table public.smart_device_automation_rules from anon,authenticated;
grant select on table public.smart_device_connectors to authenticated;
grant select on table public.smart_devices to authenticated;
grant select on table public.smart_device_events to authenticated;
grant select on table public.smart_device_commands to authenticated;
grant select on table public.smart_device_automation_rules to authenticated;

create or replace function public.smart_device_command_risk(p_command text)
returns text
language sql
immutable
set search_path=''
as $function$
  select case
    when lower(trim(coalesce(p_command,''))) in (
      'unlock','unlock_door','open_door','disable_alarm','disable_safety',
      'factory_reset','firmware_update','disable_access_control'
    ) then 'high'
    when lower(trim(coalesce(p_command,''))) in (
      'restart','reboot','reset','calibrate','set_threshold','change_mode'
    ) then 'sensitive'
    else 'standard'
  end;
$function$;

revoke all on function public.smart_device_command_risk(text) from public,anon;
grant execute on function public.smart_device_command_risk(text) to authenticated,service_role;

create or replace function public.smart_device_upsert_connector(
  p_business_id uuid,
  p_name text,
  p_protocol text,
  p_connector_id uuid default null,
  p_location_id uuid default null,
  p_platform_partner_id uuid default null,
  p_control_enabled boolean default false,
  p_telemetry_enabled boolean default true,
  p_capabilities text[] default '{}'::text[],
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare v_id uuid;
begin
  if not public.smart_device_business_authorized(p_business_id,true) then
    raise exception 'Smart-device write authority required' using errcode='42501';
  end if;
  if p_protocol not in ('matter_bridge','mqtt_bridge','vendor_cloud','generic_gateway','manual') then
    raise exception 'Unsupported connector protocol';
  end if;
  if p_platform_partner_id is not null and not exists(
    select 1 from public.platform_partners p where p.id=p_platform_partner_id and p.status='active'
  ) then raise exception 'Active platform partner required'; end if;

  if p_connector_id is null then
    insert into public.smart_device_connectors(
      business_id,location_id,platform_partner_id,name,protocol,control_enabled,
      telemetry_enabled,capabilities,metadata,created_by
    ) values(
      p_business_id,p_location_id,p_platform_partner_id,trim(p_name),p_protocol,
      p_control_enabled,p_telemetry_enabled,coalesce(p_capabilities,'{}'::text[]),
      coalesce(p_metadata,'{}'::jsonb),auth.uid()
    ) returning id into v_id;
  else
    update public.smart_device_connectors set
      location_id=p_location_id,
      platform_partner_id=p_platform_partner_id,
      name=trim(p_name),
      protocol=p_protocol,
      control_enabled=p_control_enabled,
      telemetry_enabled=p_telemetry_enabled,
      capabilities=coalesce(p_capabilities,'{}'::text[]),
      metadata=coalesce(p_metadata,'{}'::jsonb),
      updated_at=now()
    where id=p_connector_id and business_id=p_business_id
    returning id into v_id;
    if v_id is null then raise exception 'Connector not found'; end if;
  end if;
  return v_id;
end;
$function$;

create or replace function public.smart_device_upsert_device(
  p_business_id uuid,
  p_connector_id uuid,
  p_external_device_id text,
  p_name text,
  p_device_id uuid default null,
  p_location_id uuid default null,
  p_device_type text default 'sensor',
  p_manufacturer text default null,
  p_model text default null,
  p_firmware_version text default null,
  p_capabilities text[] default '{}'::text[],
  p_tags text[] default '{}'::text[],
  p_control_enabled boolean default false,
  p_telemetry_enabled boolean default true,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare v_id uuid;
begin
  if not public.smart_device_business_authorized(p_business_id,true) then
    raise exception 'Smart-device write authority required' using errcode='42501';
  end if;
  if not exists(select 1 from public.smart_device_connectors c where c.id=p_connector_id and c.business_id=p_business_id) then
    raise exception 'Connector does not belong to Business';
  end if;

  if p_device_id is null then
    insert into public.smart_devices(
      business_id,location_id,connector_id,external_device_id,name,device_type,
      manufacturer,model,firmware_version,capabilities,tags,control_enabled,
      telemetry_enabled,metadata,created_by
    ) values(
      p_business_id,p_location_id,p_connector_id,trim(p_external_device_id),trim(p_name),
      coalesce(nullif(trim(p_device_type),''),'sensor'),p_manufacturer,p_model,p_firmware_version,
      coalesce(p_capabilities,'{}'::text[]),coalesce(p_tags,'{}'::text[]),
      p_control_enabled,p_telemetry_enabled,coalesce(p_metadata,'{}'::jsonb),auth.uid()
    )
    on conflict(connector_id,external_device_id) do update set
      name=excluded.name,location_id=excluded.location_id,device_type=excluded.device_type,
      manufacturer=excluded.manufacturer,model=excluded.model,firmware_version=excluded.firmware_version,
      capabilities=excluded.capabilities,tags=excluded.tags,control_enabled=excluded.control_enabled,
      telemetry_enabled=excluded.telemetry_enabled,metadata=excluded.metadata,updated_at=now()
    returning id into v_id;
  else
    update public.smart_devices set
      location_id=p_location_id,connector_id=p_connector_id,external_device_id=trim(p_external_device_id),
      name=trim(p_name),device_type=coalesce(nullif(trim(p_device_type),''),'sensor'),
      manufacturer=p_manufacturer,model=p_model,firmware_version=p_firmware_version,
      capabilities=coalesce(p_capabilities,'{}'::text[]),tags=coalesce(p_tags,'{}'::text[]),
      control_enabled=p_control_enabled,telemetry_enabled=p_telemetry_enabled,
      metadata=coalesce(p_metadata,'{}'::jsonb),updated_at=now()
    where id=p_device_id and business_id=p_business_id
    returning id into v_id;
    if v_id is null then raise exception 'Device not found'; end if;
  end if;
  return v_id;
end;
$function$;

create or replace function public.smart_device_manifest(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not public.smart_device_business_authorized(p_business_id,false) then
    raise exception 'Smart-device read authority required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'connectors',coalesce((select jsonb_agg(to_jsonb(c) order by c.name)
      from public.smart_device_connectors c where c.business_id=p_business_id),'[]'::jsonb),
    'devices',coalesce((select jsonb_agg(to_jsonb(d) order by d.name)
      from public.smart_devices d where d.business_id=p_business_id),'[]'::jsonb),
    'recent_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.observed_at desc)
      from (select * from public.smart_device_events where business_id=p_business_id order by observed_at desc limit 100) e),'[]'::jsonb),
    'recent_commands',coalesce((select jsonb_agg(to_jsonb(cmd) order by cmd.requested_at desc)
      from (select * from public.smart_device_commands where business_id=p_business_id order by requested_at desc limit 100) cmd),'[]'::jsonb),
    'automations',coalesce((select jsonb_agg(to_jsonb(r) order by r.name)
      from public.smart_device_automation_rules r where r.business_id=p_business_id),'[]'::jsonb),
    'health',jsonb_build_object(
      'total_devices',(select count(*) from public.smart_devices where business_id=p_business_id),
      'online_devices',(select count(*) from public.smart_devices where business_id=p_business_id and status='online'),
      'offline_devices',(select count(*) from public.smart_devices where business_id=p_business_id and status='offline'),
      'open_commands',(select count(*) from public.smart_device_commands where business_id=p_business_id and status in ('pending_approval','queued','claimed','dispatched','acknowledged')),
      'critical_events_24h',(select count(*) from public.smart_device_events where business_id=p_business_id and severity='critical' and observed_at>now()-interval '24 hours')
    )
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.smart_device_command(
  p_business_id uuid,
  p_device_id uuid,
  p_command text,
  p_arguments jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_device public.smart_devices;
  v_connector public.smart_device_connectors;
  v_command text:=lower(trim(coalesce(p_command,'')));
  v_risk text;
  v_status text;
  v_key text:=coalesce(nullif(trim(p_idempotency_key),''),gen_random_uuid()::text);
  v_row public.smart_device_commands;
begin
  if not public.smart_device_business_authorized(p_business_id,true) then
    raise exception 'Smart-device command authority required' using errcode='42501';
  end if;
  select * into v_device from public.smart_devices d
  where d.id=p_device_id and d.business_id=p_business_id;
  if v_device.id is null then raise exception 'Device not found'; end if;
  select * into v_connector from public.smart_device_connectors c where c.id=v_device.connector_id;
  if not v_device.control_enabled or not v_connector.control_enabled then\n    raise exception 'Device control is disabled';\n  end if;\n  if v_connector.platform_partner_id is null and v_connector.protocol<>'manual' then\n    raise exception 'Device connector is not paired to an integration partner';\n  end if;
  if v_command='' then raise exception 'Command is required'; end if;
  if not (
    ('command:*'=any(v_device.capabilities))
    or (('command:'||v_command)=any(v_device.capabilities))
  ) then raise exception 'Command is not declared by this device'; end if;

  select * into v_row from public.smart_device_commands
  where business_id=p_business_id and idempotency_key=v_key;
  if v_row.id is not null then return to_jsonb(v_row); end if;

  v_risk:=public.smart_device_command_risk(v_command);
  v_status:=case when v_risk='high' and not public.is_platform_owner_session()
    then 'pending_approval' else 'queued' end;

  insert into public.smart_device_commands(
    business_id,device_id,connector_id,command,arguments,risk_class,status,
    idempotency_key,requested_by,expires_at
  ) values(
    p_business_id,p_device_id,v_device.connector_id,v_command,coalesce(p_arguments,'{}'::jsonb),
    v_risk,v_status,v_key,auth.uid(),coalesce(p_expires_at,now()+interval '5 minutes')
  ) returning * into v_row;

  update public.smart_devices set last_command_at=now(),updated_at=now() where id=p_device_id;
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.smart_device_set_automation_rule(
  p_business_id uuid,
  p_name text,
  p_trigger_type text,
  p_trigger_config jsonb,
  p_command text,
  p_rule_id uuid default null,
  p_location_id uuid default null,
  p_device_id uuid default null,
  p_command_arguments jsonb default '{}'::jsonb,
  p_cooldown_seconds integer default 300,
  p_enabled boolean default true
) returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare v_id uuid; v_command text:=lower(trim(coalesce(p_command,'')));
begin
  if not public.smart_device_business_authorized(p_business_id,true) then
    raise exception 'Smart-device automation authority required' using errcode='42501';
  end if;
  if p_trigger_type not in ('event_type','metric_threshold','status_changed') then
    raise exception 'Unsupported automation trigger';
  end if;
  if public.smart_device_command_risk(v_command)='high' then
    raise exception 'High-risk commands cannot be automated';
  end if;
  if p_device_id is not null and not exists(
    select 1 from public.smart_devices d where d.id=p_device_id and d.business_id=p_business_id
  ) then raise exception 'Automation device not found'; end if;

  if p_rule_id is null then
    insert into public.smart_device_automation_rules(
      business_id,location_id,device_id,name,enabled,trigger_type,trigger_config,
      command,command_arguments,cooldown_seconds,created_by
    ) values(
      p_business_id,p_location_id,p_device_id,trim(p_name),p_enabled,p_trigger_type,
      coalesce(p_trigger_config,'{}'::jsonb),v_command,coalesce(p_command_arguments,'{}'::jsonb),
      greatest(0,least(coalesce(p_cooldown_seconds,300),86400)),auth.uid()
    ) returning id into v_id;
  else
    update public.smart_device_automation_rules set
      location_id=p_location_id,device_id=p_device_id,name=trim(p_name),enabled=p_enabled,
      trigger_type=p_trigger_type,trigger_config=coalesce(p_trigger_config,'{}'::jsonb),
      command=v_command,command_arguments=coalesce(p_command_arguments,'{}'::jsonb),
      cooldown_seconds=greatest(0,least(coalesce(p_cooldown_seconds,300),86400)),updated_at=now()
    where id=p_rule_id and business_id=p_business_id
    returning id into v_id;
    if v_id is null then raise exception 'Automation rule not found'; end if;
  end if;
  return v_id;
end;
$function$;

create or replace function public.owner_approve_smart_device_command(
  p_command_id uuid,
  p_approve boolean,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_row public.smart_device_commands;
begin
  if not public.is_platform_owner_session() then
    raise exception 'Platform owner authority required' using errcode='42501';
  end if;
  update public.smart_device_commands set
    status=case when p_approve then 'queued' else 'cancelled' end,
    approval_notes=nullif(trim(coalesce(p_notes,'')),''),
    completed_at=case when p_approve then null else now() end
  where id=p_command_id and status='pending_approval'
  returning * into v_row;
  if v_row.id is null then raise exception 'Pending command not found'; end if;
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.record_smart_device_event(
  p_partner_id uuid,
  p_external_device_id text,
  p_event_type text,
  p_severity text default 'info',
  p_metric text default null,
  p_value_numeric double precision default null,
  p_value_text text default null,
  p_unit text default null,
  p_payload jsonb default '{}'::jsonb,
  p_observed_at timestamptz default null,
  p_dedupe_key text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_device public.smart_devices;
  v_connector public.smart_device_connectors;
  v_event public.smart_device_events;
  v_rule public.smart_device_automation_rules;
  v_matches boolean;
  v_status text;
  v_partner_event text;
begin
  select d.* into v_device
  from public.smart_devices d
  join public.smart_device_connectors c on c.id=d.connector_id
  where c.platform_partner_id=p_partner_id
    and d.external_device_id=trim(p_external_device_id)
    and d.telemetry_enabled and c.telemetry_enabled
  order by d.created_at
  limit 1;
  if v_device.id is null then raise exception 'Registered telemetry device not found'; end if;
  select * into v_connector from public.smart_device_connectors where id=v_device.connector_id;

  insert into public.smart_device_events(
    business_id,device_id,connector_id,event_type,severity,metric,value_numeric,
    value_text,unit,payload,observed_at,dedupe_key
  ) values(
    v_device.business_id,v_device.id,v_device.connector_id,trim(p_event_type),
    case when p_severity in ('debug','info','notice','warning','critical') then p_severity else 'info' end,
    nullif(trim(coalesce(p_metric,'')),''),p_value_numeric,p_value_text,p_unit,
    coalesce(p_payload,'{}'::jsonb),coalesce(p_observed_at,now()),nullif(trim(coalesce(p_dedupe_key,'')),'')
  )
  on conflict(device_id,dedupe_key) where dedupe_key is not null do update
    set received_at=excluded.received_at
  returning * into v_event;

  v_status:=case
    when lower(trim(p_event_type)) in ('offline','device.offline') then 'offline'
    when lower(trim(p_event_type)) in ('degraded','device.degraded') then 'degraded'
    else 'online'
  end;

  update public.smart_devices set
    status=v_status,last_seen_at=now(),last_event_at=v_event.observed_at,updated_at=now()
  where id=v_device.id;
  update public.smart_device_connectors set
    status=case when status='disabled' then status else 'online' end,last_health_at=now(),last_error=null,updated_at=now()
  where id=v_device.connector_id;

  for v_rule in
    select r.* from public.smart_device_automation_rules r
    where r.business_id=v_device.business_id and r.enabled
      and (r.device_id is null or r.device_id=v_device.id)
      and (r.location_id is null or r.location_id=v_device.location_id)
      and (r.last_fired_at is null or r.last_fired_at + make_interval(secs=>r.cooldown_seconds) <= now())
  loop
    v_matches:=false;
    if v_rule.trigger_type='event_type' then
      v_matches:=coalesce(v_rule.trigger_config->>'event_type','')=p_event_type;
    elsif v_rule.trigger_type='status_changed' then
      v_matches:=coalesce(v_rule.trigger_config->>'status',v_status)=v_status;
    elsif v_rule.trigger_type='metric_threshold'
      and coalesce(v_rule.trigger_config->>'metric','')=coalesce(p_metric,'')
      and p_value_numeric is not null then
      v_matches:=case coalesce(v_rule.trigger_config->>'operator','gte')
        when 'gt' then p_value_numeric>(v_rule.trigger_config->>'value')::double precision
        when 'gte' then p_value_numeric>=(v_rule.trigger_config->>'value')::double precision
        when 'lt' then p_value_numeric<(v_rule.trigger_config->>'value')::double precision
        when 'lte' then p_value_numeric<=(v_rule.trigger_config->>'value')::double precision
        when 'eq' then p_value_numeric=(v_rule.trigger_config->>'value')::double precision
        else false end;
    end if;

    if v_matches
      and public.smart_device_command_risk(v_rule.command)<>'high'
      and v_device.control_enabled and v_connector.control_enabled
      and (('command:*'=any(v_device.capabilities)) or (('command:'||v_rule.command)=any(v_device.capabilities)))
    then
      insert into public.smart_device_commands(
        business_id,device_id,connector_id,command,arguments,risk_class,status,
        idempotency_key,requested_by,metadata
      ) values(
        v_device.business_id,v_device.id,v_device.connector_id,v_rule.command,
        v_rule.command_arguments,public.smart_device_command_risk(v_rule.command),'queued',
        'automation:'||v_rule.id::text||':'||v_event.id::text,null,
        jsonb_build_object('automation_rule_id',v_rule.id,'trigger_event_id',v_event.id)
      ) on conflict(business_id,idempotency_key) do nothing;
      update public.smart_device_automation_rules set last_fired_at=now(),updated_at=now() where id=v_rule.id;
    end if;
  end loop;

  v_partner_event:=case
    when p_severity in ('warning','critical') then 'device.alert'
    when p_metric is not null then 'device.telemetry_threshold'
    else 'device.status_changed'
  end;
  perform public.enqueue_platform_webhook_event(
    p_partner_id,
    v_partner_event,
    jsonb_build_object(
      'businessId',v_device.business_id,'deviceId',v_device.id,'externalDeviceId',v_device.external_device_id,
      'eventId',v_event.id,'eventType',p_event_type,'severity',p_severity,'metric',p_metric,
      'value',coalesce(to_jsonb(p_value_numeric),to_jsonb(p_value_text)),'unit',p_unit,'observedAt',v_event.observed_at
    )
  );

  return to_jsonb(v_event);
end;
$function$;

create or replace function public.claim_smart_device_commands(p_limit integer default 25)
returns table(
  command_id uuid,
  business_id uuid,
  device_id uuid,
  external_device_id text,
  connector_id uuid,
  platform_partner_id uuid,\n  protocol text,\n  command text,
  arguments jsonb,
  risk_class text,
  attempt integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  update public.smart_device_commands
  set status='expired',completed_at=now(),error='Command expired before dispatch'
  where status in ('queued','claimed') and expires_at<=now();

  return query
  with picked as (
    select cmd.id
    from public.smart_device_commands cmd
    join public.smart_devices d on d.id=cmd.device_id
    join public.smart_device_connectors c on c.id=cmd.connector_id
    where cmd.status='queued' and cmd.expires_at>now()
      and d.control_enabled and c.control_enabled and c.status<>'disabled'\n      and (c.platform_partner_id is not null or c.protocol='manual')
    order by cmd.requested_at
    for update of cmd skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  ), claimed as (
    update public.smart_device_commands cmd set
      status='claimed',claimed_at=now(),attempt_count=attempt_count+1
    from picked where cmd.id=picked.id
    returning cmd.*
  )
  select ccmd.id,ccmd.business_id,ccmd.device_id,d.external_device_id,ccmd.connector_id,
    c.platform_partner_id,c.protocol,ccmd.command,ccmd.arguments,ccmd.risk_class,ccmd.attempt_count,ccmd.expires_at
  from claimed ccmd
  join public.smart_devices d on d.id=ccmd.device_id
  join public.smart_device_connectors c on c.id=ccmd.connector_id;
end;
$function$;

create or replace function public.mark_smart_device_command_dispatched(p_command_id uuid)
returns boolean
language sql
security definer
set search_path=''
as $function$
  update public.smart_device_commands
  set status='dispatched',dispatched_at=now()
  where id=p_command_id and status='claimed'
  returning true;
$function$;

create or replace function public.complete_smart_device_command(
  p_command_id uuid,
  p_success boolean,
  p_result jsonb default '{}'::jsonb,
  p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_row public.smart_device_commands; v_partner uuid; v_external text;
begin
  update public.smart_device_commands set
    status=case when p_success then 'completed' else 'failed' end,
    result=coalesce(p_result,'{}'::jsonb),error=case when p_success then null else nullif(trim(coalesce(p_error,'')),'') end,
    completed_at=now()
  where id=p_command_id and status in ('claimed','dispatched','acknowledged')
  returning * into v_row;
  if v_row.id is null then raise exception 'Dispatchable command not found'; end if;

  select c.platform_partner_id,d.external_device_id into v_partner,v_external
  from public.smart_device_connectors c join public.smart_devices d on d.connector_id=c.id
  where c.id=v_row.connector_id and d.id=v_row.device_id;

  if v_partner is not null then
    perform public.enqueue_platform_webhook_event(
      v_partner,'device.command_completed',
      jsonb_build_object('commandId',v_row.id,'deviceId',v_row.device_id,'externalDeviceId',v_external,
        'command',v_row.command,'success',p_success,'result',v_row.result,'error',v_row.error,'completedAt',v_row.completed_at)
    );
  end if;
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.platform_smart_device_manifest(p_partner_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'devices',coalesce(jsonb_agg(jsonb_build_object(
      'id',d.id,'externalDeviceId',d.external_device_id,'businessId',d.business_id,'locationId',d.location_id,
      'name',d.name,'deviceType',d.device_type,'manufacturer',d.manufacturer,'model',d.model,
      'firmwareVersion',d.firmware_version,'capabilities',d.capabilities,'status',d.status,
      'controlEnabled',d.control_enabled,'telemetryEnabled',d.telemetry_enabled,'lastSeenAt',d.last_seen_at
    ) order by d.name),'[]'::jsonb)
  )
  from public.smart_devices d
  join public.smart_device_connectors c on c.id=d.connector_id
  where c.platform_partner_id=p_partner_id;
$function$;

create or replace function public.platform_register_smart_device(
  p_partner_id uuid,
  p_business_id uuid,
  p_connector_id uuid,
  p_external_device_id text,
  p_name text,
  p_device_type text default 'sensor',
  p_location_id uuid default null,
  p_manufacturer text default null,
  p_model text default null,
  p_firmware_version text default null,
  p_capabilities text[] default '{}'::text[],
  p_tags text[] default '{}'::text[],
  p_telemetry_enabled boolean default true,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_id uuid; v_row public.smart_devices;
begin
  if not exists(
    select 1 from public.smart_device_connectors c
    where c.id=p_connector_id and c.business_id=p_business_id and c.platform_partner_id=p_partner_id
  ) then raise exception 'Paired connector not found'; end if;

  insert into public.smart_devices(
    business_id,location_id,connector_id,external_device_id,name,device_type,
    manufacturer,model,firmware_version,capabilities,tags,control_enabled,
    telemetry_enabled,metadata,created_by
  ) values(
    p_business_id,p_location_id,p_connector_id,trim(p_external_device_id),trim(p_name),
    coalesce(nullif(trim(p_device_type),''),'sensor'),p_manufacturer,p_model,p_firmware_version,
    coalesce(p_capabilities,'{}'::text[]),coalesce(p_tags,'{}'::text[]),false,
    p_telemetry_enabled,coalesce(p_metadata,'{}'::jsonb),null
  )
  on conflict(connector_id,external_device_id) do update set
    location_id=excluded.location_id,name=excluded.name,device_type=excluded.device_type,
    manufacturer=excluded.manufacturer,model=excluded.model,firmware_version=excluded.firmware_version,
    capabilities=excluded.capabilities,tags=excluded.tags,telemetry_enabled=excluded.telemetry_enabled,
    metadata=excluded.metadata,updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.platform_smart_device_command(
  p_partner_id uuid,
  p_device_id uuid,
  p_command text,
  p_arguments jsonb default '{}'::jsonb,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_device public.smart_devices; v_connector public.smart_device_connectors; v_row public.smart_device_commands;
  v_command text:=lower(trim(coalesce(p_command,''))); v_key text:=coalesce(nullif(trim(p_idempotency_key),''),gen_random_uuid()::text);
begin
  select d.* into v_device
  from public.smart_devices d join public.smart_device_connectors c on c.id=d.connector_id
  where d.id=p_device_id and c.platform_partner_id=p_partner_id;
  if v_device.id is null then raise exception 'Partner device not found'; end if;
  select * into v_connector from public.smart_device_connectors where id=v_device.connector_id;
  if not v_device.control_enabled or not v_connector.control_enabled then raise exception 'Device control is disabled'; end if;
  if public.smart_device_command_risk(v_command)='high' then raise exception 'High-risk commands require KleenestOS approval'; end if;
  if not (('command:*'=any(v_device.capabilities)) or (('command:'||v_command)=any(v_device.capabilities))) then
    raise exception 'Command is not declared by this device';
  end if;
  select * into v_row from public.smart_device_commands where business_id=v_device.business_id and idempotency_key=v_key;
  if v_row.id is null then
    insert into public.smart_device_commands(
      business_id,device_id,connector_id,command,arguments,risk_class,status,idempotency_key,metadata
    ) values(
      v_device.business_id,v_device.id,v_device.connector_id,v_command,coalesce(p_arguments,'{}'::jsonb),
      public.smart_device_command_risk(v_command),'queued',v_key,jsonb_build_object('requested_by_partner_id',p_partner_id)
    ) returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.platform_complete_smart_device_command(
  p_partner_id uuid,
  p_command_id uuid,
  p_success boolean,
  p_result jsonb default '{}'::jsonb,
  p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not exists(
    select 1 from public.smart_device_commands cmd
    join public.smart_device_connectors c on c.id=cmd.connector_id
    where cmd.id=p_command_id and c.platform_partner_id=p_partner_id
  ) then raise exception 'Partner command not found'; end if;
  return public.complete_smart_device_command(p_command_id,p_success,p_result,p_error);
end;
$function$;

create or replace function public.owner_smart_device_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not public.is_platform_owner_session() then
    raise exception 'Platform owner authority required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'health',jsonb_build_object(
      'connectors',(select count(*) from public.smart_device_connectors),
      'online_connectors',(select count(*) from public.smart_device_connectors where status='online'),
      'devices',(select count(*) from public.smart_devices),
      'online_devices',(select count(*) from public.smart_devices where status='online'),
      'pending_approvals',(select count(*) from public.smart_device_commands where status='pending_approval'),
      'failed_commands_24h',(select count(*) from public.smart_device_commands where status='failed' and completed_at>now()-interval '24 hours'),
      'critical_events_24h',(select count(*) from public.smart_device_events where severity='critical' and observed_at>now()-interval '24 hours')
    ),
    'connectors',coalesce((select jsonb_agg(to_jsonb(c) order by c.updated_at desc)
      from (select * from public.smart_device_connectors order by updated_at desc limit 100) c),'[]'::jsonb),
    'devices',coalesce((select jsonb_agg(to_jsonb(d) order by d.updated_at desc)
      from (select * from public.smart_devices order by updated_at desc limit 200) d),'[]'::jsonb),
    'commands',coalesce((select jsonb_agg(to_jsonb(cmd) order by cmd.requested_at desc)
      from (select * from public.smart_device_commands order by requested_at desc limit 150) cmd),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.observed_at desc)
      from (select * from public.smart_device_events order by observed_at desc limit 150) e),'[]'::jsonb)
  );
end;
$function$;

create or replace function public.cleanup_smart_device_events(p_keep_days integer default 7)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare v_count integer;
begin
  delete from public.smart_device_events
  where expires_at<now() or received_at < now()-make_interval(days=>greatest(1,least(coalesce(p_keep_days,7),90)));
  get diagnostics v_count=row_count;
  return v_count;
end;
$function$;

-- Service-only helper lets the Smart Device gateway kick the already-secured,
-- signed platform webhook worker without duplicating partner signing logic.
create or replace function public.platform_webhook_worker_secret_internal()
returns text
language sql
stable
security definer
set search_path=''
as $function$
  select decrypted_secret from vault.decrypted_secrets
  where name='kleenest_platform_webhook_worker_secret' limit 1;
$function$;

-- Extend the existing Partner Platform authorization with least-privilege IoT scopes.
create or replace function public.authorize_platform_request(
  p_raw_key text,
  p_route text,
  p_request_id uuid,
  p_origin text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_key public.platform_api_keys;
  v_partner public.platform_partners;
  v_bucket timestamptz:=date_trunc('minute',now());
  v_month date:=date_trunc('month',current_date)::date;
  v_minute_count integer:=0;
  v_month_count bigint:=0;
  v_key_minute_count integer:=0;
  v_origin text:=public.normalize_platform_origin(p_origin);
  v_required_scope text:='recommendations:read';
  v_required_product text;
begin
  if nullif(trim(coalesce(p_raw_key,'')),'') is null then
    return jsonb_build_object('authorized',false,'reason','missing_key','request_id',p_request_id);
  end if;

  select * into v_key from public.platform_api_keys k
  where k.secret_hash=encode(extensions.digest(p_raw_key,'sha256'),'hex')
    and k.revoked_at is null and (k.expires_at is null or k.expires_at>now())
  limit 1;
  if v_key.id is null then return jsonb_build_object('authorized',false,'reason','invalid_key','request_id',p_request_id); end if;

  select * into v_partner from public.platform_partners p where p.id=v_key.partner_id;
  if v_partner.id is null or v_partner.status<>'active' then
    return jsonb_build_object('authorized',false,'reason','partner_inactive','request_id',p_request_id);
  end if;

  v_required_product:=case
    when p_route='/v1/recommendations/nearby' then 'nearby'
    when p_route='/v1/recommendations/route' then 'route'
    when p_route='/v1/places/match' then 'place_match'
    when p_route like '/v1/places/%' then 'place_details'
    when p_route='/v1/devices' or p_route like '/v1/devices/%' then 'smart_devices'
    else null
  end;

  v_required_scope:=case
    when p_route like '/v1/recommendations/%' or p_route like '/v1/places/%' then 'recommendations:read'
    when p_route='/v1/devices/events' then 'devices:events:write'
    when p_route like '/v1/devices/%/commands/%/complete' then 'devices:events:write'
    when p_route like '/v1/devices/%/commands' then 'devices:command'
    when p_route='/v1/devices/register' then 'devices:write'
    when p_route='/v1/devices' or p_route like '/v1/devices/%' then 'devices:read'
    else 'platform:read'
  end;

  if not ('*'=any(v_key.scopes) or v_required_scope=any(v_key.scopes)) then
    return jsonb_build_object('authorized',false,'reason','insufficient_scope','request_id',p_request_id,'required_scope',v_required_scope);
  end if;

  if v_required_product is not null and not public.platform_partner_product_enabled(v_partner.id,v_required_product) then
    return jsonb_build_object('authorized',false,'reason','product_not_enabled','request_id',p_request_id,'required_product',v_required_product);
  end if;

  if v_key.credential_type='publishable' then
    if v_origin is null then return jsonb_build_object('authorized',false,'reason','origin_required','request_id',p_request_id); end if;
    if not (v_origin=any(coalesce(v_key.allowed_origins,'{}'::text[]))) then
      return jsonb_build_object('authorized',false,'reason','origin_not_allowed','request_id',p_request_id);
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_partner.id::text,0));
  select coalesce(request_count,0) into v_minute_count
  from public.platform_api_rate_buckets where partner_id=v_partner.id and bucket_start=v_bucket;
  select coalesce(request_count,0) into v_month_count
  from public.platform_api_usage_monthly where partner_id=v_partner.id and month_start=v_month;
  if coalesce(v_minute_count,0)>=v_partner.quota_per_minute then
    return jsonb_build_object('authorized',false,'reason','minute_quota_exceeded','request_id',p_request_id,
      'retry_after_seconds',greatest(1,60-extract(second from now())::integer));
  end if;
  if coalesce(v_month_count,0)>=v_partner.quota_per_month then
    return jsonb_build_object('authorized',false,'reason','monthly_quota_exceeded','request_id',p_request_id);
  end if;

  if v_key.credential_type='publishable' then
    select coalesce(request_count,0) into v_key_minute_count
    from public.platform_api_key_rate_buckets where api_key_id=v_key.id and bucket_start=v_bucket;
    if coalesce(v_key_minute_count,0)>=coalesce(v_key.credential_quota_per_minute,30) then
      return jsonb_build_object('authorized',false,'reason','credential_minute_quota_exceeded','request_id',p_request_id,
        'retry_after_seconds',greatest(1,60-extract(second from now())::integer));
    end if;
  end if;

  insert into public.platform_api_rate_buckets(partner_id,bucket_start,request_count,updated_at)
  values(v_partner.id,v_bucket,1,now())
  on conflict(partner_id,bucket_start) do update
  set request_count=public.platform_api_rate_buckets.request_count+1,updated_at=now()
  returning request_count into v_minute_count;

  insert into public.platform_api_usage_monthly(partner_id,month_start,request_count,updated_at)
  values(v_partner.id,v_month,1,now())
  on conflict(partner_id,month_start) do update
  set request_count=public.platform_api_usage_monthly.request_count+1,updated_at=now()
  returning request_count into v_month_count;

  if v_key.credential_type='publishable' then
    insert into public.platform_api_key_rate_buckets(api_key_id,bucket_start,request_count,updated_at)
    values(v_key.id,v_bucket,1,now())
    on conflict(api_key_id,bucket_start) do update
    set request_count=public.platform_api_key_rate_buckets.request_count+1,updated_at=now()
    returning request_count into v_key_minute_count;
  end if;
  update public.platform_api_keys set last_used_at=now() where id=v_key.id;

  return jsonb_build_object(
    'authorized',true,'request_id',p_request_id,'partner_id',v_partner.id,'partner_slug',v_partner.slug,
    'plan',v_partner.plan,'api_key_id',v_key.id,'credential_type',v_key.credential_type,'scopes',to_jsonb(v_key.scopes),
    'product_access',(select to_jsonb(a.api_products) from public.platform_partner_product_access a where a.partner_id=v_partner.id),
    'minute_limit',v_partner.quota_per_minute,'minute_remaining',greatest(0,v_partner.quota_per_minute-v_minute_count),
    'month_limit',v_partner.quota_per_month,'month_remaining',greatest(0,v_partner.quota_per_month-v_month_count),
    'credential_minute_limit',case when v_key.credential_type='publishable' then v_key.credential_quota_per_minute else null end,
    'credential_minute_remaining',case when v_key.credential_type='publishable'
      then greatest(0,coalesce(v_key.credential_quota_per_minute,30)-v_key_minute_count) else null end
  );
end;
$function$;

insert into public.platform_product_bundles(
  bundle_key,label,description,plan,scopes,api_products,integration_surfaces,
  default_quota_per_minute,default_quota_per_month,active,sort_order,updated_at
) values(
  'smart_facilities','Smart Facilities',
  'IoT and Smart Device telemetry, commands, automations, webhooks and MCP for connected facilities.',
  'enterprise',\n  array['recommendations:read','platform:read','devices:read','devices:write','devices:command','devices:events:write']::text[],\n  array['nearby','route','place_details','place_match','smart_devices']::text[],\n  array['rest','sdk','map','route_sdk','webhooks','mcp']::text[],
  120,500000,true,60,now()
)
on conflict(bundle_key) do update set
  label=excluded.label,description=excluded.description,plan=excluded.plan,scopes=excluded.scopes,
  api_products=excluded.api_products,integration_surfaces=excluded.integration_surfaces,
  default_quota_per_minute=excluded.default_quota_per_minute,
  default_quota_per_month=excluded.default_quota_per_month,active=true,sort_order=excluded.sort_order,updated_at=now();

create or replace function public.configure_smart_device_gateway_job(p_project_url text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_url text:=regexp_replace(trim(coalesce(p_project_url,'')),'/$',''); v_dispatch bigint; v_cleanup bigint;
begin
  if not public.is_platform_owner_session() then
    raise exception 'Platform owner authority required' using errcode='42501';
  end if;
  if v_url !~ '^https://[a-z0-9-]+\.supabase\.co$' then raise exception 'Valid Supabase project URL required'; end if;
  if exists(select 1 from cron.job where jobname='kleenest-smart-device-dispatch') then
    perform cron.unschedule('kleenest-smart-device-dispatch');
  end if;
  if exists(select 1 from cron.job where jobname='kleenest-smart-device-event-cleanup') then
    perform cron.unschedule('kleenest-smart-device-event-cleanup');
  end if;
  v_dispatch:=cron.schedule(
    'kleenest-smart-device-dispatch','* * * * *',
    format($job$
      select net.http_post(
        url := %L || '/functions/v1/smart-device-gateway',
        body := '{"operation":"dispatch","limit":50}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-kleenest-worker-secret',
          (select decrypted_secret from vault.decrypted_secrets where name='kleenest_platform_webhook_worker_secret' limit 1)
        ),
        timeout_milliseconds := 15000
      );
    $job$,v_url)
  );
  v_cleanup:=cron.schedule(
    'kleenest-smart-device-event-cleanup','23 3 * * *',
    'select public.cleanup_smart_device_events(7);'
  );
  return jsonb_build_object('dispatch_job_id',v_dispatch,'cleanup_job_id',v_cleanup,'project_url',v_url);
end;
$function$;

-- Lock privileged functions to the roles that actually need them.
do $block$
declare f regprocedure;
begin
  foreach f in array array[
    'public.smart_device_upsert_connector(uuid,text,text,uuid,uuid,uuid,boolean,boolean,text[],jsonb)'::regprocedure,
    'public.smart_device_upsert_device(uuid,uuid,text,text,uuid,uuid,text,text,text,text,text[],text[],boolean,boolean,jsonb)'::regprocedure,
    'public.smart_device_manifest(uuid)'::regprocedure,
    'public.smart_device_command(uuid,uuid,text,jsonb,text,timestamp with time zone)'::regprocedure,
    'public.smart_device_set_automation_rule(uuid,text,text,jsonb,text,uuid,uuid,uuid,jsonb,integer,boolean)'::regprocedure,
    'public.owner_approve_smart_device_command(uuid,boolean,text)'::regprocedure,
    'public.owner_smart_device_snapshot()'::regprocedure,
    'public.configure_smart_device_gateway_job(text)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public,anon',f);
    execute format('grant execute on function %s to authenticated',f);
  end loop;

  foreach f in array array[
    'public.record_smart_device_event(uuid,text,text,text,text,double precision,text,text,jsonb,timestamp with time zone,text)'::regprocedure,
    'public.claim_smart_device_commands(integer)'::regprocedure,
    'public.mark_smart_device_command_dispatched(uuid)'::regprocedure,
    'public.complete_smart_device_command(uuid,boolean,jsonb,text)'::regprocedure,
    'public.platform_smart_device_manifest(uuid)'::regprocedure,\n    'public.platform_register_smart_device(uuid,uuid,uuid,text,text,text,uuid,text,text,text,text[],text[],boolean,jsonb)'::regprocedure,\n    'public.platform_smart_device_command(uuid,uuid,text,jsonb,text)'::regprocedure,
    'public.platform_complete_smart_device_command(uuid,uuid,boolean,jsonb,text)'::regprocedure,
    'public.cleanup_smart_device_events(integer)'::regprocedure,
    'public.platform_webhook_worker_secret_internal()'::regprocedure
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end;
$block$;

revoke all on function public.authorize_platform_request(text,text,uuid,text) from public,anon,authenticated;\ngrant execute on function public.authorize_platform_request(text,text,uuid,text) to service_role;
