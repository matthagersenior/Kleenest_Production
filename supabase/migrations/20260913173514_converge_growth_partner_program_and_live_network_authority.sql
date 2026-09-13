
create or replace function public.business_partner_program_manage_allowed(p_partner_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.partner_programs pp
    where pp.id=p_partner_program_id
      and public.business_capability_allowed(pp.business_id,'growth.partner_programs')
  );
$$;

revoke all on function public.business_partner_program_manage_allowed(uuid) from public,anon;
grant execute on function public.business_partner_program_manage_allowed(uuid) to authenticated,service_role;

create or replace function public.business_create_partner_program(
  p_business_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  if not public.business_capability_allowed(p_business_id,'growth.partner_programs') then
    raise exception 'Business Growth partner-program capability required';
  end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Program name required'; end if;

  insert into public.partner_programs(business_id,name,enabled)
  values(p_business_id,trim(p_name),true)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.business_create_partnership(
  p_business_id uuid,
  p_name text,
  p_enabled boolean default false,
  p_preferred_access boolean default false,
  p_match_discount_bonus numeric default 0,
  p_custom_perk text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  if not public.business_capability_allowed(p_business_id,'growth.partner_programs') then
    raise exception 'Business Growth partner-program capability required';
  end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Partnership name required'; end if;

  insert into public.partner_programs(
    business_id,name,enabled,preferred_access,match_discount_bonus,custom_perk
  )
  values(
    p_business_id,trim(p_name),coalesce(p_enabled,false),
    coalesce(p_preferred_access,false),
    greatest(coalesce(p_match_discount_bonus,0),0),
    p_custom_perk
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.business_update_partner_program(
  p_business_id uuid,
  p_partner_program_id uuid,
  p_name text,
  p_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;
  if coalesce(p_enabled,true)
     and not public.business_capability_allowed(p_business_id,'growth.partner_programs') then
    raise exception 'Business Growth partner-program capability required';
  end if;

  update public.partner_programs
     set name=coalesce(nullif(trim(coalesce(p_name,'')),''),name),
         enabled=coalesce(p_enabled,enabled)
   where id=p_partner_program_id and business_id=p_business_id;

  if not found then raise exception 'Partner program not found'; end if;
end;
$$;

create or replace function public.business_update_partnership(
  p_business_id uuid,
  p_partnership_id uuid,
  p_name text,
  p_enabled boolean,
  p_preferred_access boolean,
  p_match_discount_bonus numeric,
  p_custom_perk text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;
  if coalesce(p_enabled,false)
     and not public.business_capability_allowed(p_business_id,'growth.partner_programs') then
    raise exception 'Business Growth partner-program capability required';
  end if;

  update public.partner_programs
     set name=coalesce(nullif(trim(coalesce(p_name,'')),''),name),
         enabled=coalesce(p_enabled,enabled),
         preferred_access=coalesce(p_preferred_access,preferred_access),
         match_discount_bonus=greatest(coalesce(p_match_discount_bonus,match_discount_bonus,0),0),
         custom_perk=coalesce(p_custom_perk,custom_perk)
   where id=p_partnership_id and business_id=p_business_id;

  if not found then raise exception 'Partnership not found'; end if;
  return p_partnership_id;
end;
$$;

create or replace function public.business_delete_partner_program(
  p_business_id uuid,
  p_partner_program_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;

  delete from public.partner_programs
  where id=p_partner_program_id and business_id=p_business_id;

  if not found then raise exception 'Partner program not found'; end if;
end;
$$;

create or replace function public.business_delete_partnership(
  p_business_id uuid,
  p_partnership_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;

  if exists(
    select 1 from public.partner_agreements
    where partner_program_id=p_partnership_id
  ) then
    update public.partner_programs
       set enabled=false
     where id=p_partnership_id and business_id=p_business_id;
  else
    delete from public.partner_programs
     where id=p_partnership_id and business_id=p_business_id;
  end if;

  if not found then raise exception 'Partnership not found'; end if;
  return true;
end;
$$;

create or replace function public.business_add_program_location(
  p_partner_program_id uuid,
  p_location_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_business_id uuid;
begin
  select business_id into v_business_id
  from public.partner_programs
  where id=p_partner_program_id;

  if v_business_id is null then raise exception 'Program not found'; end if;
  if not public.business_partner_program_manage_allowed(p_partner_program_id) then
    raise exception 'Business Growth partner-program capability required';
  end if;
  if not exists(
    select 1 from public.locations l
    where l.id=p_location_id
      and coalesce(l.claimed_business_id,l.business_id)=v_business_id
  ) then
    raise exception 'Location does not belong to program business';
  end if;

  insert into public.partner_program_locations(
    partner_program_id,location_id,status,benefit_type
  )
  values(p_partner_program_id,p_location_id,'active','preferred_location')
  on conflict(partner_program_id,location_id) do update set status='active'
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.business_remove_program_location(
  p_partner_program_id uuid,
  p_location_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_business_id uuid;
begin
  select business_id into v_business_id
  from public.partner_programs
  where id=p_partner_program_id;

  if v_business_id is null then raise exception 'Program not found'; end if;
  if not public.business_can_manage(v_business_id) then
    raise exception 'Business management access required';
  end if;

  update public.partner_program_locations
     set status='revoked'
   where partner_program_id=p_partner_program_id and location_id=p_location_id;

  return found;
end;
$$;

create or replace function public.business_add_program_member(
  p_partner_program_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  if not public.business_partner_program_manage_allowed(p_partner_program_id) then
    raise exception 'Business Growth partner-program capability required';
  end if;
  if p_user_id is null or not exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'Kleenest user required';
  end if;

  insert into public.partner_program_memberships(partner_program_id,user_id,status,source)
  values(p_partner_program_id,p_user_id,'active','business_program')
  on conflict(partner_program_id,user_id) do update set status='active',expires_at=null
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.business_enroll_program_user(
  p_partner_program_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_eligible boolean;
begin
  if not public.business_partner_program_manage_allowed(p_partner_program_id) then
    raise exception 'Business Growth partner-program capability required';
  end if;
  if p_user_id is null then raise exception 'User required'; end if;

  select
    coalesce(p.is_admin,false)
    or coalesce(p.is_platform_owner,false)
    or p.subscription_tier::text in ('premium','family')
    or exists(
      select 1
      from public.family_members fm
      join public.family_groups fg on fg.id=fm.group_id
      join public.family_accounts fa on fa.owner_user_id=fg.owner_id
      where fm.user_id=p_user_id
        and fa.plan_code='family'
        and (select count(*) from public.family_members x where x.group_id=fm.group_id)<=fg.max_members
    )
    or exists(
      select 1
      from public.fleet_premium_memberships m
      where m.user_id=p_user_id and m.status='active'
    )
    into v_eligible
  from public.profiles p
  where p.id=p_user_id;

  if not coalesce(v_eligible,false) then raise exception 'User is not Premium-entitled'; end if;

  insert into public.partner_program_memberships(partner_program_id,user_id,status,source)
  values(p_partner_program_id,p_user_id,'active','business_program')
  on conflict(partner_program_id,user_id) do update set status='active',expires_at=null
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.business_revoke_program_member(
  p_partner_program_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_business_id uuid;
begin
  select business_id into v_business_id
  from public.partner_programs
  where id=p_partner_program_id;

  if v_business_id is null then raise exception 'Program not found'; end if;
  if not public.business_can_manage(v_business_id) then
    raise exception 'Business management access required';
  end if;

  update public.partner_program_memberships
     set status='revoked'
   where partner_program_id=p_partner_program_id and user_id=p_user_id;

  return found;
end;
$$;

create or replace function public.business_set_partner_enabled(
  p_business_id uuid,
  p_program_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v jsonb;
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;
  if coalesce(p_enabled,false)
     and not public.business_capability_allowed(p_business_id,'growth.partner_programs') then
    raise exception 'Business Growth partner-program capability required';
  end if;

  update public.partner_programs
     set enabled=coalesce(p_enabled,enabled)
   where id=p_program_id and business_id=p_business_id;

  if not found then raise exception 'Program not found'; end if;

  select to_jsonb(p) into v
  from public.partner_programs p
  where p.id=p_program_id;

  return v;
end;
$$;

create or replace function public.business_set_partner_program_access(
  p_partner_program_id uuid,
  p_preferred_access boolean
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_business uuid;
begin
  select business_id into v_business
  from public.partner_programs
  where id=p_partner_program_id;

  if v_business is null then raise exception 'Program not found'; end if;
  if not public.business_can_manage(v_business) then
    raise exception 'Business management access required';
  end if;
  if coalesce(p_preferred_access,false)
     and not public.business_capability_allowed(v_business,'growth.partner_programs') then
    raise exception 'Business Growth partner-program capability required';
  end if;

  update public.partner_programs
     set preferred_access=coalesce(p_preferred_access,false),
         enabled=case
           when coalesce(p_preferred_access,false) then true
           else enabled
         end
   where id=p_partner_program_id;

  return found;
end;
$$;

create or replace function public.business_create_single_use_access_offer(
  p_partner_program_id uuid,
  p_name text,
  p_description text,
  p_price_cents integer,
  p_quantity integer,
  p_expires_at timestamptz default null
)
returns public.single_use_access_offers
language plpgsql
security definer
set search_path=''
as $$
declare
  v_program public.partner_programs;
  v_offer public.single_use_access_offers;
begin
  select * into v_program
  from public.partner_programs
  where id=p_partner_program_id;

  if v_program.id is null then raise exception 'Program unavailable'; end if;
  if not public.business_partner_program_manage_allowed(p_partner_program_id) then
    raise exception 'Business Growth partner-program capability required';
  end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Offer name required'; end if;

  insert into public.single_use_access_offers(
    partner_program_id,business_id,name,description,price_cents,quantity,expires_at
  )
  values(
    v_program.id,v_program.business_id,trim(p_name),p_description,
    greatest(0,coalesce(p_price_cents,0)),
    greatest(1,coalesce(p_quantity,1)),
    p_expires_at
  )
  returning * into v_offer;

  return v_offer;
end;
$$;

create or replace function public.business_request_partner_agreement(
  p_partner_program_id uuid,
  p_partner_business_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  if not public.business_partner_program_manage_allowed(p_partner_program_id) then
    raise exception 'Business Growth partner-program capability required';
  end if;
  if not exists(select 1 from public.businesses where id=p_partner_business_id) then
    raise exception 'Partner business does not exist';
  end if;
  if exists(
    select 1 from public.partner_programs pp
    where pp.id=p_partner_program_id and pp.business_id=p_partner_business_id
  ) then
    raise exception 'Business cannot partner with itself';
  end if;

  insert into public.partner_agreements(
    partner_program_id,partner_business_id,status
  )
  values(p_partner_program_id,p_partner_business_id,'pending')
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.business_ensure_live_network_geofences(
  p_business_id uuid,
  p_radius_meters integer default 150
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer:=0;
begin
  if not public.business_capability_allowed(p_business_id,'growth.live_network') then
    raise exception 'Business Growth live-network capability required';
  end if;
  if p_radius_meters<50 or p_radius_meters>1000 then
    raise exception 'Radius must be between 50 and 1000 meters';
  end if;

  insert into public.business_geofences(
    business_id,location_id,radius_meters,notification_enabled,notification_payload,active
  )
  select
    p_business_id,l.id,p_radius_meters,true,
    jsonb_build_object(
      'title','Kleenest Live Network',
      'body','Live location activity is available for this business location.'
    ),
    true
  from public.locations l
  where coalesce(l.claimed_business_id,l.business_id)=p_business_id
    and coalesce(l.is_active,true)
    and l.latitude is not null
    and l.longitude is not null
  on conflict (business_id,location_id) where location_id is not null
  do update set active=true,radius_meters=excluded.radius_meters;

  get diagnostics v_count=row_count;

  return jsonb_build_object(
    'touched',v_count,
    'manifest',public.business_live_network_manifest(p_business_id)
  );
end;
$$;

create or replace function public.business_live_network_manifest(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.business_capability_allowed(p_business_id,'growth.live_network') then
    raise exception 'Business Growth live-network capability required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'geofence_id',g.id,
      'business_id',g.business_id,
      'location_id',g.location_id,
      'radius_meters',g.radius_meters,
      'notification_enabled',g.notification_enabled,
      'notification_payload',g.notification_payload,
      'active',g.active,
      'location_name',l.name,
      'latitude',l.latitude,
      'longitude',l.longitude,
      'address',l.address,
      'city',l.city,
      'state',l.state
    ) order by l.name nulls last,g.created_at)
    from public.business_geofences g
    left join public.locations l on l.id=g.location_id
    where g.business_id=p_business_id
      and g.active
      and l.latitude is not null
      and l.longitude is not null
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.business_create_partner_program(uuid,text) from public,anon;
revoke all on function public.business_create_partnership(uuid,text,boolean,boolean,numeric,text) from public,anon;
revoke all on function public.business_update_partner_program(uuid,uuid,text,boolean) from public,anon;
revoke all on function public.business_update_partnership(uuid,uuid,text,boolean,boolean,numeric,text) from public,anon;
revoke all on function public.business_delete_partner_program(uuid,uuid) from public,anon;
revoke all on function public.business_delete_partnership(uuid,uuid) from public,anon;
revoke all on function public.business_add_program_location(uuid,uuid) from public,anon;
revoke all on function public.business_remove_program_location(uuid,uuid) from public,anon;
revoke all on function public.business_add_program_member(uuid,uuid) from public,anon;
revoke all on function public.business_enroll_program_user(uuid,uuid) from public,anon;
revoke all on function public.business_revoke_program_member(uuid,uuid) from public,anon;
revoke all on function public.business_set_partner_enabled(uuid,uuid,boolean) from public,anon;
revoke all on function public.business_set_partner_program_access(uuid,boolean) from public,anon;
revoke all on function public.business_create_single_use_access_offer(uuid,text,text,integer,integer,timestamptz) from public,anon;
revoke all on function public.business_request_partner_agreement(uuid,uuid) from public,anon;
revoke all on function public.business_ensure_live_network_geofences(uuid,integer) from public,anon;
revoke all on function public.business_live_network_manifest(uuid) from public,anon;

grant execute on function public.business_create_partner_program(uuid,text) to authenticated,service_role;
grant execute on function public.business_create_partnership(uuid,text,boolean,boolean,numeric,text) to authenticated,service_role;
grant execute on function public.business_update_partner_program(uuid,uuid,text,boolean) to authenticated,service_role;
grant execute on function public.business_update_partnership(uuid,uuid,text,boolean,boolean,numeric,text) to authenticated,service_role;
grant execute on function public.business_delete_partner_program(uuid,uuid) to authenticated,service_role;
grant execute on function public.business_delete_partnership(uuid,uuid) to authenticated,service_role;
grant execute on function public.business_add_program_location(uuid,uuid) to authenticated,service_role;
grant execute on function public.business_remove_program_location(uuid,uuid) to authenticated,service_role;
grant execute on function public.business_add_program_member(uuid,uuid) to authenticated,service_role;
grant execute on function public.business_enroll_program_user(uuid,uuid) to authenticated,service_role;
grant execute on function public.business_revoke_program_member(uuid,uuid) to authenticated,service_role;
grant execute on function public.business_set_partner_enabled(uuid,uuid,boolean) to authenticated,service_role;
grant execute on function public.business_set_partner_program_access(uuid,boolean) to authenticated,service_role;
grant execute on function public.business_create_single_use_access_offer(uuid,text,text,integer,integer,timestamptz) to authenticated,service_role;
grant execute on function public.business_request_partner_agreement(uuid,uuid) to authenticated,service_role;
grant execute on function public.business_ensure_live_network_geofences(uuid,integer) to authenticated,service_role;
grant execute on function public.business_live_network_manifest(uuid) to authenticated,service_role;
