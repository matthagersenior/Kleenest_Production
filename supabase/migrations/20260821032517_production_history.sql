create or replace function public.business_list_amenities(p_business_id uuid,p_location_id uuid)
returns table(amenity_id uuid,name text,category text)
language sql security definer set search_path to 'public'
as $$ select a.id,a.name,a.category from public.amenities a join public.location_amenities la on la.amenity_id=a.id join public.locations l on l.id=la.location_id where l.business_id=p_business_id and l.id=p_location_id and public.business_can_manage(p_business_id) order by a.category,a.name; $$;
create or replace function public.business_list_partner_programs()
returns setof public.partner_programs language sql security definer set search_path to 'public'
as $$ select pp.* from public.partner_programs pp where exists(select 1 from public.business_members bm where bm.business_id=pp.business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin','manager','analyst')); $$;
create or replace function public.business_set_partner_program_access(p_partner_program_id uuid,p_preferred_access boolean)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp'
as $$ declare v_business uuid; begin select business_id into v_business from public.partner_programs where id=p_partner_program_id; if v_business is null then raise exception 'Program not found'; end if; if not public.business_admin_allowed(v_business) then raise exception 'Business admin access required'; end if; update public.partner_programs set preferred_access=p_preferred_access,enabled=true where id=p_partner_program_id; return found; end $$;
