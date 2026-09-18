alter table public.businesses add column if not exists is_demo_test boolean not null default false;
alter table public.profiles add column if not exists is_demo_test boolean not null default false;
alter table public.partner_programs add column if not exists is_demo_test boolean not null default false;
alter table public.partner_agreements add column if not exists is_demo_test boolean not null default false;

create or replace function public.demo_list_test_businesses()
returns table(id uuid,name text,is_demo_test boolean)
language sql security definer set search_path=public as $$
 select b.id,b.name,b.is_demo_test from public.businesses b where b.is_demo_test=true order by b.name;
$$;

grant execute on function public.demo_list_test_businesses() to authenticated;
