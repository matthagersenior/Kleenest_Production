create or replace function public.converge_fleet_operational_event_to_intelligence()
returns trigger language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare v_subject uuid;
begin
 v_subject:=coalesce(new.vehicle_id,new.route_id,new.driver_id,new.business_id);
 insert into public.data_feature_events(subject_type,subject_id,actor_user_id,business_id,location_id,fleet_vehicle_id,event_type,feature_code,source_table,source_id,value_numeric,metadata,occurred_at,event_validity,confidence,deduplication_key,rate_limit_context)
 values(case when new.vehicle_id is not null then 'fleet_vehicle' else 'business' end,v_subject,auth.uid(),new.business_id,null,new.vehicle_id,new.event_type,'fleet.operational.'||new.event_type,'fleet_operational_events',new.id,new.event_value,coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('vehicle_id',new.vehicle_id,'driver_id',new.driver_id,'route_id',new.route_id,'latitude',new.latitude,'longitude',new.longitude,'unit',new.unit),coalesce(new.occurred_at,now()),'valid',1,'fleet-operational:'||new.id::text,jsonb_build_object('source','fleet_operational_events')) on conflict(deduplication_key) do nothing;
 return new;
end; $$;
drop trigger if exists fleet_operational_event_intelligence_convergence on public.fleet_operational_events;
create trigger fleet_operational_event_intelligence_convergence after insert on public.fleet_operational_events for each row execute function public.converge_fleet_operational_event_to_intelligence();
