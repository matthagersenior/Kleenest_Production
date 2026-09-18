create or replace function public.bridge_fleet_stop_progression_v2()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_cfg public.progression_xp_actions%rowtype; v_location uuid; v_xp integer;
begin
 if new.metric<>'fleet_stop_complete' or new.user_id is null then return new; end if;
 select * into v_cfg from public.progression_xp_actions where action='fleet_stop_complete' and enabled;
 if not found then return new; end if;
 v_location:=nullif(new.metadata->>'location_id','')::uuid;
 v_xp:=v_cfg.base_xp;
 insert into public.progression_events_v2(user_id,action,location_id,subject,evidence_tier,base_xp,multiplier,xp_awarded,idempotency_key)
 values(new.user_id,'fleet_stop_complete',v_location,coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('source_type',new.source_type,'source_id',new.source_id),1,v_cfg.base_xp,1,v_xp,'legacy-fleet-stop:'||new.source_id::text)
 on conflict(user_id,idempotency_key) do nothing;
 return new;
end $$;
drop trigger if exists progression_metric_fleet_v2_bridge on public.progression_metric_events;
create trigger progression_metric_fleet_v2_bridge after insert on public.progression_metric_events for each row execute function public.bridge_fleet_stop_progression_v2();
