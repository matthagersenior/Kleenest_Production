create or replace function public.business_list_partner_programs()
returns setof public.partner_programs
language sql security definer set search_path=public as $$
 select pp.* from public.partner_programs pp
 where exists(select 1 from public.business_members bm where bm.business_id=pp.business_id and bm.user_id=auth.uid());
$$;

create or replace function public.business_create_partner_program(p_name text,p_partner_business_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not exists(select 1 from public.business_members where business_id=p_partner_business_id and user_id=auth.uid()) then raise exception 'not authorized for business'; end if;
 insert into public.partner_programs(name,business_id,enabled,preferred_access) values(p_name,p_partner_business_id,false,false) returning id into v_id;
 return v_id;
end;$$;

create or replace function public.business_set_partner_program_access(p_partner_program_id uuid,p_preferred_access boolean)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.partner_programs pp join public.business_members bm on bm.business_id=pp.business_id where pp.id=p_partner_program_id and bm.user_id=auth.uid()) then raise exception 'not authorized'; end if;
 update public.partner_programs set preferred_access=p_preferred_access, enabled=true where id=p_partner_program_id;
 return true;
end;$$;

create or replace function public.business_add_program_member(p_partner_program_id uuid,p_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not exists(select 1 from public.partner_programs pp join public.business_members bm on bm.business_id=pp.business_id where pp.id=p_partner_program_id and bm.user_id=auth.uid()) then raise exception 'not authorized'; end if;
 insert into public.partner_program_memberships(partner_program_id,user_id,status,source) values(p_partner_program_id,p_user_id,'active','business_program') on conflict(partner_program_id,user_id) do update set status='active',expires_at=null returning id into v_id;
 return v_id;
end;$$;

create or replace function public.business_revoke_program_member(p_partner_program_id uuid,p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.partner_programs pp join public.business_members bm on bm.business_id=pp.business_id where pp.id=p_partner_program_id and bm.user_id=auth.uid()) then raise exception 'not authorized'; end if;
 update public.partner_program_memberships set status='revoked' where partner_program_id=p_partner_program_id and user_id=p_user_id;
 return true;
end;$$;

grant execute on function public.business_list_partner_programs() to authenticated;
grant execute on function public.business_create_partner_program(text,uuid) to authenticated;
grant execute on function public.business_set_partner_program_access(uuid,boolean) to authenticated;
grant execute on function public.business_add_program_member(uuid,uuid) to authenticated;
grant execute on function public.business_revoke_program_member(uuid,uuid) to authenticated;
