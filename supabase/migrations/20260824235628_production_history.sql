create or replace function public.admin_assign_business_member(p_business_id uuid,p_user_id uuid,p_role business_member_role default 'owner') returns jsonb language plpgsql security definer set search_path='public','auth','extensions','pg_temp' as $function$
declare caller uuid:=auth.uid(); result jsonb; previous jsonb;
begin
 if caller is null then raise exception 'authentication required'; end if;
 if not exists(select 1 from public.profiles where id=caller and is_platform_owner=true) then raise exception 'platform owner authorization required'; end if;
 if p_business_id is null then raise exception 'business required'; end if;
 if p_user_id is null then raise exception 'user required'; end if;
 if not exists(select 1 from public.businesses where id=p_business_id) then raise exception 'business not found'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'user profile not found'; end if;
 select jsonb_build_object('business_id',bm.business_id,'user_id',bm.user_id,'role',bm.role::text) into previous from public.business_members bm where bm.business_id=p_business_id and bm.user_id=p_user_id;
 insert into public.business_members(business_id,user_id,role,created_at) values(p_business_id,p_user_id,p_role,now()) on conflict(business_id,user_id) do update set role=excluded.role;
 update public.profiles set is_business_user=true,updated_at=now() where id=p_user_id;
 select jsonb_build_object('business_id',p_business_id,'user_id',p_user_id,'role',p_role::text,'is_business_user',true) into result;
 insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason) values(caller,p_user_id,coalesce(previous,'{}'::jsonb),result,'Owner assigned business membership');
 return result;
end;$function$;
revoke all on function public.admin_assign_business_member(uuid,uuid,business_member_role) from public;
grant execute on function public.admin_assign_business_member(uuid,uuid,business_member_role) to authenticated;

create or replace function public.admin_list_business_members(p_business_id uuid) returns jsonb language plpgsql security definer set search_path='public','auth','extensions','pg_temp' as $function$
declare caller uuid:=auth.uid(); result jsonb;
begin
 if caller is null then raise exception 'authentication required'; end if;
 if not exists(select 1 from public.profiles where id=caller and is_platform_owner=true) then raise exception 'platform owner authorization required'; end if;
 if p_business_id is null then raise exception 'business required'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('business_id',bm.business_id,'user_id',bm.user_id,'role',bm.role::text,'created_at',bm.created_at,'display_name',p.display_name,'username',p.username,'is_business_user',p.is_business_user) order by bm.created_at), '[]'::jsonb) into result from public.business_members bm join public.profiles p on p.id=bm.user_id where bm.business_id=p_business_id;
 return result;
end;$function$;
revoke all on function public.admin_list_business_members(uuid) from public;
grant execute on function public.admin_list_business_members(uuid) to authenticated;

create or replace function public.admin_remove_business_member(p_business_id uuid,p_user_id uuid) returns jsonb language plpgsql security definer set search_path='public','auth','extensions','pg_temp' as $function$
declare caller uuid:=auth.uid(); remaining integer; previous jsonb;
begin
 if caller is null then raise exception 'authentication required'; end if;
 if not exists(select 1 from public.profiles where id=caller and is_platform_owner=true) then raise exception 'platform owner authorization required'; end if;
 select jsonb_build_object('business_id',bm.business_id,'user_id',bm.user_id,'role',bm.role::text) into previous from public.business_members bm where bm.business_id=p_business_id and bm.user_id=p_user_id;
 delete from public.business_members where business_id=p_business_id and user_id=p_user_id;
 select count(*) into remaining from public.business_members where user_id=p_user_id;
 if remaining=0 then update public.profiles set is_business_user=false,updated_at=now() where id=p_user_id; end if;
 insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason) values(caller,p_user_id,coalesce(previous,'{}'::jsonb),jsonb_build_object('business_id',p_business_id,'removed',true),'Owner removed business membership');
 return jsonb_build_object('business_id',p_business_id,'user_id',p_user_id,'removed',true,'is_business_user',remaining>0);
end;$function$;
revoke all on function public.admin_remove_business_member(uuid,uuid) from public;
grant execute on function public.admin_remove_business_member(uuid,uuid) to authenticated;
