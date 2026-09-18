-- Named pilot/session control for KleenestOS.
-- Pilot sessions reference the canonical offer registry and snapshot the offer/sample state at launch.

create table if not exists public.capability_pilot_sessions(
  id uuid primary key default gen_random_uuid(),
  offer_key text not null references public.capability_offer_promises(offer_key) on update cascade on delete restrict,
  name text not null,
  organization_name text,
  contact_name text,
  contact_email text,
  status text not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  notes text,
  sample_profile_snapshot jsonb not null default '{}'::jsonb,
  capability_overrides jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capability_pilot_sessions_status_check check(status in ('draft','active','paused','completed','cancelled')),
  constraint capability_pilot_sessions_time_check check(ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists capability_pilot_sessions_offer_status_idx
  on public.capability_pilot_sessions(offer_key,status,updated_at desc);
create index if not exists capability_pilot_sessions_active_idx
  on public.capability_pilot_sessions(status,starts_at,ends_at)
  where status in ('active','paused');

alter table public.capability_pilot_sessions enable row level security;
revoke all on table public.capability_pilot_sessions from public,anon,authenticated;
grant select,insert,update,delete on table public.capability_pilot_sessions to service_role;
drop policy if exists capability_pilot_sessions_client_deny on public.capability_pilot_sessions;
create policy capability_pilot_sessions_client_deny on public.capability_pilot_sessions
  for all to anon,authenticated using(false) with check(false);

create table if not exists public.capability_pilot_session_log(
  id uuid primary key default gen_random_uuid(),
  pilot_session_id uuid not null references public.capability_pilot_sessions(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid,
  reason text,
  previous_state jsonb,
  next_state jsonb,
  created_at timestamptz not null default now(),
  constraint capability_pilot_session_log_event_check check(event_type in ('created','updated','status_changed','cancelled'))
);

create index if not exists capability_pilot_session_log_session_idx
  on public.capability_pilot_session_log(pilot_session_id,created_at desc);

alter table public.capability_pilot_session_log enable row level security;
revoke all on table public.capability_pilot_session_log from public,anon,authenticated;
grant select,insert on table public.capability_pilot_session_log to service_role;
drop policy if exists capability_pilot_session_log_client_deny on public.capability_pilot_session_log;
create policy capability_pilot_session_log_client_deny on public.capability_pilot_session_log
  for all to anon,authenticated using(false) with check(false);

create or replace function public.owner_pilot_sessions(p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  if p_status is not null and p_status not in ('draft','active','paused','completed','cancelled') then
    raise exception 'invalid pilot status';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,
    'offer_key',s.offer_key,
    'offer_label',o.label,
    'audience',o.audience,
    'name',s.name,
    'organization_name',s.organization_name,
    'contact_name',s.contact_name,
    'contact_email',s.contact_email,
    'status',s.status,
    'starts_at',s.starts_at,
    'ends_at',s.ends_at,
    'notes',s.notes,
    'sample_profile_snapshot',s.sample_profile_snapshot,
    'capability_overrides',s.capability_overrides,
    'created_at',s.created_at,
    'updated_at',s.updated_at
  ) order by
    case s.status when 'active' then 0 when 'paused' then 1 when 'draft' then 2 when 'completed' then 3 else 4 end,
    s.updated_at desc
  ),'[]'::jsonb) into v_result
  from public.capability_pilot_sessions s
  join public.capability_offer_promises o on o.offer_key=s.offer_key
  where p_status is null or s.status=p_status;

  return v_result;
end;
$function$;

revoke all on function public.owner_pilot_sessions(text) from public,anon;
grant execute on function public.owner_pilot_sessions(text) to authenticated,service_role;

create or replace function public.owner_create_pilot_session(
  p_offer_key text,
  p_name text,
  p_organization_name text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_starts_at timestamptz default now(),
  p_ends_at timestamptz default null,
  p_notes text default null,
  p_capability_overrides jsonb default '{}'::jsonb,
  p_reason text default 'KleenestOS pilot created'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_offer public.capability_offer_promises%rowtype;
  v_readiness jsonb;
  v_item jsonb;
  v_session public.capability_pilot_sessions%rowtype;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  if coalesce(nullif(trim(p_name),''),'')='' then raise exception 'pilot name is required'; end if;
  select * into v_offer from public.capability_offer_promises where offer_key=p_offer_key and active=true;
  if not found then raise exception 'unknown or inactive offer'; end if;

  v_readiness:=public.owner_offer_capability_readiness();
  select value into v_item from jsonb_array_elements(v_readiness) value where value->>'offer_key'=p_offer_key limit 1;
  if v_item is null then raise exception 'offer readiness unavailable'; end if;
  if coalesce((v_item->>'pilot_ready')::boolean,false)=false then
    raise exception 'offer is not pilot ready' using detail=coalesce(v_item::text,'{}');
  end if;
  if not v_offer.pilot_enabled then raise exception 'pilot is disabled for this offer'; end if;

  insert into public.capability_pilot_sessions(
    offer_key,name,organization_name,contact_name,contact_email,status,starts_at,ends_at,notes,
    sample_profile_snapshot,capability_overrides,created_by,updated_by
  ) values(
    p_offer_key,trim(p_name),nullif(trim(p_organization_name),''),nullif(trim(p_contact_name),''),nullif(trim(p_contact_email),''),
    'draft',p_starts_at,p_ends_at,nullif(trim(p_notes),''),v_offer.sample_profile,coalesce(p_capability_overrides,'{}'::jsonb),auth.uid(),auth.uid()
  ) returning * into v_session;

  insert into public.capability_pilot_session_log(pilot_session_id,event_type,actor_user_id,reason,next_state)
  values(v_session.id,'created',auth.uid(),nullif(trim(p_reason),''),to_jsonb(v_session));
  return to_jsonb(v_session);
end;
$function$;

revoke all on function public.owner_create_pilot_session(text,text,text,text,text,timestamptz,timestamptz,text,jsonb,text) from public,anon;
grant execute on function public.owner_create_pilot_session(text,text,text,text,text,timestamptz,timestamptz,text,jsonb,text) to authenticated,service_role;

create or replace function public.owner_update_pilot_session(
  p_session_id uuid,
  p_patch jsonb,
  p_reason text default 'KleenestOS pilot update'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_before public.capability_pilot_sessions%rowtype;
  v_after public.capability_pilot_sessions%rowtype;
  v_patch jsonb:=coalesce(p_patch,'{}'::jsonb);
  v_event text:='updated';
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  if exists(select 1 from jsonb_object_keys(v_patch) k where k not in (
    'name','organization_name','contact_name','contact_email','status','starts_at','ends_at','notes','capability_overrides'
  )) then raise exception 'unsupported pilot field'; end if;
  if v_patch?'status' and coalesce(v_patch->>'status','') not in ('draft','active','paused','completed','cancelled') then
    raise exception 'invalid pilot status';
  end if;

  select * into v_before from public.capability_pilot_sessions where id=p_session_id for update;
  if not found then raise exception 'pilot session not found'; end if;

  if v_patch?'status' and v_patch->>'status'='active' then
    if not exists(
      select 1 from jsonb_array_elements(public.owner_offer_capability_readiness()) x
      where x->>'offer_key'=v_before.offer_key and coalesce((x->>'pilot_ready')::boolean,false)
    ) then raise exception 'offer is no longer pilot ready'; end if;
  end if;

  update public.capability_pilot_sessions s set
    name=case when v_patch?'name' then coalesce(nullif(trim(v_patch->>'name'),''),s.name) else s.name end,
    organization_name=case when v_patch?'organization_name' then nullif(trim(v_patch->>'organization_name'),'') else s.organization_name end,
    contact_name=case when v_patch?'contact_name' then nullif(trim(v_patch->>'contact_name'),'') else s.contact_name end,
    contact_email=case when v_patch?'contact_email' then nullif(trim(v_patch->>'contact_email'),'') else s.contact_email end,
    status=case when v_patch?'status' then v_patch->>'status' else s.status end,
    starts_at=case when v_patch?'starts_at' then nullif(v_patch->>'starts_at','')::timestamptz else s.starts_at end,
    ends_at=case when v_patch?'ends_at' then nullif(v_patch->>'ends_at','')::timestamptz else s.ends_at end,
    notes=case when v_patch?'notes' then nullif(trim(v_patch->>'notes'),'') else s.notes end,
    capability_overrides=case when v_patch?'capability_overrides' then coalesce(v_patch->'capability_overrides','{}'::jsonb) else s.capability_overrides end,
    updated_by=auth.uid(),updated_at=now()
  where s.id=p_session_id
  returning * into v_after;

  if v_before.status is distinct from v_after.status then
    v_event:=case when v_after.status='cancelled' then 'cancelled' else 'status_changed' end;
  end if;

  insert into public.capability_pilot_session_log(pilot_session_id,event_type,actor_user_id,reason,previous_state,next_state)
  values(v_after.id,v_event,auth.uid(),nullif(trim(p_reason),''),to_jsonb(v_before),to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$function$;

revoke all on function public.owner_update_pilot_session(uuid,jsonb,text) from public,anon;
grant execute on function public.owner_update_pilot_session(uuid,jsonb,text) to authenticated,service_role;
