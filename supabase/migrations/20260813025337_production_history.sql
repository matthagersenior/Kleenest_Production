create or replace function public.resolve_location_identity(p_name text,p_address text default null,p_latitude double precision default null,p_longitude double precision default null)
returns uuid
language sql security definer set search_path=public as $$
 select l.id from public.locations l
 where l.is_active=true
 and (
   (p_name is not null and lower(trim(l.name))=lower(trim(p_name)) and (p_address is null or lower(trim(coalesce(l.address,'')))=lower(trim(p_address))))
   or
   (p_latitude is not null and p_longitude is not null and abs(l.latitude-p_latitude)<0.0005 and abs(l.longitude-p_longitude)<0.0005)
 )
 order by case when p_name is not null and lower(trim(l.name))=lower(trim(p_name)) then 0 else 1 end
 limit 1;
$$;

create or replace function public.can_activate_preferred_location_identity(p_name text,p_address text default null,p_latitude double precision default null,p_longitude double precision default null)
returns table(eligible boolean,location_id uuid,partner_program_id uuid,program_name text,partner_business_id uuid,reason text)
language plpgsql security definer set search_path=public as $$
declare v_location uuid;
begin
 v_location:=public.resolve_location_identity(p_name,p_address,p_latitude,p_longitude);
 if v_location is null then return query select false,null::uuid,null::uuid,null::text,null::uuid,'location_not_registered'; return; end if;
 return query select c.eligible,v_location,c.partner_program_id,c.program_name,c.partner_business_id,c.reason from public.can_activate_preferred_location(v_location) c;
end;$$;

grant execute on function public.resolve_location_identity(text,text,double precision,double precision) to authenticated;
grant execute on function public.can_activate_preferred_location_identity(text,text,double precision,double precision) to authenticated;
