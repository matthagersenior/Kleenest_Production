create or replace function public.ensure_current_user_demo_membership()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
 v_user uuid:=auth.uid();
 v_email text;
 v_profile public.profiles%rowtype;
 v_business_id uuid;
 v_program_id uuid;
 v_membership_id uuid;
 v_result jsonb:='[]'::jsonb;
begin
 if v_user is null then raise exception 'not_authenticated'; end if;
 select email into v_email from auth.users where id=v_user;
 select * into v_profile from public.profiles where id=v_user;
 if v_email is null then return v_result; end if;
 if coalesce(v_profile.is_demo_test,false) is not true then return v_result; end if;
 for v_business_id in select id from public.businesses where is_demo_test=true order by name loop
   if lower(coalesce(v_email,'')) like '%coffee%' and v_business_id=(select id from public.businesses where name='Downtown Coffee & Market' limit 1)
      or lower(coalesce(v_email,'')) like '%travel%' and v_business_id=(select id from public.businesses where name='Kleenest Travel Plaza' limit 1) then
     select id into v_membership_id from public.business_members where business_id=v_business_id and user_id=v_user;
     if v_membership_id is null then
       insert into public.business_members(business_id,user_id,role) values(v_business_id,v_user,'owner') returning id into v_membership_id;
     end if;
     select id into v_program_id from public.partner_programs where business_id=v_business_id and enabled=true and preferred_access=true and is_demo_test=true order by created_at limit 1;
     if v_program_id is not null then
       insert into public.partner_program_memberships(partner_program_id,user_id,status,source)
       values(v_program_id,v_user,'active','demo_provisioning')
       on conflict (partner_program_id,user_id) do update set status='active';
       v_result:=v_result||jsonb_build_object('business_id',v_business_id,'program_id',v_program_id,'business_membership_id',v_membership_id);
     end if;
   end if;
 end loop;
 return v_result;
end;
$$;
revoke execute on function public.ensure_current_user_demo_membership() from public,anon;
grant execute on function public.ensure_current_user_demo_membership() to authenticated;
