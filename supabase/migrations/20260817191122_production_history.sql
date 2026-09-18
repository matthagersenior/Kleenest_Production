create or replace function public.business_update_partner_program(p_business_id uuid,p_partner_program_id uuid,p_name text,p_enabled boolean default true)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  if not exists(select 1 from public.businesses b where b.id=p_business_id and b.business_tier::text='enterprise') then raise exception 'Business Enterprise plan required'; end if;
  update public.partner_programs
     set name=trim(p_name), enabled=coalesce(p_enabled,enabled)
   where id=p_partner_program_id and business_id=p_business_id;
  if not found then raise exception 'Partner program not found'; end if;
end;
$$;

create or replace function public.business_delete_partner_program(p_business_id uuid,p_partner_program_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  if not exists(select 1 from public.businesses b where b.id=p_business_id and b.business_tier::text='enterprise') then raise exception 'Business Enterprise plan required'; end if;
  delete from public.partner_programs where id=p_partner_program_id and business_id=p_business_id;
  if not found then raise exception 'Partner program not found'; end if;
end;
$$;

revoke execute on function public.business_update_partner_program(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.business_update_partner_program(uuid,uuid,text,boolean) to authenticated;
revoke execute on function public.business_delete_partner_program(uuid,uuid) from public,anon,authenticated;
grant execute on function public.business_delete_partner_program(uuid,uuid) to authenticated;
