-- Keep predictive tile ingestion running rapidly while yielding proportionally to live Discovery.
create or replace function public.acquisition_capacity_status()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_last_discovery timestamptz; v_discovery_5m integer; v_discovery_15m integer;
 v_active integer; v_long_running integer; v_storage_paused boolean; v_storage_reason text;
 v_hydration integer; v_repair integer; v_allow boolean; v_reason text; v_background_percent integer;
begin
 select max(created_at),count(*) filter(where created_at>now()-interval '5 minutes'),count(*) filter(where created_at>now()-interval '15 minutes')
 into v_last_discovery,v_discovery_5m,v_discovery_15m from public.location_discovery_events;
 select count(*) filter(where state='active' and pid<>pg_backend_pid()),count(*) filter(where state='active' and pid<>pg_backend_pid() and query_start<now()-interval '30 seconds')
 into v_active,v_long_running from pg_catalog.pg_stat_activity where datname=current_database();
 select paused,pause_reason into v_storage_paused,v_storage_reason from public.national_ingestion_storage_guard where singleton=true;
 select count(*) into v_hydration from public.place_discovery_hydration_queue;
 select count(*) into v_repair from public.location_ingestion_repair_queue;
 v_background_percent:=case when coalesce(v_discovery_5m,0)=0 then 100 when v_discovery_5m<=2 then 70 when v_discovery_5m<=5 then 45 when v_discovery_5m<=10 then 25 else 10 end;
 if coalesce(v_hydration,0)>=100 then v_background_percent:=least(v_background_percent,10); end if;
 if coalesce(v_active,0)>3 then v_background_percent:=least(v_background_percent,25); end if;
 if coalesce(v_long_running,0)>0 or coalesce(v_storage_paused,false) then v_background_percent:=0; end if;
 v_allow:=v_background_percent>0;
 v_reason:=case when coalesce(v_storage_paused,false) then 'storage_guard' when coalesce(v_long_running,0)>0 then 'long_running_query' when coalesce(v_hydration,0)>=100 then 'discovery_backlog_priority' when coalesce(v_active,0)>3 then 'production_busy_reduced' when coalesce(v_discovery_5m,0)>10 then 'heavy_discovery_reduced' when coalesce(v_discovery_5m,0)>0 then 'active_discovery_weighted' else 'spare_capacity' end;
 return jsonb_build_object('allow_background_ingestion',v_allow,'background_percent',v_background_percent,'reason',v_reason,'checked_at',now(),'last_discovery_at',v_last_discovery,'discovery_events_5m',coalesce(v_discovery_5m,0),'discovery_events_15m',coalesce(v_discovery_15m,0),'active_queries',coalesce(v_active,0),'long_running_queries',coalesce(v_long_running,0),'hydration_queue',coalesce(v_hydration,0),'repair_queue',coalesce(v_repair,0),'storage_paused',coalesce(v_storage_paused,false),'storage_reason',v_storage_reason);
end $$;
select cron.unschedule(jobid) from cron.job where jobname='kleenest-corridor-open-data-ingestion';
select cron.schedule('kleenest-corridor-open-data-ingestion','*/2 * * * *','select public.run_corridor_open_data_scheduler();');
