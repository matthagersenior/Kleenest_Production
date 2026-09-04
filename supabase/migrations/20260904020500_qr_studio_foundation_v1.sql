-- Canonical QR Studio foundation.
-- Production DB was migrated through the connected Supabase project first;
-- this file keeps source control authoritative for rebuilds and future environments.

alter table public.qr_redemptions
  add column if not exists check_in_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'qr_redemptions_check_in_id_fkey'
      and conrelid = 'public.qr_redemptions'::regclass
  ) then
    alter table public.qr_redemptions
      add constraint qr_redemptions_check_in_id_fkey
      foreign key (check_in_id) references public.check_ins(id) on delete set null;
  end if;
end $$;

create table if not exists public.qr_code_versions (
  id uuid primary key default gen_random_uuid(),
  qr_code_id uuid not null references public.qr_codes(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  change_summary text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (qr_code_id, version)
);

create index if not exists qr_code_versions_business_qr_idx
  on public.qr_code_versions(business_id, qr_code_id, version desc);

alter table public.qr_code_versions enable row level security;

drop policy if exists qr_code_versions_read on public.qr_code_versions;
create policy qr_code_versions_read on public.qr_code_versions
for select to authenticated
using (
  public.business_can_manage(business_id)
  or public.is_platform_owner_session()
);

revoke insert, update, delete on public.qr_code_versions from anon, authenticated;
grant select on public.qr_code_versions to authenticated;

create table if not exists public.qr_design_templates (
  id uuid primary key default gen_random_uuid(),
  owner_business_id uuid references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  design jsonb not null default '{}'::jsonb,
  default_action jsonb,
  scope text not null default 'business' check (scope in ('system','business','enterprise_network')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qr_design_templates_scope_owner_ck check (
    (scope='system' and owner_business_id is null)
    or (scope in ('business','enterprise_network') and owner_business_id is not null)
  )
);

create index if not exists qr_design_templates_owner_active_idx
  on public.qr_design_templates(owner_business_id, active, updated_at desc);

alter table public.qr_design_templates enable row level security;

drop policy if exists qr_design_templates_read on public.qr_design_templates;
create policy qr_design_templates_read on public.qr_design_templates
for select to authenticated
using (
  (scope='system' and active=true)
  or (owner_business_id is not null and public.business_can_manage(owner_business_id))
  or public.is_platform_owner_session()
);

revoke insert, update, delete on public.qr_design_templates from anon, authenticated;
grant select on public.qr_design_templates to authenticated;

create or replace function public.qr_studio_validate_customization(p_customization jsonb)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  v jsonb := coalesce(p_customization, '{}'::jsonb);
  d jsonb;
  logo jsonb;
  fg text;
  bg text;
  qz integer;
  scale numeric;
begin
  if jsonb_typeof(v) <> 'object' then
    raise exception 'QR customization must be an object';
  end if;
  if not (v ? 'schema_version') then
    v := jsonb_build_object(
      'schema_version', 1,
      'design', jsonb_build_object(
        'foreground', '#173f2d',
        'background', '#ffffff',
        'module_style', 'square',
        'eye_style', 'square',
        'quiet_zone', 4,
        'logo', jsonb_build_object('source','none','url',null,'scale',0.0,'padding',0)
      ),
      'frame', jsonb_build_object(
        'style', 'none',
        'cta', null,
        'supporting_text', null,
        'text_align', 'center',
        'font_scale', 1.0,
        'font_weight', '700'
      ),
      'brand', v
    );
  end if;
  if coalesce((v->>'schema_version')::integer, 0) <> 1 then
    raise exception 'Unsupported QR customization schema version';
  end if;
  d := coalesce(v->'design', '{}'::jsonb);
  if jsonb_typeof(d) <> 'object' then raise exception 'QR design must be an object'; end if;
  fg := coalesce(d->>'foreground', '#173f2d');
  bg := coalesce(d->>'background', '#ffffff');
  if fg !~ '^#[0-9A-Fa-f]{6}$' or bg !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'QR colors must use six-digit hex values';
  end if;
  if coalesce(d->>'module_style','square') not in ('square','rounded','dots') then
    raise exception 'Unsupported QR module style';
  end if;
  if coalesce(d->>'eye_style','square') not in ('square','rounded','circle') then
    raise exception 'Unsupported QR eye style';
  end if;
  qz := coalesce((d->>'quiet_zone')::integer, 4);
  if qz < 4 or qz > 12 then raise exception 'QR quiet zone must be between 4 and 12 modules'; end if;
  logo := coalesce(d->'logo', '{}'::jsonb);
  if jsonb_typeof(logo) <> 'object' then raise exception 'QR logo configuration must be an object'; end if;
  if coalesce(logo->>'source','none') not in ('none','business','kleenest','media') then
    raise exception 'Unsupported QR logo source';
  end if;
  scale := coalesce((logo->>'scale')::numeric, 0);
  if scale < 0 or scale > 0.22 then raise exception 'QR logo scale must be between 0 and 0.22'; end if;
  return v;
end;
$$;

create or replace function public.qr_studio_validate_action(p_action_type text, p_payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  a text := lower(coalesce(nullif(trim(p_action_type),''),'checkin'));
  v jsonb := coalesce(p_payload, '{}'::jsonb);
  u text;
begin
  if jsonb_typeof(v) <> 'object' then raise exception 'QR action payload must be an object'; end if;
  if a not in (
    'checkin','location_details','review','directions','route_add','promotion_redeem',
    'contest_entry','game_entry','loyalty','reward','event_entry','reverify','trust_mission',
    'premium_redeem','fleet_checkpoint','enterprise_campaign','kleenest_deep_link','external_url'
  ) then raise exception 'Unsupported QR action type: %', a; end if;
  if a='external_url' then
    u := nullif(trim(v->>'url'),'');
    if u is null or u !~* '^https?://' then raise exception 'External QR actions require an http(s) URL'; end if;
  end if;
  if a='kleenest_deep_link' then
    u := nullif(trim(v->>'url'),'');
    if u is null or u !~* '^kleenest(-[a-z0-9]+)?://' then raise exception 'Kleenest deep link is invalid'; end if;
  end if;
  return v;
end;
$$;

create or replace function public.qr_studio_upsert_asset(
  p_business_id uuid,
  p_qr_id uuid default null,
  p_location_id uuid default null,
  p_patch jsonb default '{}'::jsonb,
  p_change_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare
  q public.qr_codes;
  old_q public.qr_codes;
  v_patch jsonb := coalesce(p_patch,'{}'::jsonb);
  v_customization jsonb;
  v_action_payload jsonb;
  v_action_type text;
  v_snapshot jsonb;
  v_old_snapshot jsonb;
  v_version integer;
  v_location uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  if jsonb_typeof(v_patch) <> 'object' then raise exception 'QR patch must be an object'; end if;

  if p_qr_id is null then
    v_location := p_location_id;
    if v_location is not null and not exists(
      select 1 from public.locations l
      where l.id=v_location and (l.business_id=p_business_id or l.claimed_business_id=p_business_id)
    ) then raise exception 'Location does not belong to business'; end if;
    v_customization := public.qr_studio_validate_customization(v_patch->'customization');
    v_action_type := lower(coalesce(nullif(trim(v_patch->>'action_type'),''),'checkin'));
    v_action_payload := public.qr_studio_validate_action(v_action_type, v_patch->'action_payload');
    insert into public.qr_codes(
      business_id,location_id,code,active,label,customization,purpose,action_type,action_payload,single_use,max_redemptions
    ) values (
      p_business_id,v_location,encode(gen_random_bytes(18),'hex'),
      coalesce((v_patch->>'active')::boolean,true),
      coalesce(nullif(trim(v_patch->>'label'),''),'Kleenest QR'),
      v_customization,coalesce(nullif(trim(v_patch->>'purpose'),''),v_action_type),
      v_action_type,v_action_payload,coalesce((v_patch->>'single_use')::boolean,false),
      case when v_patch ? 'max_redemptions' then nullif(v_patch->>'max_redemptions','')::integer else null end
    ) returning * into q;
  else
    select * into old_q from public.qr_codes
    where id=p_qr_id and business_id=p_business_id for update;
    if old_q.id is null then raise exception 'QR code not found'; end if;
    v_location := case when p_location_id is not null then p_location_id else old_q.location_id end;
    if v_location is not null and not exists(
      select 1 from public.locations l
      where l.id=v_location and (l.business_id=p_business_id or l.claimed_business_id=p_business_id)
    ) then raise exception 'Location does not belong to business'; end if;
    v_customization := case when v_patch ? 'customization'
      then public.qr_studio_validate_customization(v_patch->'customization') else old_q.customization end;
    v_action_type := case when v_patch ? 'action_type'
      then lower(coalesce(nullif(trim(v_patch->>'action_type'),''),'checkin')) else old_q.action_type end;
    v_action_payload := case when v_patch ? 'action_payload' or v_patch ? 'action_type'
      then public.qr_studio_validate_action(v_action_type,coalesce(v_patch->'action_payload',old_q.action_payload)) else old_q.action_payload end;
    update public.qr_codes set
      location_id=v_location,
      label=case when v_patch ? 'label' then coalesce(nullif(trim(v_patch->>'label'),''),label) else label end,
      active=case when v_patch ? 'active' then (v_patch->>'active')::boolean else active end,
      customization=v_customization,
      purpose=case when v_patch ? 'purpose' then coalesce(nullif(trim(v_patch->>'purpose'),''),purpose) else purpose end,
      action_type=v_action_type,
      action_payload=v_action_payload,
      single_use=case when v_patch ? 'single_use' then (v_patch->>'single_use')::boolean else single_use end,
      max_redemptions=case when v_patch ? 'max_redemptions' then nullif(v_patch->>'max_redemptions','')::integer else max_redemptions end
    where id=p_qr_id returning * into q;
  end if;

  if q.max_redemptions is not null and q.max_redemptions < 1 then raise exception 'Maximum redemptions must be at least 1'; end if;
  v_snapshot := jsonb_build_object(
    'label',q.label,'location_id',q.location_id,'active',q.active,'purpose',q.purpose,
    'action_type',q.action_type,'action_payload',q.action_payload,'customization',q.customization,
    'single_use',q.single_use,'max_redemptions',q.max_redemptions
  );
  if old_q.id is not null then
    v_old_snapshot := jsonb_build_object(
      'label',old_q.label,'location_id',old_q.location_id,'active',old_q.active,'purpose',old_q.purpose,
      'action_type',old_q.action_type,'action_payload',old_q.action_payload,'customization',old_q.customization,
      'single_use',old_q.single_use,'max_redemptions',old_q.max_redemptions
    );
  end if;
  if old_q.id is null or v_snapshot is distinct from v_old_snapshot then
    select coalesce(max(version),0)+1 into v_version from public.qr_code_versions where qr_code_id=q.id;
    insert into public.qr_code_versions(qr_code_id,business_id,version,snapshot,change_summary,created_by)
    values(q.id,p_business_id,v_version,v_snapshot,nullif(trim(p_change_summary),''),auth.uid());
  end if;
  return to_jsonb(q) || jsonb_build_object('version',coalesce(v_version,(select max(version) from public.qr_code_versions where qr_code_id=q.id)));
end;
$$;

create or replace function public.qr_studio_versions(p_business_id uuid,p_qr_id uuid)
returns setof public.qr_code_versions
language sql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
  select v.* from public.qr_code_versions v
  where v.business_id=p_business_id and v.qr_code_id=p_qr_id
    and (public.business_can_manage(p_business_id) or public.is_platform_owner_session())
  order by v.version desc;
$$;

create or replace function public.qr_studio_restore_version(
  p_business_id uuid,p_qr_id uuid,p_version integer,p_change_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare s jsonb; loc uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  select snapshot into s from public.qr_code_versions
  where business_id=p_business_id and qr_code_id=p_qr_id and version=p_version;
  if s is null then raise exception 'QR version not found'; end if;
  loc := nullif(s->>'location_id','')::uuid;
  return public.qr_studio_upsert_asset(
    p_business_id,p_qr_id,loc,s - 'location_id',
    coalesce(nullif(trim(p_change_summary),''),format('Restored version %s',p_version))
  );
end;
$$;

create or replace function public.qr_studio_list_templates(p_business_id uuid)
returns setof public.qr_design_templates
language sql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
  select t.* from public.qr_design_templates t
  where t.active and (
    t.scope='system'
    or (t.owner_business_id=p_business_id and (public.business_can_manage(p_business_id) or public.is_platform_owner_session()))
  )
  order by case when t.scope='system' then 0 else 1 end,t.name;
$$;

create or replace function public.qr_studio_save_template(
  p_business_id uuid,p_template_id uuid default null,p_name text default null,
  p_description text default null,p_design jsonb default '{}'::jsonb,p_default_action jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare t public.qr_design_templates; d jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Template name is required'; end if;
  d := public.qr_studio_validate_customization(p_design);
  if p_template_id is null then
    insert into public.qr_design_templates(owner_business_id,name,description,design,default_action,scope,active,created_by)
    values(p_business_id,trim(p_name),nullif(trim(p_description),''),d,p_default_action,'business',true,auth.uid()) returning * into t;
  else
    update public.qr_design_templates set
      name=trim(p_name),description=nullif(trim(p_description),''),design=d,default_action=p_default_action,updated_at=now()
    where id=p_template_id and owner_business_id=p_business_id and scope='business' returning * into t;
    if t.id is null then raise exception 'Template not found or not editable'; end if;
  end if;
  return to_jsonb(t);
end;
$$;

create or replace function public.qr_studio_archive_template(p_business_id uuid,p_template_id uuid)
returns boolean
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  update public.qr_design_templates set active=false,updated_at=now()
  where id=p_template_id and owner_business_id=p_business_id and scope='business';
  return found;
end;
$$;

create or replace function public.business_manage_qr(
  p_business_id uuid,p_location_id uuid,p_qr_id uuid,p_action text,p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
begin
  if p_action='create' then
    return public.qr_studio_upsert_asset(p_business_id,null,p_location_id,coalesce(p_payload,'{}'::jsonb),'Created from Business QR Studio');
  elsif p_action='update' then
    return public.qr_studio_upsert_asset(p_business_id,p_qr_id,p_location_id,coalesce(p_payload,'{}'::jsonb),'Updated from Business QR Studio');
  elsif p_action='deactivate' then
    return public.qr_studio_upsert_asset(p_business_id,p_qr_id,p_location_id,jsonb_build_object('active',false),'Deactivated from Business QR Studio');
  else
    raise exception 'Unsupported QR action';
  end if;
end;
$$;

create or replace function public.business_set_qr_active(p_business_id uuid,p_qr_id uuid,p_active boolean)
returns jsonb
language sql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
  select public.qr_studio_upsert_asset(p_business_id,p_qr_id,null,jsonb_build_object('active',p_active),case when p_active then 'Activated QR' else 'Deactivated QR' end);
$$;

create or replace function public.set_business_qr_customization(p_business_id uuid,p_qr_id uuid,p_customization jsonb)
returns boolean
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
begin
  perform public.qr_studio_upsert_asset(p_business_id,p_qr_id,null,jsonb_build_object('customization',coalesce(p_customization,'{}'::jsonb)),'Updated QR design');
  return true;
end;
$$;

grant execute on function public.qr_studio_upsert_asset(uuid,uuid,uuid,jsonb,text) to authenticated;
grant execute on function public.qr_studio_versions(uuid,uuid) to authenticated;
grant execute on function public.qr_studio_restore_version(uuid,uuid,integer,text) to authenticated;
grant execute on function public.qr_studio_list_templates(uuid) to authenticated;
grant execute on function public.qr_studio_save_template(uuid,uuid,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.qr_studio_archive_template(uuid,uuid) to authenticated;
