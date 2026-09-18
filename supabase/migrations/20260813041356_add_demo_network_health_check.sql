create or replace function public.demo_network_health()
returns jsonb language sql security definer set search_path=public as $$
select jsonb_build_object(
 'businesses',(select count(*) from public.businesses),
 'locations',(select count(*) from public.locations),
 'programs',(select count(*) from public.partner_programs where is_demo_test=true and enabled=true and preferred_access=true),
 'active_agreements',(select count(*) from public.partner_agreements where is_demo_test=true and status='active'),
 'scoped_locations',(select count(*) from public.partner_program_locations where status='active' and benefit_type='preferred_location'),
 'ready',((select count(*) from public.businesses)>=2 and (select count(*) from public.locations)>=2 and (select count(*) from public.partner_programs where is_demo_test=true and enabled=true and preferred_access=true)>=1 and (select count(*) from public.partner_agreements where is_demo_test=true and status='active')>=1 and (select count(*) from public.partner_program_locations where status='active' and benefit_type='preferred_location')>=2)
);$$;
revoke execute on function public.demo_network_health() from public,anon,authenticated;
