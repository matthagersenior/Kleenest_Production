create or replace function public.business_create_location(p_business_id uuid,p_name text,p_address text,p_city text,p_state text,p_postal_code text,p_latitude numeric,p_longitude numeric,p_phone text default null,p_website text default null)
returns public.locations
language plpgsql security invoker set search_path=public
as $$ declare v public.locations; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and coalesce(bm.role,'') in ('owner','admin','manager')) and not exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.is_admin=true) then raise exception 'Not authorized for this business'; end if;
 if p_name is null or trim(p_name)='' then raise exception 'Location name is required'; end if;
 if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Valid coordinates are required'; end if;
 insert into public.locations(business_id,name,address,city,state,postal_code,latitude,longitude,phone,website,is_active) values(p_business_id,trim(p_name),nullif(trim(p_address),''),nullif(trim(p_city),''),nullif(trim(p_state),''),nullif(trim(p_postal_code),''),p_latitude,p_longitude,nullif(trim(p_phone),''),nullif(trim(p_website),''),true) returning * into v;
 return v; end; $$;
revoke execute on function public.business_create_location(uuid,text,text,text,text,text,numeric,numeric,text,text) from public; grant execute on function public.business_create_location(uuid,text,text,text,text,text,numeric,numeric,text,text) to authenticated;

create or replace function public.business_update_location(p_location_id uuid,p_name text default null,p_address text default null,p_phone text default null,p_website text default null,p_active boolean default null)
returns public.locations language plpgsql security invoker set search_path=public
as $$ declare v public.locations; v_business uuid; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select business_id into v_business from public.locations where id=p_location_id;
 if v_business is null then raise exception 'Location not found'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=v_business and bm.user_id=auth.uid() and coalesce(bm.role,'') in ('owner','admin','manager')) and not exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.is_admin=true) then raise exception 'Not authorized for this business'; end if;
 update public.locations set name=coalesce(nullif(trim(p_name),''),name),address=coalesce(nullif(trim(p_address),''),address),phone=coalesce(nullif(trim(p_phone),''),phone),website=coalesce(nullif(trim(p_website),''),website),is_active=coalesce(p_active,is_active),updated_at=now() where id=p_location_id returning * into v;
 return v; end; $$;
revoke execute on function public.business_update_location(uuid,text,text,text,text,boolean) from public; grant execute on function public.business_update_location(uuid,text,text,text,text,boolean) to authenticated;
