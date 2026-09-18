select cron.alter_job(17, schedule => '*/5 * * * *');
select cron.alter_job(16, schedule => '15 4 * * *');
select cron.schedule('kleenest-cron-history-retention','17 4 * * *', $$delete from cron.job_run_details where end_time < now() - interval '48 hours'$$);
