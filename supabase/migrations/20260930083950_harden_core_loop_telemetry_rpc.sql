-- Harden consumer core-loop telemetry after the runtime permission repair.
-- This migration is already applied in Production as 20260930083950.

alter table public.consumer_core_loop_events enable row level security;

drop policy if exists consumer_core_loop_events_insert_own
  on public.consumer_core_loop_events;

create policy consumer_core_loop_events_insert_own
  on public.consumer_core_loop_events
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.consumer_core_loop_events from anon,authenticated;
grant insert on public.consumer_core_loop_events to authenticated;
grant select,insert,update,delete on public.consumer_core_loop_events to service_role;

create or replace function public.record_consumer_core_loop_event(
  p_event_name text,
  p_location_id uuid default null,
  p_session_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  allowed constant text[] := array[
    'app_open','nearby_results_shown','place_selected','navigation_started',
    'arrival_detected','review_started','review_submit_attempt',
    'review_submit_success','review_submit_failed','review_photo_added',
    'review_done'
  ];
begin
  if uid is null then
    return;
  end if;

  if not (p_event_name = any(allowed)) then
    raise exception 'INVALID_CORE_LOOP_EVENT';
  end if;

  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'INVALID_CORE_LOOP_METADATA';
  end if;

  insert into public.consumer_core_loop_events(
    user_id,event_name,location_id,session_id,metadata
  )
  values(
    uid,
    p_event_name,
    p_location_id,
    nullif(left(coalesce(p_session_id,''),120),''),
    p_metadata
  );
end;
$function$;

revoke all on function public.record_consumer_core_loop_event(text,uuid,text,jsonb) from public;
grant execute on function public.record_consumer_core_loop_event(text,uuid,text,jsonb)
  to anon,authenticated,service_role;
