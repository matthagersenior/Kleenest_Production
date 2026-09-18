select cron.alter_job(20, schedule => '17 * * * *', command => $$delete from cron.job_run_details where end_time < now() - interval '24 hours'$$);
