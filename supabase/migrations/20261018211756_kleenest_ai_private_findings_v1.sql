create schema if not exists kleenest_ai;
revoke all on schema kleenest_ai from public, anon, authenticated;
create table if not exists kleenest_ai.findings (
 id bigint generated always as identity primary key,
 fingerprint text not null unique,
 capability text not null,
 severity text not null check (severity in ('info','low','medium','high','critical')),
 title text not null,
 evidence jsonb not null default '{}'::jsonb,
 recommendation text not null,
 status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 occurrence_count integer not null default 1
);
alter table kleenest_ai.findings enable row level security;
revoke all on kleenest_ai.findings from public, anon, authenticated;
create table if not exists kleenest_ai.runs (
 id bigint generated always as identity primary key,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 checks jsonb not null default '{}'::jsonb,
 result text not null default 'running'
);
alter table kleenest_ai.runs enable row level security;
revoke all on kleenest_ai.runs from public, anon, authenticated;
create or replace function kleenest_ai.inspect() returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare dup_count bigint; failed_count bigint; stale_count bigint; outcome jsonb;
begin
 select count(*) into dup_count from public.location_duplicate_cases where status not in ('resolved','dismissed','rejected','merged','not_duplicate');
 select count(*) into failed_count from public.national_ingestion_runs where started_at >= now()-interval '24 hours' and (status ilike '%fail%' or error is not null);
 select count(*) into stale_count from public.national_ingestion_runs where status ilike '%running%' and started_at < now()-interval '3 hours' and finished_at is null;
 outcome:=jsonb_build_object('duplicate_review_cases',dup_count,'failed_ingestion_runs_24h',failed_count,'stale_ingestion_runs',stale_count);
 insert into kleenest_ai.runs(finished_at,checks,result) values(now(),outcome,'completed');
 if dup_count>0 then
 insert into kleenest_ai.findings(fingerprint,capability,severity,title,evidence,recommendation)
 values('duplicate-review-backlog','data_auditor','medium','Review unresolved canonical duplicate candidates',jsonb_build_object('candidate_cases',dup_count,'observed_at',now()),'Review evidence and canonical survivors; do not automatically merge locations.')
 on conflict(fingerprint) do update set last_seen_at=now(), evidence=excluded.evidence, occurrence_count=kleenest_ai.findings.occurrence_count+1;
 end if;
 if failed_count>0 then
 insert into kleenest_ai.findings(fingerprint,capability,severity,title,evidence,recommendation)
 values('ingestion-errors-24h','ingestion_optimizer','high','Investigate ingestion errors in the last 24 hours',jsonb_build_object('runs',failed_count,'observed_at',now()),'Inspect failed source and market runs before changing ingestion scheduling.')
 on conflict(fingerprint) do update set last_seen_at=now(), evidence=excluded.evidence, occurrence_count=kleenest_ai.findings.occurrence_count+1;
 end if;
 if stale_count>0 then
 insert into kleenest_ai.findings(fingerprint,capability,severity,title,evidence,recommendation)
 values('ingestion-stale-running','system_auditor','high','Investigate potentially stalled ingestion runs',jsonb_build_object('runs',stale_count,'observed_at',now()),'Inspect worker leases and logs; do not restart without verifying ownership.')
 on conflict(fingerprint) do update set last_seen_at=now(), evidence=excluded.evidence, occurrence_count=kleenest_ai.findings.occurrence_count+1;
 end if;
 return outcome;
end $fn$;
revoke all on function kleenest_ai.inspect() from public,anon,authenticated;
grant usage on schema kleenest_ai to service_role;
grant select,insert,update on all tables in schema kleenest_ai to service_role;
grant usage,select on all sequences in schema kleenest_ai to service_role;
grant execute on function kleenest_ai.inspect() to service_role;