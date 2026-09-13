
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='admin_resolve_review_photo_report'
    and pg_get_function_identity_arguments(p.oid)='p_report_id uuid, p_status text, p_resolution text, p_notes text'
  limit 1;

  if v_def is not null then
    v_def := replace(
      v_def,
      '/functions/v1/review-photo-storage-moderation',
      '/functions/v1/storage-object-deletion'
    );
    execute v_def;
  end if;
end $$;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='review-photo-storage-moderation' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;

  select jobid into v_job from cron.job where jobname='storage-object-deletion' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
end $$;

select cron.schedule(
  'storage-object-deletion',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/storage-object-deletion',
      body := '{"source":"cron"}'::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
  $cron$
);
