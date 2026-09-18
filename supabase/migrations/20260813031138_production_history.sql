create or replace function public.demo_provision_business(p_name text,p_auth_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if auth.uid() is distinct from p_auth_user_id then raise exception 'authenticated user mismatch'; end if;
 if not exists(select 1 from public.profiles where id=p_auth_user_id and is_demo_test=true) then raise exception 'linked demo profile required'; end if;
 insert into public.businesses(name,business_tier,verification_status,is_demo_test) values(trim(p_name),'standard','verified',true) returning id into v_id;
 insert into public.business_members(business_id,user_id,role) values(v_id,p_auth_user_id,'owner');
 return v_id;
end;$$;
grant execute on function public.demo_provision_business(text,uuid) to authenticated;
