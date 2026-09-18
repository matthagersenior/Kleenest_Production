create index if not exists subscriptions_plan_code_idx
  on public.subscriptions(plan_code)
  where plan_code is not null;
