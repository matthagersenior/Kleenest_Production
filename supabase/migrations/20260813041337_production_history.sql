create or replace function public.ensure_demo_partner_network()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_program uuid; v_a uuid; v_b uuid; v_l1 uuid; v_l2 uuid;
begin
 select id into v_a from public.businesses order by created_at asc limit 1;
 select id into v_b from public.businesses where id<>v_a order by created_at asc limit 1;
 if v_a is null or v_b is null then return jsonb_build_object('ok',false,'reason','two_businesses_required'); end if;
 select id into v_l1 from public.locations where business_id=v_a order by created_at asc limit 1;
 select id into v_l2 from public.locations where business_id=v_b order by created_at asc limit 1;
 if v_l1 is null or v_l2 is null then return jsonb_build_object('ok',false,'reason','two_locations_required'); end if;
 select id into v_program from public.partner_programs where business_id=v_a and is_demo_test=true order by created_at asc limit 1;
 if v_program is null then
  insert into public.partner_programs(business_id,name,enabled,preferred_access,is_demo_test)
  values(v_a,'Demo Preferred Partner Program',true,true,true) returning id into v_program;
 else
  update public.partner_programs set enabled=true,preferred_access=true where id=v_program;
 end if;
 insert into public.partner_agreements(partner_program_id,partner_business_id,status,is_demo_test)
 select v_program,v_b,'active',true
 where not exists(select 1 from public.partner_agreements where partner_program_id=v_program and partner_business_id=v_b);
 insert into public.partner_program_locations(partner_program_id,location_id,status,benefit_type)
 values(v_program,v_l1,'active','preferred_location'),(v_program,v_l2,'active','preferred_location')
 on conflict(partner_program_id,location_id) do update set status='active',benefit_type='preferred_location';
 return jsonb_build_object('ok',true,'program_id',v_program,'business_a',v_a,'business_b',v_b,'locations',jsonb_build_array(v_l1,v_l2));
end;$$;
