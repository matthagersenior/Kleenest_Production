
create or replace function public.location_belongs_to_business(p_business_id uuid,p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.locations l
    where l.id=p_location_id
      and (
        coalesce(l.claimed_business_id,l.business_id)=p_business_id
        or exists(
          select 1
          from public.location_claims c
          where c.location_id=l.id
            and c.business_id=p_business_id
            and c.status='approved'
        )
      )
  );
$$;

revoke all on function public.location_belongs_to_business(uuid,uuid) from public,anon,authenticated;
grant execute on function public.location_belongs_to_business(uuid,uuid) to service_role;

create or replace function public.business_manages_location(p_business_id uuid,p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select public.business_can_manage(p_business_id)
     and public.location_belongs_to_business(p_business_id,p_location_id);
$$;

revoke all on function public.business_manages_location(uuid,uuid) from public,anon,authenticated;
grant execute on function public.business_manages_location(uuid,uuid) to service_role;

create or replace function public.business_set_location_active(
  p_business_id uuid,p_location_id uuid,p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management permission required';
  end if;
  if not public.location_belongs_to_business(p_business_id,p_location_id) then
    raise exception 'Location does not belong to business';
  end if;

  update public.locations
     set is_active=p_active,updated_at=now()
   where id=p_location_id;
  return found;
end;
$$;

revoke all on function public.business_set_location_active(uuid,uuid,boolean) from public,anon;
grant execute on function public.business_set_location_active(uuid,uuid,boolean) to authenticated,service_role;

create or replace function public.business_set_location_active(
  p_location_id uuid,p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_business uuid;
begin
  select coalesce(l.claimed_business_id,l.business_id)
    into v_business
  from public.locations l
  where l.id=p_location_id;

  if v_business is null then raise exception 'Location not found'; end if;
  if not public.business_admin_guard(v_business) then
    raise exception 'Admin access required';
  end if;

  return public.business_set_location_active(v_business,p_location_id,p_active);
end;
$$;

revoke all on function public.business_set_location_active(uuid,boolean) from public,anon;
grant execute on function public.business_set_location_active(uuid,boolean) to authenticated,service_role;

create or replace function public.business_update_location(
  p_business_id uuid,p_location_id uuid,p_name text,p_address text,p_city text,p_state text,p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v public.locations;
begin
  if not public.business_admin_allowed(p_business_id) then
    raise exception 'Admin access required';
  end if;
  if not public.location_belongs_to_business(p_business_id,p_location_id) then
    raise exception 'Location does not belong to business';
  end if;

  update public.locations
     set name=coalesce(nullif(trim(p_name),''),name),
         address=coalesce(nullif(trim(p_address),''),address),
         city=coalesce(nullif(trim(p_city),''),city),
         state=coalesce(nullif(trim(p_state),''),state),
         is_active=coalesce(p_is_active,is_active),
         updated_at=now()
   where id=p_location_id
   returning * into v;

  return to_jsonb(v);
end;
$$;

revoke all on function public.business_update_location(uuid,uuid,text,text,text,text,boolean) from public,anon;
grant execute on function public.business_update_location(uuid,uuid,text,text,text,text,boolean) to authenticated,service_role;

create or replace function public.business_update_location(
  p_location_id uuid,p_name text default null,p_address text default null,p_phone text default null,
  p_website text default null,p_active boolean default null
)
returns public.locations
language plpgsql
security definer
set search_path=''
as $$
declare v public.locations; v_business uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select coalesce(l.claimed_business_id,l.business_id)
    into v_business
  from public.locations l
  where l.id=p_location_id;

  if v_business is null then raise exception 'Location not found'; end if;
  if not public.business_can_manage(v_business) then
    raise exception 'Not authorized for this business';
  end if;
  if not public.location_belongs_to_business(v_business,p_location_id) then
    raise exception 'Location does not belong to business';
  end if;

  update public.locations
     set name=coalesce(nullif(trim(p_name),''),name),
         address=coalesce(nullif(trim(p_address),''),address),
         phone=coalesce(nullif(trim(p_phone),''),phone),
         website=coalesce(nullif(trim(p_website),''),website),
         is_active=coalesce(p_active,is_active),
         updated_at=now()
   where id=p_location_id
   returning * into v;

  return v;
end;
$$;

revoke all on function public.business_update_location(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function public.business_update_location(uuid,text,text,text,text,boolean) to authenticated,service_role;

create or replace function public.business_create_promotion_canonical(
  p_business_id uuid,p_title text,p_description text default null,p_discount numeric default null,
  p_location_id uuid default null,p_starts_at timestamptz default now(),p_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Not authorized for this business';
  end if;
  if not public.business_advanced_allowed(p_business_id) then
    raise exception 'Business Growth, Fleet, or Enterprise plan required';
  end if;
  if p_location_id is not null
     and not public.location_belongs_to_business(p_business_id,p_location_id) then
    raise exception 'Location does not belong to business';
  end if;
  if p_title is null or trim(p_title)='' then raise exception 'Promotion title is required'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at<=p_starts_at then
    raise exception 'Promotion end must be after start';
  end if;

  insert into public.promotions(
    business_id,title,description,discount,location_id,starts_at,ends_at,active,created_at
  )
  values(
    p_business_id,trim(p_title),nullif(trim(p_description),''),
    case when p_discount is null then null else p_discount::text end,
    p_location_id,p_starts_at,p_ends_at,true,now()
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.business_create_promotion_canonical(uuid,text,text,numeric,uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.business_create_promotion_canonical(uuid,text,text,numeric,uuid,timestamptz,timestamptz) to authenticated,service_role;

create or replace function public.create_business_promotion(
  p_business_id uuid,p_title text,p_description text default null,p_discount numeric default null,
  p_starts_at timestamptz default now(),p_ends_at timestamptz default null,p_location_id uuid default null
)
returns uuid
language sql
security definer
set search_path=''
as $$
  select public.business_create_promotion_canonical(
    p_business_id,p_title,p_description,p_discount,p_location_id,p_starts_at,p_ends_at
  );
$$;

revoke all on function public.create_business_promotion(uuid,text,text,numeric,timestamptz,timestamptz,uuid) from public,anon;
grant execute on function public.create_business_promotion(uuid,text,text,numeric,timestamptz,timestamptz,uuid) to authenticated,service_role;

create or replace function public.business_create_promotion(
  p_business_id uuid,p_location_id uuid,p_title text,p_description text,p_discount text,
  p_starts_at timestamptz,p_ends_at timestamptz
)
returns public.promotions
language plpgsql
security definer
set search_path=''
as $$
declare v public.promotions; v_id uuid;
begin
  if p_discount is not null and p_discount !~ '^\s*[0-9]+(?:\.[0-9]+)?\s*$' then
    raise exception 'Discount must be numeric';
  end if;
  v_id:=public.business_create_promotion_canonical(
    p_business_id,p_title,p_description,
    nullif(trim(p_discount),'')::numeric,p_location_id,p_starts_at,p_ends_at
  );
  select * into v from public.promotions where id=v_id;
  return v;
end;
$$;

revoke all on function public.business_create_promotion(uuid,uuid,text,text,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.business_create_promotion(uuid,uuid,text,text,text,timestamptz,timestamptz) to authenticated,service_role;

create or replace function public.business_create_event(
  p_business_id uuid,p_location_id uuid,p_title text,p_description text,p_event_date date,p_event_time time
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth, Fleet, or Enterprise plan required'; end if;
  if p_location_id is not null and not public.location_belongs_to_business(p_business_id,p_location_id) then
    raise exception 'Location does not belong to business';
  end if;
  if nullif(trim(coalesce(p_title,'')),'') is null then raise exception 'Event title is required'; end if;

  insert into public.business_events(business_id,location_id,title,description,event_date,event_time)
  values(p_business_id,p_location_id,trim(p_title),nullif(trim(p_description),''),p_event_date,p_event_time)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.business_create_event(uuid,uuid,text,text,date,time) from public,anon;
grant execute on function public.business_create_event(uuid,uuid,text,text,date,time) to authenticated,service_role;

create or replace function public.business_manage_event(
  p_business_id uuid,p_event_id uuid,p_action text,p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare r public.business_events; loc uuid; act text:=lower(trim(coalesce(p_action,'')));
begin
  if not public.business_admin_guard(p_business_id) then raise exception 'Admin access required'; end if;
  if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth, Fleet, or Enterprise plan required'; end if;
  loc=nullif(p_payload->>'location_id','')::uuid;
  if loc is not null and not public.location_belongs_to_business(p_business_id,loc) then
    raise exception 'Location does not belong to business';
  end if;

  if act='create' then
    insert into public.business_events(business_id,location_id,title,description,event_date,event_time)
    values(
      p_business_id,loc,coalesce(nullif(trim(p_payload->>'title'),''),'New Event'),
      p_payload->>'description',nullif(p_payload->>'event_date','')::date,
      nullif(p_payload->>'event_time','')::time
    ) returning * into r;
  elsif act='update' then
    update public.business_events
       set title=coalesce(nullif(trim(p_payload->>'title'),''),title),
           description=coalesce(p_payload->>'description',description),
           event_date=coalesce(nullif(p_payload->>'event_date','')::date,event_date),
           event_time=coalesce(nullif(p_payload->>'event_time','')::time,event_time),
           location_id=case when p_payload ? 'location_id' then loc else location_id end
     where id=p_event_id and business_id=p_business_id
     returning * into r;
  elsif act='delete' then
    delete from public.business_events
    where id=p_event_id and business_id=p_business_id
    returning * into r;
  else
    raise exception 'Unsupported event action';
  end if;

  if r.id is null then raise exception 'Event not found'; end if;
  return to_jsonb(r);
end;
$$;

revoke all on function public.business_manage_event(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.business_manage_event(uuid,uuid,text,jsonb) to authenticated,service_role;

create or replace function public.business_manage_promotion(
  p_business_id uuid,p_promotion_id uuid,p_action text,p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare r public.promotions; loc uuid; act text:=lower(trim(coalesce(p_action,'')));
begin
  if not public.business_admin_guard(p_business_id) then raise exception 'Admin access required'; end if;
  if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth, Fleet, or Enterprise plan required'; end if;
  loc=nullif(p_payload->>'location_id','')::uuid;
  if loc is not null and not public.location_belongs_to_business(p_business_id,loc) then
    raise exception 'Location does not belong to business';
  end if;

  if act='create' then
    insert into public.promotions(business_id,location_id,title,description,discount,starts_at,ends_at,active)
    values(
      p_business_id,loc,coalesce(nullif(trim(p_payload->>'title'),''),'New Promotion'),
      p_payload->>'description',p_payload->>'discount',
      nullif(p_payload->>'starts_at','')::timestamptz,
      nullif(p_payload->>'ends_at','')::timestamptz,
      coalesce((p_payload->>'active')::boolean,true)
    ) returning * into r;
  elsif act='update' then
    update public.promotions
       set title=coalesce(nullif(trim(p_payload->>'title'),''),title),
           description=coalesce(p_payload->>'description',description),
           discount=coalesce(p_payload->>'discount',discount),
           starts_at=coalesce(nullif(p_payload->>'starts_at','')::timestamptz,starts_at),
           ends_at=coalesce(nullif(p_payload->>'ends_at','')::timestamptz,ends_at),
           active=coalesce((p_payload->>'active')::boolean,active),
           location_id=case when p_payload ? 'location_id' then loc else location_id end
     where id=p_promotion_id and business_id=p_business_id
     returning * into r;
  elsif act='deactivate' then
    update public.promotions set active=false
    where id=p_promotion_id and business_id=p_business_id
    returning * into r;
  else
    raise exception 'Unsupported promotion action';
  end if;

  if r.id is null then raise exception 'Promotion not found'; end if;
  return to_jsonb(r);
end;
$$;

revoke all on function public.business_manage_promotion(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.business_manage_promotion(uuid,uuid,text,jsonb) to authenticated,service_role;

create or replace function public.business_create_custom_qr(
  p_business_id uuid,p_location_id uuid,p_label text,p_purpose text default 'checkin',
  p_action_type text default 'checkin',p_action_payload jsonb default '{}'::jsonb,
  p_customization jsonb default '{}'::jsonb,p_single_use boolean default false,p_max_redemptions integer default null
)
returns public.qr_codes
language plpgsql
security definer
set search_path=''
as $$
declare v public.qr_codes; v_tier text; v_branding jsonb; v_action jsonb;
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  select business_tier::text into v_tier from public.businesses where id=p_business_id;
  if v_tier is null then raise exception 'Business not found'; end if;
  if p_location_id is not null and not public.location_belongs_to_business(p_business_id,p_location_id) then
    raise exception 'Location does not belong to business';
  end if;
  if p_max_redemptions is not null and p_max_redemptions<1 then
    raise exception 'Maximum redemptions must be at least 1';
  end if;

  v_action:=public.qr_studio_validate_action(
    coalesce(nullif(trim(p_action_type),''),'checkin'),
    coalesce(p_action_payload,'{}'::jsonb)
  );

  if v_tier='standard' then
    v_branding:=jsonb_build_object(
      'brand_mode','kleenest','logo_url',null,'logo_storage_path',null,
      'foreground','#10182d','background','#ffffff',
      'frame_label','Scan with Kleenest',
      'cta_label','Get the Kleenest app to rate & review',
      'app_download_url',coalesce(
        nullif(p_customization->>'app_download_url',''),
        concat(coalesce(current_setting('request.headers',true)::jsonb->>'origin',''),'/')
      ),
      'review_prompt',true,'custom_logo_locked',true
    );
  else
    v_branding:=public.qr_studio_validate_customization(coalesce(p_customization,'{}'::jsonb))
      || jsonb_build_object(
        'brand_mode',coalesce(p_customization->>'brand_mode','custom'),
        'custom_logo_locked',false
      );
  end if;

  insert into public.qr_codes(
    business_id,location_id,code,label,active,customization,purpose,action_type,action_payload,
    single_use,max_redemptions
  )
  values(
    p_business_id,p_location_id,encode(gen_random_bytes(12),'hex'),
    coalesce(nullif(trim(p_label),''),'Kleenest QR'),true,v_branding,
    coalesce(nullif(trim(p_purpose),''),'custom'),
    coalesce(nullif(trim(p_action_type),''),'checkin'),
    v_action,coalesce(p_single_use,false),
    case when coalesce(p_single_use,false) then p_max_redemptions else null end
  )
  returning * into v;
  return v;
end;
$$;

revoke all on function public.business_create_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,integer) from public,anon;
grant execute on function public.business_create_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,integer) to authenticated,service_role;

create or replace function public.business_create_qr(
  p_business_id uuid,p_location_id uuid,p_label text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v public.qr_codes;
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth, Fleet, or Enterprise plan required'; end if;
  if not public.location_belongs_to_business(p_business_id,p_location_id) then
    raise exception 'Location does not belong to business';
  end if;

  v:=public.business_create_custom_qr(
    p_business_id,p_location_id,p_label,'checkin','checkin',
    jsonb_build_object('location_id',p_location_id),'{}'::jsonb,false,null
  );
  return v.id;
end;
$$;

revoke all on function public.business_create_qr(uuid,uuid,text) from public,anon;
grant execute on function public.business_create_qr(uuid,uuid,text) to authenticated,service_role;

create or replace function public.create_business_qr(
  p_business_id uuid,p_location_id uuid,p_label text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  perform public.require_business_admin(p_business_id);
  return public.business_create_qr(p_business_id,p_location_id,p_label);
end;
$$;

revoke all on function public.create_business_qr(uuid,uuid,text) from public,anon;
grant execute on function public.create_business_qr(uuid,uuid,text) to authenticated,service_role;

create or replace function public.set_business_qr_status(
  p_business_id uuid,p_qr_id uuid,p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  perform public.require_business_admin(p_business_id);

  update public.qr_codes q
     set active=p_active
   where q.id=p_qr_id
     and q.business_id=p_business_id
     and (
       q.location_id is null
       or public.location_belongs_to_business(p_business_id,q.location_id)
     );
  return found;
end;
$$;

revoke all on function public.set_business_qr_status(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_business_qr_status(uuid,uuid,boolean) to authenticated,service_role;

create or replace function public.fleet_set_monitored_location(
  p_business_id uuid,p_location_id uuid,p_enabled boolean default true
)
returns public.fleet_monitored_locations
language plpgsql
security definer
set search_path=''
as $$
declare r public.fleet_monitored_locations; active_count integer; enterprise_ok boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_actor_is_manager(p_business_id) and not public.is_platform_owner(auth.uid()) then
    raise exception 'Fleet manager access required';
  end if;
  if not public.business_fleet_authorized(p_business_id) and not public.is_platform_owner(auth.uid()) then
    raise exception 'Fleet access is not enabled for this business';
  end if;
  if not public.location_belongs_to_business(p_business_id,p_location_id) then
    raise exception 'Location does not belong to business';
  end if;

  enterprise_ok:=public.business_enterprise_authorized(p_business_id) or public.is_platform_owner(auth.uid());
  if coalesce(p_enabled,true) and not enterprise_ok then
    select count(*)::int into active_count
    from public.fleet_monitored_locations
    where business_id=p_business_id and enabled and location_id<>p_location_id;
    if active_count>=1 then
      raise exception 'Enterprise is required to monitor more than one Fleet location';
    end if;
  end if;

  insert into public.fleet_monitored_locations(business_id,location_id,enabled,created_by)
  values(p_business_id,p_location_id,coalesce(p_enabled,true),auth.uid())
  on conflict(business_id,location_id) do update
    set enabled=excluded.enabled,updated_at=now()
  returning * into r;
  return r;
end;
$$;

revoke all on function public.fleet_set_monitored_location(uuid,uuid,boolean) from public,anon;
grant execute on function public.fleet_set_monitored_location(uuid,uuid,boolean) to authenticated,service_role;

create or replace function public.smart_device_upsert_connector(
  p_business_id uuid,p_name text,p_protocol text,p_connector_id uuid default null,p_location_id uuid default null,
  p_platform_partner_id uuid default null,p_control_enabled boolean default false,p_telemetry_enabled boolean default true,
  p_capabilities text[] default '{}'::text[],p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  if not public.smart_device_business_authorized(p_business_id,true) then
    raise exception 'Smart-device write authority required' using errcode='42501';
  end if;
  if p_location_id is not null and not public.location_belongs_to_business(p_business_id,p_location_id) then
    raise exception 'Smart-device location does not belong to business';
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
    )
    values(
      p_business_id,p_location_id,p_platform_partner_id,trim(p_name),p_protocol,
      p_control_enabled,p_telemetry_enabled,coalesce(p_capabilities,'{}'::text[]),
      coalesce(p_metadata,'{}'::jsonb),auth.uid()
    ) returning id into v_id;
  else
    update public.smart_device_connectors
       set location_id=p_location_id,platform_partner_id=p_platform_partner_id,
           name=trim(p_name),protocol=p_protocol,control_enabled=p_control_enabled,
           telemetry_enabled=p_telemetry_enabled,capabilities=coalesce(p_capabilities,'{}'::text[]),
           metadata=coalesce(p_metadata,'{}'::jsonb),updated_at=now()
     where id=p_connector_id and business_id=p_business_id
     returning id into v_id;
    if v_id is null then raise exception 'Connector not found'; end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.smart_device_upsert_connector(uuid,text,text,uuid,uuid,uuid,boolean,boolean,text[],jsonb) from public,anon;
grant execute on function public.smart_device_upsert_connector(uuid,text,text,uuid,uuid,uuid,boolean,boolean,text[],jsonb) to authenticated,service_role;

create or replace function public.smart_device_upsert_device(
  p_business_id uuid,p_connector_id uuid,p_external_device_id text,p_name text,p_device_id uuid default null,
  p_location_id uuid default null,p_device_type text default 'sensor',p_manufacturer text default null,
  p_model text default null,p_firmware_version text default null,p_capabilities text[] default '{}'::text[],
  p_tags text[] default '{}'::text[],p_control_enabled boolean default false,p_telemetry_enabled boolean default true,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  if not public.smart_device_business_authorized(p_business_id,true) then
    raise exception 'Smart-device write authority required' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.smart_device_connectors c
    where c.id=p_connector_id and c.business_id=p_business_id
  ) then raise exception 'Connector does not belong to Business'; end if;
  if p_location_id is not null and not public.location_belongs_to_business(p_business_id,p_location_id) then
    raise exception 'Smart-device location does not belong to business';
  end if;

  if p_device_id is null then
    insert into public.smart_devices(
      business_id,location_id,connector_id,external_device_id,name,device_type,
      manufacturer,model,firmware_version,capabilities,tags,control_enabled,
      telemetry_enabled,metadata,created_by
    )
    values(
      p_business_id,p_location_id,p_connector_id,trim(p_external_device_id),trim(p_name),
      coalesce(nullif(trim(p_device_type),''),'sensor'),p_manufacturer,p_model,p_firmware_version,
      coalesce(p_capabilities,'{}'::text[]),coalesce(p_tags,'{}'::text[]),
      p_control_enabled,p_telemetry_enabled,coalesce(p_metadata,'{}'::jsonb),auth.uid()
    )
    on conflict(connector_id,external_device_id) do update
      set name=excluded.name,location_id=excluded.location_id,device_type=excluded.device_type,
          manufacturer=excluded.manufacturer,model=excluded.model,firmware_version=excluded.firmware_version,
          capabilities=excluded.capabilities,tags=excluded.tags,control_enabled=excluded.control_enabled,
          telemetry_enabled=excluded.telemetry_enabled,metadata=excluded.metadata,updated_at=now()
    returning id into v_id;
  else
    update public.smart_devices
       set location_id=p_location_id,connector_id=p_connector_id,external_device_id=trim(p_external_device_id),
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
$$;

revoke all on function public.smart_device_upsert_device(uuid,uuid,text,text,uuid,uuid,text,text,text,text,text[],text[],boolean,boolean,jsonb) from public,anon;
grant execute on function public.smart_device_upsert_device(uuid,uuid,text,text,uuid,uuid,text,text,text,text,text[],text[],boolean,boolean,jsonb) to authenticated,service_role;

create or replace function public.smart_device_set_automation_rule(
  p_business_id uuid,p_name text,p_trigger_type text,p_trigger_config jsonb,p_command text,
  p_rule_id uuid default null,p_location_id uuid default null,p_device_id uuid default null,
  p_command_arguments jsonb default '{}'::jsonb,p_cooldown_seconds integer default 300,p_enabled boolean default true
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid; v_command text:=lower(trim(coalesce(p_command,'')));
begin
  if not public.smart_device_business_authorized(p_business_id,true) then
    raise exception 'Smart-device automation authority required' using errcode='42501';
  end if;
  if p_location_id is not null and not public.location_belongs_to_business(p_business_id,p_location_id) then
    raise exception 'Automation location does not belong to business';
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
    )
    values(
      p_business_id,p_location_id,p_device_id,trim(p_name),p_enabled,p_trigger_type,
      coalesce(p_trigger_config,'{}'::jsonb),v_command,coalesce(p_command_arguments,'{}'::jsonb),
      greatest(0,least(coalesce(p_cooldown_seconds,300),86400)),auth.uid()
    )
    returning id into v_id;
  else
    update public.smart_device_automation_rules
       set location_id=p_location_id,device_id=p_device_id,name=trim(p_name),enabled=p_enabled,
           trigger_type=p_trigger_type,trigger_config=coalesce(p_trigger_config,'{}'::jsonb),
           command=v_command,command_arguments=coalesce(p_command_arguments,'{}'::jsonb),
           cooldown_seconds=greatest(0,least(coalesce(p_cooldown_seconds,300),86400)),updated_at=now()
     where id=p_rule_id and business_id=p_business_id
     returning id into v_id;
    if v_id is null then raise exception 'Automation rule not found'; end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.smart_device_set_automation_rule(uuid,text,text,jsonb,text,uuid,uuid,uuid,jsonb,integer,boolean) from public,anon;
grant execute on function public.smart_device_set_automation_rule(uuid,text,text,jsonb,text,uuid,uuid,uuid,jsonb,integer,boolean) to authenticated,service_role;
