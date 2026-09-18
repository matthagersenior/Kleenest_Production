create or replace function public.evaluate_fleet_push_delivery_exception()
returns trigger language plpgsql security definer set search_path='public','auth','extensions','pg_temp' as $$
declare n public.notifications; b uuid; is_fleet boolean:=false;
begin
 if new.channel<>'push' or new.status<>'failed' or (tg_op='UPDATE' and old.status='failed') then return new; end if;
 select * into n from public.notifications where id=new.notification_id;
 if not found then return new; end if;
 is_fleet:=coalesce(n.data->>'surface','')='fleet' or coalesce(n.type,'') like 'fleet_%' or coalesce(n.data->>'business_id','')<>'';
 if not is_fleet or coalesce((n.data->>'exception_alert')::boolean,false) then return new; end if;
 begin b:=(n.data->>'business_id')::uuid; exception when others then return new; end;
 if b is not null then perform public.materialize_fleet_exception_alert(b,null,'push_delivery_failure','Fleet push delivery failed',coalesce(new.error,'A Fleet push notification failed to deliver.'),'warning','notification_delivery',new.id); end if;
 return new;
end $$;
revoke all on function public.evaluate_fleet_operational_exception() from public,anon,authenticated;
revoke all on function public.evaluate_fleet_geofence_exception() from public,anon,authenticated;
revoke all on function public.evaluate_fleet_push_delivery_exception() from public,anon,authenticated;
revoke all on function public.materialize_fleet_exception_alert(uuid,uuid,text,text,text,text,text,uuid) from public,anon,authenticated;
