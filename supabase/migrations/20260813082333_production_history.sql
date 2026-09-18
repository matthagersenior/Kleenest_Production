begin;
create or replace function public.get_business_dashboard()
returns jsonb language plpgsql security definer set search_path=public
as $$
declare b uuid; result jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select business_id into b from public.business_members where user_id=auth.uid() order by created_at limit 1;
 if b is null then return jsonb_build_object('business',null,'locations',jsonb_build_array(),'programs',jsonb_build_array()); end if;
 select jsonb_build_object('business',to_jsonb(x),'locations',coalesce((select jsonb_agg(l order by l.created_at desc) from public.locations l where l.business_id=b and l.is_active), '[]'::jsonb),'programs',coalesce((select jsonb_agg(p order by p.created_at desc) from public.partner_programs p where p.business_id=b), '[]'::jsonb)) into result from public.businesses x where x.id=b;
 return coalesce(result,'{}'::jsonb);
end;$$;
revoke all on function public.get_business_dashboard() from public;
grant execute on function public.get_business_dashboard() to authenticated;

create or replace function public.admin_get_overview()
returns jsonb language plpgsql security definer set search_path=public
as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_admin) then raise exception 'admin access required'; end if;
 return jsonb_build_object('pending_businesses',(select count(*) from public.businesses where verification_status='pending'),'reports',(select count(*) from public.reports where status::text not in ('resolved','rejected')),'health','Protected');
end;$$;
revoke all on function public.admin_get_overview() from public;
grant execute on function public.admin_get_overview() to authenticated;

create or replace function public.admin_list_pending_businesses()
returns setof public.businesses language sql security definer set search_path=public
as $$ select b.* from public.businesses b where exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin) and b.verification_status='pending' order by b.created_at desc $$;
revoke all on function public.admin_list_pending_businesses() from public;
grant execute on function public.admin_list_pending_businesses() to authenticated;

create or replace function public.admin_list_reports()
returns setof public.reports language sql security definer set search_path=public
as $$ select r.* from public.reports r where exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin) order by r.created_at desc $$;
revoke all on function public.admin_list_reports() from public;
grant execute on function public.admin_list_reports() to authenticated;

create or replace function public.admin_set_business_verification(p_business_id uuid,p_status verification_status)
returns public.businesses language plpgsql security definer set search_path=public
as $$ declare x public.businesses; begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_admin) then raise exception 'admin access required'; end if;
 update public.businesses set verification_status=p_status,updated_at=now() where id=p_business_id returning * into x;
 return x;
end;$$;
revoke all on function public.admin_set_business_verification(uuid,verification_status) from public;
grant execute on function public.admin_set_business_verification(uuid,verification_status) to authenticated;

create or replace function public.admin_set_business_tier(p_business_id uuid,p_tier business_tier)
returns public.businesses language plpgsql security definer set search_path=public
as $$ declare x public.businesses; begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_admin) then raise exception 'admin access required'; end if;
 update public.businesses set business_tier=p_tier,updated_at=now() where id=p_business_id returning * into x;
 return x;
end;$$;
revoke all on function public.admin_set_business_tier(uuid,business_tier) from public;
grant execute on function public.admin_set_business_tier(uuid,business_tier) to authenticated;
commit;
