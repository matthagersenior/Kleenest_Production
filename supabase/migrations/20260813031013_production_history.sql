create or replace function public.demo_create_business(p_demo_key text,p_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid; v_demo public.demo_identity_registry%rowtype;
begin
 select * into v_demo from public.demo_identity_registry where demo_key=trim(p_demo_key) and status='linked' and auth_user_id=auth.uid();
 if v_demo.id is null then raise exception 'linked demo identity required'; end if;
 insert into public.businesses(name,description,business_tier,verification_status,is_demo_test)
 values(trim(p_name),'Kleenest demo test business','standard','verified',true) returning id into v_business;
 insert into public.business_members(business_id,user_id,role) values(v_business,auth.uid(),'owner');
 return v_business;
end;$$;
grant execute on function public.demo_create_business(text,text) to authenticated;

create or replace function public.demo_assign_program_location(p_program_id uuid,p_location_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not exists(select 1 from public.partner_programs pp join public.business_members bm on bm.business_id=pp.business_id where pp.id=p_program_id and bm.user_id=auth.uid()) then raise exception 'not authorized'; end if;
 insert into public.partner_program_locations(partner_program_id,location_id,status,benefit_type) values(p_program_id,p_location_id,'active','preferred_visit') on conflict(partner_program_id,location_id) do update set status='active',benefit_type='preferred_visit' returning id into v_id;
 return v_id;
end;$$;
grant execute on function public.demo_assign_program_location(uuid,uuid) to authenticated;
