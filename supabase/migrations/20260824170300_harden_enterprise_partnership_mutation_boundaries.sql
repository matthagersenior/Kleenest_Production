begin;
create or replace function public.business_update_partnership(p_business_id uuid, p_partnership_id uuid, p_name text, p_enabled boolean, p_preferred_access boolean, p_match_discount_bonus numeric, p_custom_perk text)
returns uuid language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
begin
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 if not exists(select 1 from public.businesses b where b.id=p_business_id and lower(b.business_tier::text)='enterprise') then raise exception 'Business Enterprise plan required'; end if;
 update public.partner_programs set name=trim(p_name),enabled=p_enabled,preferred_access=p_preferred_access,match_discount_bonus=coalesce(p_match_discount_bonus,0),custom_perk=p_custom_perk where id=p_partnership_id and business_id=p_business_id;
 if not found then raise exception 'Partnership not found'; end if;
 return p_partnership_id;
end $$;
create or replace function public.business_delete_partnership(p_business_id uuid, p_partnership_id uuid)
returns boolean language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
begin
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 if not exists(select 1 from public.businesses b where b.id=p_business_id and lower(b.business_tier::text)='enterprise') then raise exception 'Business Enterprise plan required'; end if;
 if exists(select 1 from public.partner_agreements where partner_program_id=p_partnership_id) then update public.partner_programs set enabled=false where id=p_partnership_id and business_id=p_business_id; else delete from public.partner_programs where id=p_partnership_id and business_id=p_business_id; end if;
 if not found then raise exception 'Partnership not found'; end if;
 return true;
end $$;
commit;
