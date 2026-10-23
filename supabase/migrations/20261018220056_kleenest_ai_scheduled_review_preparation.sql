create or replace function kleenest_ai.prepare_review_tasks(p_limit integer default 30)
returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer := 0;
begin
  with candidates as (
    select f.fingerprint, f.capability, f.title, f.severity, f.recommendation, f.evidence, f.last_seen_at
    from kleenest_ai.findings f
    where f.status in ('open','reviewing')
      and f.last_seen_at >= now() - interval '14 days'
      and not exists (
        select 1 from kleenest_ai.ai_tasks t
        where t.capability='finding_review' and t.input_fingerprint=f.fingerprint
      )
    order by case f.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, f.last_seen_at desc
    limit least(greatest(p_limit,0),100)
  ), ins as (
    insert into kleenest_ai.ai_tasks(capability,input_fingerprint,evidence,data_class,status,priority)
    select 'finding_review', c.fingerprint,
       jsonb_build_object('finding_capability',c.capability,'title',c.title,'severity',c.severity,'recommendation',c.recommendation,'evidence',c.evidence,'last_seen_at',c.last_seen_at),
       'internal','queued',
       case c.severity when 'critical' then 10 when 'high' then 20 when 'medium' then 40 else 80 end
    from candidates c
    on conflict(capability,input_fingerprint) do nothing
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;
revoke all on function kleenest_ai.prepare_review_tasks(integer) from public,anon,authenticated;
grant execute on function kleenest_ai.prepare_review_tasks(integer) to service_role;
create or replace function kleenest_ai.housekeep_tasks()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare reset_count integer;expired_count integer;
begin
  update kleenest_ai.ai_tasks t set status='deferred',not_before=now()+interval '30 minutes',updated_at=now(),error_code='stale_lease'
  where t.status='running' and t.updated_at < now()-interval '30 minutes';
  get diagnostics reset_count = row_count;
  update kleenest_ai.ai_tasks t set status='review',updated_at=now(),error_code='max_attempts'
  where t.status in ('queued','deferred') and t.attempt_count >= (select max_attempts_per_task from kleenest_ai.ai_policy where singleton=true);
  get diagnostics expired_count = row_count;
  return jsonb_build_object('deferred_stale',reset_count,'review_max_attempts',expired_count);
end $$;
revoke all on function kleenest_ai.housekeep_tasks() from public,anon,authenticated;
grant execute on function kleenest_ai.housekeep_tasks() to service_role;
select cron.schedule('kleenest-ai-review-preparation-v1','27 * * * *','select kleenest_ai.prepare_review_tasks(30);');
select cron.schedule('kleenest-ai-task-housekeeping-v1','*/15 * * * *','select kleenest_ai.housekeep_tasks();');