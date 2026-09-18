create or replace function public.ensure_current_user_profile()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_email text; v_name text; v_profile jsonb;
begin
 if v_user is null then raise exception 'not_authenticated'; end if;
 select email,coalesce(raw_user_meta_data->>'display_name',split_part(email,'@',1)) into v_email,v_name from auth.users where id=v_user;
 insert into public.profiles(id,email,display_name)
 values(v_user,v_email,v_name)
 on conflict(id) do update set email=excluded.email,display_name=coalesce(nullif(public.profiles.display_name,''),excluded.display_name);
 select to_jsonb(p) into v_profile from public.profiles p where p.id=v_user;
 return jsonb_build_object('profile',v_profile,'created',true);
end;$$;
revoke execute on function public.ensure_current_user_profile() from public,anon;
grant execute on function public.ensure_current_user_profile() to authenticated;

create or replace function public.ensure_current_user_demo_membership()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_email text; v_business uuid; v_program uuid; v_membership uuid;
begin
 if v_user is null then raise exception 'not_authenticated'; end if;
 select email into v_email from auth.users where id=v_user;
 select id into v_business from public.businesses where lower(coalesce(contact_email,''))=lower(v_email) or lower(coalesce(email,''))=lower(v_email) order by created_at limit 1;
 if v_business is null then return jsonb_build_object('ok',true,'demo',false); end if;
 insert into public.business_members(business_id,user_id,role) values(v_business,v_user,'owner') on conflict do nothing;
 select id into v_program from public.partner_programs where business_id=v_business and is_demo_test=true and enabled=true and preferred_access=true order by created_at limit 1;
 if v_program is not null then
  insert into public.partner_program_memberships(partner_program_id,user_id,status,source,granted_at) values(v_program,v_user,'active','demo_provisioned',now()) on conflict(partner_program_id,user_id) do update set status='active',expires_at=null returning id into v_membership;
 end if;
 return jsonb_build_object('ok',true,'demo',true,'business_id',v_business,'program_id',v_program,'membership_id',v_membership);
end;$$;
revoke execute on function public.ensure_current_user_demo_membership() from public,anon;
grant execute on function public.ensure_current_user_demo_membership() to authenticated;
