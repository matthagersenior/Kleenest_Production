select cron.unschedule(jobid) from cron.job where jobname='kleenest-corridor-open-data-ingestion';
select cron.schedule('kleenest-corridor-open-data-ingestion','*/5 * * * *','select public.run_corridor_open_data_scheduler();');
