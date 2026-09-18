create or replace function public.create_business_for_current_user(p_name text,p_address text,p_phone text default '',p_website text default '',p_place_type text default 'other')
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_business uuid;
begin
 if v_user is null then raise exception 'not_authenticated'; end if;
 if nullif(trim(p_name),'') is null then raise exception 'business_name_required'; end if;
 insert into public.businesses(name,website,phone,email,business_tier,verification_status,is_demo_test)
 values(trim(p_name),nullif(trim(p_website),''),nullif(trim(p_phone),''),(select email from auth.users where id=v_user),'standard','pending',true)
 returning id into v_business;
 insert into public.business_members(business_id,user_id,role) values(v_business,v_user,'owner');
 update public.profiles set is_business_user=true,updated_at=now() where id=v_user;
 return v_business;
end;
$$;
revoke execute on function public.create_business_for_current_user(text,text,text,text,text) from anon;
grant execute on function public.create_business_for_current_user(text,text,text,text,text) to authenticated;
