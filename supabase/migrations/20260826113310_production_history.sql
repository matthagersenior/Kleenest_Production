-- Harden the canonical Trust Quest step boundary. The existing RPC is authoritative;
-- this migration makes event identity deterministic at the database boundary and
-- prevents duplicate step events from ever becoming duplicate progression.
create unique index if not exists quest_step_events_checkin_once_idx
  on public.quest_step_events(participation_id, quest_step_id, checkin_id)
  where checkin_id is not null;

create unique index if not exists quest_step_events_qr_once_idx
  on public.quest_step_events(participation_id, quest_step_id, qr_code_id)
  where qr_code_id is not null;

create unique index if not exists quest_step_events_geofence_once_idx
  on public.quest_step_events(participation_id, quest_step_id, geofence_event_id)
  where geofence_event_id is not null;

-- Preserve the existing one-minute fallback for non-ID event sources, but make
-- concurrent calls safe by locking the participation row before duplicate checks.
create or replace function public.quest_record_step(
  p_participation_id uuid,
  p_quest_step_id uuid,
  p_event_type text,
  p_source text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_location_id uuid default null,
  p_geofence_event_id uuid default null,
  p_qr_code_id uuid default null,
  p_checkin_id uuid default null
) returns public.quest_participation
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v public.quest_participation;
  s public.quest_steps;
  total_steps integer;
begin
  select * into v
    from public.quest_participation
   where id=p_participation_id and user_id=auth.uid()
   for update;
  if not found then raise exception 'Quest participation not found'; end if;

  select * into s
    from public.quest_steps
   where id=p_quest_step_id and quest_id=v.quest_id;
  if not found then raise exception 'Quest step not found'; end if;

  if v.status<>'started' then return v; end if;
  if s.step_order<>v.current_step_order then return v; end if;

  if exists(
    select 1 from public.quest_step_events e
     where e.participation_id=v.id and e.quest_step_id=s.id
       and (
         (p_checkin_id is not null and e.checkin_id=p_checkin_id) or
         (p_qr_code_id is not null and e.qr_code_id=p_qr_code_id) or
         (p_geofence_event_id is not null and e.geofence_event_id=p_geofence_event_id) or
         (p_source is not null and e.source=p_source and e.event_type=p_event_type
          and e.created_at>now()-interval '1 minute')
       )
  ) then return v; end if;

  insert into public.quest_step_events(
    participation_id,quest_step_id,user_id,event_type,source,location_id,
    geofence_event_id,qr_code_id,checkin_id,metadata
  ) values (
    v.id,s.id,auth.uid(),p_event_type,p_source,p_location_id,
    p_geofence_event_id,p_qr_code_id,p_checkin_id,coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict do nothing;

  -- If another authoritative event won the race, do not award the step twice.
  if not found then
    return v;
  end if;

  select count(*) into total_steps
    from public.quest_steps where quest_id=v.quest_id;

  update public.quest_participation
     set current_step_order=s.step_order+1,
         xp_earned=xp_earned+coalesce(s.xp_reward,0),
         progress=least(1.0,s.step_order::numeric/greatest(total_steps,1)),
         status=case when s.step_order=(select max(step_order) from public.quest_steps where quest_id=v.quest_id)
                      then 'completed' else 'started' end,
         completed_at=case when s.step_order=(select max(step_order) from public.quest_steps where quest_id=v.quest_id)
                           then now() else completed_at end,
         updated_at=now()
   where id=v.id
  returning * into v;

  return v;
end;
$$;

revoke execute on function public.quest_record_step(uuid,uuid,text,text,jsonb,uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.quest_record_step(uuid,uuid,text,text,jsonb,uuid,uuid,uuid,uuid) to authenticated;
