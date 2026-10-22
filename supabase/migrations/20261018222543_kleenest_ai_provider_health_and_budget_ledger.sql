create table if not exists kleenest_ai.provider_health (
 provider_model_id text primary key references kleenest_ai.provider_models(id),
 cooldown_until timestamptz,
 consecutive_failures integer not null default 0,
 last_success_at timestamptz,
 last_failure_at timestamptz,
 last_error_code text,
 updated_at timestamptz not null default now()
);
create table if not exists kleenest_ai.ai_budget_reservations (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references kleenest_ai.ai_tasks(id),
 provider_model_id text not null references kleenest_ai.provider_models(id),
 reserved_usd numeric(12,8) not null check(reserved_usd>=0),
 actual_usd numeric(12,8),
 status text not null default 'reserved' check(status in ('reserved','settled','released')),
 created_at timestamptz not null default now(),
 settled_at timestamptz
);
create index if not exists ai_budget_reservations_month_idx on kleenest_ai.ai_budget_reservations(created_at,status);
alter table kleenest_ai.provider_health enable row level security;
alter table kleenest_ai.ai_budget_reservations enable row level security;
revoke all on kleenest_ai.provider_health,kleenest_ai.ai_budget_reservations from public,anon,authenticated;
grant select,insert,update,delete on kleenest_ai.provider_health,kleenest_ai.ai_budget_reservations to service_role;
create or replace function kleenest_ai.budget_status()
returns jsonb language sql security invoker set search_path='' as $$
select jsonb_build_object(
'limit_usd',p.monthly_budget_usd,
'paid_enabled',p.paid_enabled,
'committed_usd',coalesce((select sum(case when r.status='settled' then coalesce(r.actual_usd,r.reserved_usd) else r.reserved_usd end) from kleenest_ai.ai_budget_reservations r where r.status in ('reserved','settled') and r.created_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),0),
'remaining_usd',greatest(0,p.monthly_budget_usd-coalesce((select sum(case when r.status='settled' then coalesce(r.actual_usd,r.reserved_usd) else r.reserved_usd end) from kleenest_ai.ai_budget_reservations r where r.status in ('reserved','settled') and r.created_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),0))
) from kleenest_ai.ai_policy p where p.singleton=true
$$;
revoke all on function kleenest_ai.budget_status() from public,anon,authenticated;
grant execute on function kleenest_ai.budget_status() to service_role;