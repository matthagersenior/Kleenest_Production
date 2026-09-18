do $$
declare r record;
begin
  for r in
    select distinct b.id
    from public.businesses b
    join public.business_members m on m.business_id=b.id
    where m.role::text in ('owner','admin')
  loop
    perform public.sync_business_service_entitlement(r.id);
  end loop;
end $$;
