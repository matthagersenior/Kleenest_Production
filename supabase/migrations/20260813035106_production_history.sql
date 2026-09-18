create or replace function public.enroll_program_location(p_program_id uuid,p_location_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_business uuid;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select business_id into v_business from public.partner_programs where id=p_program_id and enabled=true;
 if v_business is null then raise exception 'program_not_found'; end if;
 if not exists(select 1 from public.business_members where business_id=v_business and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'business_admin_required'; end if;
 if not exists(select 1 from public.locations where id=p_location_id and business_id=v_business and is_active=true) then raise exception 'location_not_owned_by_business'; end if;
 select id into v_id from public.partner_program_locations where partner_program_id=p_program_id and location_id=p_location_id;
 if v_id is null then
  insert into public.partner_program_locations(partner_program_id,location_id,status) values(p_program_id,p_location_id,'active') returning id into v_id;
 else
  update public.partner_program_locations set status='active' where id=v_id;
 end if;
 return v_id;
end;$$;
grant execute on function public.enroll_program_location(uuid,uuid) to authenticated;

create or replace function public.remove_program_location(p_program_id uuid,p_location_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_business uuid;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select business_id into v_business from public.partner_programs where id=p_program_id;
 if v_business is null then raise exception 'program_not_found'; end if;
 if not exists(select 1 from public.business_members where business_id=v_business and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'business_admin_required'; end if;
 update public.partner_program_locations set status='inactive' where partner_program_id=p_program_id and location_id=p_location_id;
 return found;
end;$$;
grant execute on function public.remove_program_location(uuid,uuid) to authenticated;

create or replace function public.list_program_locations(p_program_id uuid)
returns table(id uuid,partner_program_id uuid,location_id uuid,status text,benefit_type text)
language sql security invoker as $$
 select l.id,l.partner_program_id,l.location_id,l.status,l.benefit_type from public.partner_program_locations l
 where l.partner_program_id=p_program_id and exists(select 1 from public.partner_programs p join public.business_members m on m.business_id=p.business_id where p.id=l.partner_program_id and m.user_id=auth.uid());
$$;
grant execute on function public.list_program_locations(uuid) to authenticated;
