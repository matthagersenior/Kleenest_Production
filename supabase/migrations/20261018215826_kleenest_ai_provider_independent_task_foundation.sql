create table if not exists kleenest_ai.provider_models (
  id text primary key,
  provider text not null,
  model text not null,
  enabled boolean not null default false,
  supports_json boolean not null default true,
  allowed_data_class text not null default 'public',
  input_usd_per_million numeric(12,6),
  output_usd_per_million numeric(12,6),
  priority integer not null default 100,
  updated_at timestamptz not null default now(),
  constraint provider_models_data_class_check check (allowed_data_class in ('public','internal','restricted')),
  constraint provider_models_prices_check check ((input_usd_per_million is null or input_usd_per_million >= 0) and (output_usd_per_million is null or output_usd_per_million >= 0))
);
create table if not exists kleenest_ai.ai_tasks (
 id uuid primary key default gen_random_uuid(),
 capability text not null,
 input_fingerprint text not null,
 evidence jsonb not null default '{}'::jsonb,
 data_class text not null default 'internal',
 status text not null default 'queued',
 priority integer not null default 100,
 attempt_count integer not null default 0,
 not_before timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 result jsonb,
 error_code text,
 constraint ai_tasks_status_check check (status in ('queued','running','completed','deferred','failed','review')),
 constraint ai_tasks_data_class_check check (data_class in ('public','internal','restricted')),
 unique (capability,input_fingerprint)
);
create table if not exists kleenest_ai.ai_attempts (
 id bigint generated always as identity primary key,
 task_id uuid not null references kleenest_ai.ai_tasks(id),
 provider_model_id text references kleenest_ai.provider_models(id),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 outcome text not null default 'started',
 input_tokens integer,
 output_tokens integer,
 estimated_cost_usd numeric(12,8),
 error_code text
);
create table if not exists kleenest_ai.ai_policy (
 singleton boolean primary key default true check (singleton),
 paid_enabled boolean not null default false,
 monthly_budget_usd numeric(10,2) not null default 0 check (monthly_budget_usd >= 0),
 max_attempts_per_task integer not null default 3 check (max_attempts_per_task between 1 and 10),
 updated_at timestamptz not null default now()
);
insert into kleenest_ai.ai_policy(singleton) values(true) on conflict do nothing;
create index if not exists ai_tasks_dispatch_idx on kleenest_ai.ai_tasks(status,not_before,priority);
create index if not exists ai_attempts_date_idx on kleenest_ai.ai_attempts(started_at);
alter table kleenest_ai.provider_models enable row level security;
alter table kleenest_ai.ai_tasks enable row level security;
alter table kleenest_ai.ai_attempts enable row level security;
alter table kleenest_ai.ai_policy enable row level security;
revoke all on all tables in schema kleenest_ai from public,anon,authenticated;
grant usage on schema kleenest_ai to service_role;
grant select,insert,update,delete on kleenest_ai.provider_models,kleenest_ai.ai_tasks,kleenest_ai.ai_attempts,kleenest_ai.ai_policy to service_role;
grant usage,select on sequence kleenest_ai.ai_attempts_id_seq to service_role;