create or replace function public.quest_advance_activity(p_user_id uuid,p_activity_type text,p_source_id uuid,p_location_id uuid default null,p_checkin_id uuid default null,p_qr_code_id uuid default null,p_metadata jsonb default '{}'::jsonb) returns integer language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
declare s record; v public.quest_participation; n integer:=0; v_user uuid:=coalesce(p_user_id,auth.uid()); v_event text:=lower(trim(coalesce(p_activity_type,'')));
begin
 if v_user is null then return 0; end if;
 if v_event not in ('checkin','review','evidence','game') then return 0; end if;
 for s in
   select qs.*,q.id quest_id
   from public.quest_steps qs join public.quests q on q.id=qs.quest_id
   join public.quest_participation qp on qp.quest_id=q.id and qp.user_id=v_user and qp.status='started'
   where q.status='active'
     and qs.step_order=qp.current_step_order
     and (
       (v_event='checkin' and qs.step_type in ('checkin','visit','scan','arrive')) or
       (v_event='review' and qs.step_type in ('review','rate','evidence')) or
       (v_event='evidence' and qs.step_type in ('evidence','photo')) or
       (v_event='game' and qs.step_type='challenge')
     )
     and (qs.location_id is null or qs.location_id=p_location_id)
     and not exists(select 1 from public.quest_step_events e where e.participation_id=qp.id and e.quest_step_id=qs.id and ((p_checkin_id is not null and e.checkin_id=p_checkin_id) or (p_source_id is not null and e.metadata->>'source_id'=p_source_id::text)))
   order by q.id,qs.step_order
 loop
   select * into v from public.quest_participation where id=s.id for update;
   if v.status='started' and v.current_step_order=s.step_order then
     perform public.quest_record_step(v.id,s.id,v_event,'automatic',coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('source_id',p_source_id,'activity_type',v_event),p_location_id,null,p_qr_code_id,p_checkin_id);
     n:=n+1;
   end if;
 end loop;
 return n;
end;$function$;

create or replace function public.trg_quest_checkin_activity() returns trigger language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
begin perform public.quest_advance_activity(new.user_id,'checkin',new.id,new.location_id,new.id,new.qr_code_id,jsonb_build_object('verification_method',new.verification_method)); return new; end;$function$;

create or replace function public.trg_quest_review_activity() returns trigger language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
begin perform public.quest_advance_activity(new.user_id,'review',new.id,new.location_id,new.check_in_id,null,jsonb_build_object('stars',new.stars)); return new; end;$function$;

create or replace function public.trg_quest_progression_game_activity() returns trigger language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
begin perform public.quest_advance_activity(new.user_id,'game',new.source_id,null,null,null,new.metadata||jsonb_build_object('metric',new.metric)); return new; end;$function$;

drop trigger if exists quest_checkin_activity on public.check_ins;
create trigger quest_checkin_activity after insert on public.check_ins for each row execute function public.trg_quest_checkin_activity();

drop trigger if exists quest_review_activity on public.reviews;
create trigger quest_review_activity after insert on public.reviews for each row execute function public.trg_quest_review_activity();

drop trigger if exists quest_game_activity on public.progression_metric_events;
create trigger quest_game_activity after insert on public.progression_metric_events for each row when (new.source_type='game') execute function public.trg_quest_progression_game_activity();

create or replace function public.quest_record_step(p_participation_id uuid,p_quest_step_id uuid,p_event_type text,p_source text default null,p_metadata jsonb default '{}'::jsonb,p_location_id uuid default null,p_geofence_event_id uuid default null,p_qr_code_id uuid default null,p_checkin_id uuid default null) returns public.quest_participation language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
declare v public.quest_participation; s public.quest_steps; total_steps integer; begin
 select * into v from public.quest_participation where id=p_participation_id and user_id=auth.uid() for update;
 if not found then raise exception 'Quest participation not found'; end if;
 select * into s from public.quest_steps where id=p_quest_step_id and quest_id=v.quest_id; if not found then raise exception 'Quest step not found'; end if;
 if v.status<>'started' then return v; end if;
 if s.step_order<>v.current_step_order then return v; end if;
 if exists(select 1 from public.quest_step_events e where e.participation_id=v.id and e.quest_step_id=s.id and ((p_checkin_id is not null and e.checkin_id=p_checkin_id) or (p_qr_code_id is not null and e.qr_code_id=p_qr_code_id) or (p_geofence_event_id is not null and e.geofence_event_id=p_geofence_event_id) or (p_source is not null and e.source=p_source and e.event_type=p_event_type and e.created_at>now()-interval '1 minute'))) then return v; end if;
 insert into public.quest_step_events(participation_id,quest_step_id,user_id,event_type,source,location_id,geofence_event_id,qr_code_id,checkin_id,metadata) values(v.id,s.id,auth.uid(),p_event_type,p_source,p_location_id,p_geofence_event_id,p_qr_code_id,p_checkin_id,coalesce(p_metadata,'{}'::jsonb));
 select count(*) into total_steps from public.quest_steps where quest_id=v.quest_id;
 update public.quest_participation set current_step_order=s.step_order+1,xp_earned=xp_earned+coalesce(s.xp_reward,0),progress=least(1.0,s.step_order::numeric/greatest(total_steps,1)),status=case when s.step_order=(select max(step_order) from public.quest_steps where quest_id=v.quest_id) then 'completed' else 'started' end,completed_at=case when s.step_order=(select max(step_order) from public.quest_steps where quest_id=v.quest_id) then now() else completed_at end,updated_at=now() where id=v.id returning * into v; return v;
end;$function$;

revoke all on function public.quest_advance_activity(uuid,text,uuid,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.quest_advance_activity(uuid,text,uuid,uuid,uuid,uuid,jsonb) to authenticated;
revoke all on function public.trg_quest_checkin_activity() from public,anon,authenticated;
revoke all on function public.trg_quest_review_activity() from public,anon,authenticated;
revoke all on function public.trg_quest_progression_game_activity() from public,anon,authenticated;
revoke execute on function public.quest_record_step(uuid,uuid,text,text,jsonb,uuid,uuid,uuid,uuid) from anon;
grant execute on function public.quest_record_step(uuid,uuid,text,text,jsonb,uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.quest_start(p_quest_id uuid) returns public.quest_participation language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
declare v public.quest_participation; begin if auth.uid() is null then raise exception 'Authentication required'; end if; if not exists(select 1 from public.quests where id=p_quest_id and status='active' and (start_at is null or start_at<=now()) and (end_at is null or end_at>=now())) then raise exception 'Quest is not currently available'; end if; insert into public.quest_participation(quest_id,user_id) values(p_quest_id,auth.uid()) on conflict(quest_id,user_id) do update set updated_at=now() returning * into v; return v; end;$function$;
