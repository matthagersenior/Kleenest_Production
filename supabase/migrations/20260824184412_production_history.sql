create or replace function public.publish_live_network_event(p_event_type text, p_location_id uuid default null, p_actor_type text default 'user', p_actor_id uuid default null, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_user uuid := auth.uid();
  v_actor_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_event_type),'') is null then raise exception 'event_type is required'; end if;
  if p_actor_type not in ('user','business','fleet','enterprise','system') then raise exception 'Invalid actor type'; end if;
  v_actor_id := v_user;
  insert into public.live_network_events(event_type,location_id,actor_type,actor_id,payload)
  values(trim(p_event_type),p_location_id,p_actor_type,v_actor_id,coalesce(p_payload,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.publish_live_network_event(text,uuid,text,uuid,jsonb) from public;
grant execute on function public.publish_live_network_event(text,uuid,text,uuid,jsonb) to authenticated;
