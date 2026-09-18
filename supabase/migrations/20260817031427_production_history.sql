create unique index if not exists progression_metric_events_idempotency_idx on public.progression_metric_events(user_id,metric,(metadata->>'idempotency_key')) where metadata ? 'idempotency_key';
create or replace function public.record_progression_metric_event(p_metric text, p_source_type text, p_source_id uuid default null, p_quantity numeric default 1, p_points_awarded integer default null, p_metadata jsonb default '{}'::jsonb)
returns public.progression_metric_events
language plpgsql security definer set search_path=public
as $$
declare v_row public.progression_metric_events; v_action_points integer; v_enabled boolean; v_points integer:=0; v_key text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 v_key:=nullif(trim(coalesce(p_metadata->>'idempotency_key','')),'');
 if v_key is not null then
   select * into v_row from public.progression_metric_events where user_id=auth.uid() and metric=trim(p_metric) and metadata->>'idempotency_key'=v_key limit 1;
   if found then return v_row; end if;
 end if;
 select points,enabled into v_action_points,v_enabled from public.progression_actions where code=trim(p_metric) limit 1;
 if coalesce(v_enabled,false) then
   v_points:=greatest(coalesce(v_action_points,0)*least(greatest(coalesce(p_quantity,0),0),100)::integer,0);
   if p_source_id is not null then perform public.record_gamification_activity(trim(p_metric),p_source_id); end if;
 else v_points:=0; end if;
 begin
   insert into public.progression_metric_events(user_id,metric,source_type,source_id,quantity,points_awarded,metadata)
   values(auth.uid(),trim(p_metric),p_source_type,p_source_id,least(greatest(coalesce(p_quantity,0),0),100),v_points,coalesce(p_metadata,'{}'::jsonb)) returning * into v_row;
 exception when unique_violation then
   if v_key is not null then select * into v_row from public.progression_metric_events where user_id=auth.uid() and metric=trim(p_metric) and metadata->>'idempotency_key'=v_key limit 1; if found then return v_row; end if; end if;
   raise;
 end;
 return v_row;
end $$;
revoke execute on function public.record_progression_metric_event(text,text,uuid,numeric,integer,jsonb) from anon;
grant execute on function public.record_progression_metric_event(text,text,uuid,numeric,integer,jsonb) to authenticated,service_role;
