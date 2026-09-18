create or replace function public.demo_create_partnership(p_program_id uuid,p_partner_business_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_business_id uuid;
begin
 select business_id into v_business_id from public.partner_programs where id=p_program_id and enabled=true;
 if v_business_id is null then raise exception 'program not found'; end if;
 if not exists(select 1 from public.business_members where business_id=v_business_id and user_id=auth.uid()) then raise exception 'not authorized'; end if;
 if not exists(select 1 from public.business_members where business_id=p_partner_business_id) then raise exception 'partner business has no members'; end if;
 insert into public.partner_agreements(partner_program_id,partner_business_id,status) values(p_program_id,p_partner_business_id,'active') returning id into v_id;
 return v_id;
end;$$;

grant execute on function public.demo_create_partnership(uuid,uuid) to authenticated;

create or replace function public.demo_create_program(p_business_id uuid,p_name text,p_preferred_access boolean default true)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid()) then raise exception 'not authorized'; end if;
 insert into public.partner_programs(business_id,name,enabled,preferred_access) values(p_business_id,trim(p_name),true,p_preferred_access) returning id into v_id;
 return v_id;
end;$$;
grant execute on function public.demo_create_program(uuid,text,boolean) to authenticated;

create or replace function public.demo_add_test_membership(p_program_id uuid,p_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not exists(select 1 from public.partner_programs pp join public.business_members bm on bm.business_id=pp.business_id where pp.id=p_program_id and bm.user_id=auth.uid()) then raise exception 'not authorized'; end if;
 if lower((select subscription_tier from public.profiles where id=p_user_id)) not in ('premium','fleet','enterprise') then raise exception 'demo user must be premium, fleet, or enterprise'; end if;
 insert into public.partner_program_memberships(partner_program_id,user_id,status,source) values(p_program_id,p_user_id,'active','demo_test') on conflict(partner_program_id,user_id) do update set status='active',source='demo_test' returning id into v_id;
 return v_id;
end;$$;
grant execute on function public.demo_add_test_membership(uuid,uuid) to authenticated;
