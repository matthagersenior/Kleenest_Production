create or replace function public.process_intelligence_action_jobs(p_limit integer default 50)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer := 0; r record; v_business_id uuid; v_action text;
begin
 for r in select j.id,j.location_id,j.surface,j.signal_type from public.intelligence_notification_jobs j where j.status='completed' and not exists(select 1 from public.intelligence_action_links a where a.location_id=j.location_id and a.surface=j.surface and a.signal_type=j.signal_type and a.created_at > now()-interval '2 hours') order by j.created_at asc limit greatest(p_limit,1) loop
   select l.business_id into v_business_id from public.location_claims l where l.location_id=r.location_id and l.status='active' order by l.created_at desc limit 1;
   v_action:=case r.signal_type when 'demand_opportunity' then 'create_promotion' when 'operational_attention' then 'verify_location' when 'high_activity_zone' then 'review_fleet_route' else 'review_intelligence' end;
   insert into public.intelligence_action_links(location_id,business_id,surface,signal_type,action_type,metadata) values(r.location_id,v_business_id,r.surface,r.signal_type,v_action,jsonb_build_object('source_job_id',r.id));
   v_count:=v_count+1;
 end loop;
 return v_count;
end; $$;
select cron.schedule('kleenest-intelligence-action-worker','*/5 * * * *',$$select public.process_intelligence_action_jobs(50);$$) where not exists(select 1 from cron.job where jobname='kleenest-intelligence-action-worker');
