create table if not exists kleenest_ai.mission (
 singleton boolean primary key default true check(singleton),
 mission text not null,
 operating_principles jsonb not null,
 human_approval_required jsonb not null,
 updated_at timestamptz not null default now()
);
insert into kleenest_ai.mission(singleton,mission,operating_principles,human_approval_required) values
(true,'Continuously improve Kleenest accuracy, usability, reliability, accessibility, coverage, security, and cost efficiency using evidence-driven, provider-independent investigations and verified recommendations.',
'["Prefer deterministic evidence over generative inference","Decompose work into bounded, independently verifiable tasks","Route by demonstrated model capabilities and total cost, never brand loyalty","Protect sensitive data and never expose credentials","Escalate only for ambiguity, failures, or high-impact risk","Preserve audit trails, spend ceilings, and reversible changes"]'::jsonb,
'["production data deletion or merging","authentication or permission policy changes","external communications","paid subscription or spending limit changes","production deployments or schema changes proposed by AI"]'::jsonb)
on conflict(singleton) do update set mission=excluded.mission,operating_principles=excluded.operating_principles,human_approval_required=excluded.human_approval_required,updated_at=now();
create table if not exists kleenest_ai.model_capabilities (
 provider_model_id text not null references kleenest_ai.provider_models(id),
 capability text not null references kleenest_ai.task_catalog(capability),
 proficiency numeric(4,3) not null default 0.5 check(proficiency between 0 and 1),
 confidence numeric(4,3) not null default 0 check(confidence between 0 and 1),
 observed_success_rate numeric(4,3) check(observed_success_rate between 0 and 1),
 observed_latency_ms integer check(observed_latency_ms>=0),
 sample_count integer not null default 0 check(sample_count>=0),
 verified_at timestamptz,
 primary key(provider_model_id,capability)
);
create table if not exists kleenest_ai.routing_decisions (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references kleenest_ai.ai_tasks(id),
 selected_model_id text references kleenest_ai.provider_models(id),
 decision text not null,
 reasons jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists routing_decisions_task_idx on kleenest_ai.routing_decisions(task_id,created_at desc);
alter table kleenest_ai.mission enable row level security;
alter table kleenest_ai.model_capabilities enable row level security;
alter table kleenest_ai.routing_decisions enable row level security;
revoke all on kleenest_ai.mission,kleenest_ai.model_capabilities,kleenest_ai.routing_decisions from public,anon,authenticated;
grant select,insert,update,delete on kleenest_ai.mission,kleenest_ai.model_capabilities,kleenest_ai.routing_decisions to service_role;
create or replace function kleenest_ai.rank_models(p_task_id uuid)
returns table(model_id text,provider text,model text,score numeric,estimated_usd numeric,reason text)
language sql security invoker set search_path='' as $$
with t as (select * from kleenest_ai.ai_tasks where id=p_task_id),
cat as (select c.* from kleenest_ai.task_catalog c join t on t.capability=c.capability where c.enabled),
eligible as (
 select m.*,cap.proficiency,cap.confidence,cap.observed_success_rate,cap.observed_latency_ms,cap.sample_count,c.max_input_tokens,c.max_output_tokens,
 (c.max_input_tokens*m.input_usd_per_million+c.max_output_tokens*m.output_usd_per_million)/1000000 as predicted_usd
 from t join cat c on true
 join kleenest_ai.provider_models m on m.enabled and m.model<>'unconfigured' and m.supports_json
 join kleenest_ai.model_capabilities cap on cap.provider_model_id=m.id and cap.capability=t.capability and cap.sample_count>=3 and cap.confidence>=0.5
 left join kleenest_ai.provider_health h on h.provider_model_id=m.id
 where (h.cooldown_until is null or h.cooldown_until<=now())
 and (case t.data_class when 'public' then 0 when 'internal' then 1 when 'restricted' then 2 else 99 end)
 <= (case m.allowed_data_class when 'public' then 0 when 'internal' then 1 when 'restricted' then 2 else -1 end)
 and m.input_usd_per_million is not null and m.output_usd_per_million is not null
)
select e.id,e.provider,e.model,
 round((coalesce(e.observed_success_rate,e.proficiency)*65+e.confidence*15
 -least(e.predicted_usd*1000,15)
 -least(coalesce(e.observed_latency_ms,10000)::numeric/10000,1)*5)::numeric,3),
 round(e.predicted_usd,8),
 'verified_capability_cost_latency_ranking'::text
from eligible e
where e.predicted_usd<= (select (kleenest_ai.budget_status()->>'remaining_usd')::numeric)
order by 4 desc,5 asc,e.priority asc
$$;
revoke all on function kleenest_ai.rank_models(uuid) from public,anon,authenticated;
grant execute on function kleenest_ai.rank_models(uuid) to service_role;