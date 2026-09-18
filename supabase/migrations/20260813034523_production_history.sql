create or replace function public.create_demo_partner_program(p_business_id uuid,p_name text,p_description text default '',p_preferred_enabled boolean default true)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'business_admin_required'; end if;
 insert into public.partner_programs(business_id,name,enabled,preferred_access,custom_perk,is_demo_test)
 values(p_business_id,trim(p_name),true,coalesce(p_preferred_enabled,true),null,true) returning id into v_id;
 return v_id;
end;$$;
grant execute on function public.create_demo_partner_program(uuid,text,text,boolean) to authenticated;

create or replace function public.create_demo_partnership(p_program_id uuid,p_partner_business_id uuid,p_name text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_owner uuid;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select business_id into v_owner from public.partner_programs where id=p_program_id and is_demo_test=true;
 if v_owner is null then raise exception 'demo_program_not_found'; end if;
 if not exists(select 1 from public.business_members where business_id=v_owner and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'business_admin_required'; end if;
 insert into public.partner_agreements(business_id,partner_business_id,partner_program_id,status,is_demo_test)
 values(v_owner,p_partner_business_id,p_program_id,'active',true) returning id into v_id;
 return v_id;
end;$$;
grant execute on function public.create_demo_partnership(uuid,uuid,text) to authenticated;

create or replace function public.list_my_demo_programs()
returns table(id uuid,business_id uuid,name text,enabled boolean,preferred_access boolean,match_discount_bonus numeric,custom_perk text)
language sql security invoker as $$
 select p.id,p.business_id,p.name,p.enabled,p.preferred_access,p.match_discount_bonus,p.custom_perk
 from public.partner_programs p
 where p.is_demo_test=true and exists(select 1 from public.business_members m where m.business_id=p.business_id and m.user_id=auth.uid())
 order by p.created_at desc;
$$;
grant execute on function public.list_my_demo_programs() to authenticated;
