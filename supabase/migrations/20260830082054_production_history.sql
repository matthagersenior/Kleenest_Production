alter table public.subscriptions
  add column if not exists plan_code text;

update public.subscriptions s
set plan_code = pc.code
from public.subscription_plans sp
join public.pricing_catalog pc on pc.code = sp.code
where s.plan_code is null
  and s.plan_id = sp.id;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.subscriptions'::regclass
      and conname = 'subscriptions_plan_code_pricing_catalog_fkey'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_plan_code_pricing_catalog_fkey
      foreign key (plan_code)
      references public.pricing_catalog(code)
      on update cascade;
  end if;
end $$;

create index if not exists subscriptions_user_plan_code_status_idx
  on public.subscriptions(user_id, plan_code, status)
  where user_id is not null and plan_code is not null;
