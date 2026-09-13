-- Repair Game Center score persistence and expose personal records for replay goals.
-- progression_metric_events only accepts source_type='game'; the older game RPC wrote
-- 'progression_game', which caused the Save score check-constraint failure.

create or replace function public.record_game_result(
  p_game_code text,
  p_score integer default 0,
  p_duration_ms integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_user uuid:=auth.uid();
 v_game public.progression_games%rowtype;
 v_action jsonb;
 v_event_id uuid;
 v_points integer;
 v_max_score integer;
 v_raw_score integer:=greatest(coalesce(p_score,0),0);
 v_score integer;
 v_previous_best integer:=0;
 v_plays_before integer:=0;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select * into v_game from public.progression_games where code=p_game_code and enabled=true limit 1;
 if not found then raise exception 'Game is unavailable'; end if;

 v_max_score:=greatest(coalesce((v_game.rules->>'max_score')::integer,1000000),0);
 v_score:=least(v_raw_score,v_max_score);
 v_points:=greatest(coalesce(v_game.reward_points,10),0);

 select coalesce(max(e.quantity),0)::integer,count(*)::integer
 into v_previous_best,v_plays_before
 from public.progression_metric_events e
 where e.user_id=v_user
   and e.metric='game_score'
   and e.source_type='game'
   and e.source_id=v_game.id;

 select public.record_progression_action('game_play',v_game.id) into v_action;

 insert into public.progression_metric_events(
   user_id,metric,source_type,source_id,quantity,points_awarded,metadata
 )
 values(
   v_user,'game_score','game',v_game.id,v_score,0,
   coalesce(p_metadata,'{}'::jsonb)
   ||jsonb_build_object(
     'game_code',v_game.code,
     'duration_ms',p_duration_ms,
     'score',v_score,
     'submitted_score',v_raw_score,
     'max_score',v_max_score,
     'normalized',v_raw_score<>v_score,
     'previous_best',v_previous_best,
     'personal_best',v_score>v_previous_best
   )
 )
 returning id into v_event_id;

 perform public.evaluate_user_badges(v_user);

 return jsonb_build_object(
   'ok',true,
   'game_id',v_game.id,
   'game_code',v_game.code,
   'score',v_score,
   'submitted_score',v_raw_score,
   'max_score',v_max_score,
   'normalized',v_raw_score<>v_score,
   'reward_points',coalesce((v_action->>'points_awarded')::integer,v_points),
   'action',v_action,
   'event_id',v_event_id,
   'previous_best',v_previous_best,
   'personal_best',v_score>v_previous_best,
   'plays',v_plays_before+1
 );
end;
$$;

create or replace function public.get_game_personal_record(p_game_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with game as (
    select g.id,g.code,g.name,
           greatest(coalesce((g.rules->>'max_score')::integer,0),0) as max_score
    from public.progression_games g
    where g.code=p_game_code and g.enabled=true
    limit 1
  ),
  stats as (
    select count(e.id)::integer as plays,
           coalesce(max(e.quantity),0)::integer as best_score,
           coalesce(round(avg(e.quantity)),0)::integer as average_score,
           coalesce(max(e.created_at),null) as last_played_at
    from game g
    left join public.progression_metric_events e
      on e.user_id=auth.uid()
     and e.metric='game_score'
     and e.source_type='game'
     and e.source_id=g.id
  )
  select jsonb_build_object(
    'game_code',g.code,
    'game_name',g.name,
    'max_score',g.max_score,
    'plays',s.plays,
    'best_score',s.best_score,
    'average_score',s.average_score,
    'last_played_at',s.last_played_at,
    'mastery_percent',case when g.max_score>0 then round((s.best_score::numeric/g.max_score::numeric)*100,1) else 0 end
  )
  from game g cross join stats s
$$;

revoke all on function public.record_game_result(text,integer,integer,jsonb) from public,anon;
grant execute on function public.record_game_result(text,integer,integer,jsonb) to authenticated,service_role;
revoke all on function public.get_game_personal_record(text) from public,anon;
grant execute on function public.get_game_personal_record(text) to authenticated,service_role;


-- Converge the canonical game catalog to the replayable arena_v3 lengths and
-- score ceilings. These ceilings include room for speed, combo, survival and
-- strategy bonuses; they are intentionally higher than the original flat quiz scores.
update public.progression_games
set rules = coalesce(rules,'{}'::jsonb) || patch.rules
from (values
 ('clean_sweep',        '{"rounds":12,"max_score":250,"score_model":"arena_v3","lives":3}'::jsonb),
 ('bathroom_memory',    '{"pairs":8,"rounds":8,"max_score":250,"score_model":"arena_v3"}'::jsonb),
 ('trust_or_bust',      '{"questions":10,"rounds":10,"max_score":300,"score_model":"arena_v3"}'::jsonb),
 ('flush_the_facts',    '{"questions":12,"rounds":12,"max_score":350,"score_model":"arena_v3","time_limit_sec":7}'::jsonb),
 ('restroom_relay',     '{"rounds":8,"max_score":225,"score_model":"arena_v3"}'::jsonb),
 ('stall_strategy',     '{"turns":6,"rounds":6,"max_score":300,"score_model":"arena_v3","strategy_budget":20}'::jsonb),
 ('sink_sprint',        '{"rounds":12,"max_score":325,"score_model":"arena_v3","time_limit_sec":5}'::jsonb),
 ('route_to_relief',    '{"rounds":8,"max_score":300,"score_model":"arena_v3"}'::jsonb),
 ('review_rater',       '{"rounds":8,"max_score":250,"score_model":"arena_v3"}'::jsonb),
 ('evidence_detective', '{"rounds":8,"max_score":350,"score_model":"arena_v3","lives":3}'::jsonb),
 ('amenity_architect',  '{"rounds":8,"max_score":300,"score_model":"arena_v3"}'::jsonb),
 ('cleanliness_clash',  '{"rounds":8,"max_score":350,"score_model":"arena_v3","multiplayer":true}'::jsonb)
) as patch(code,rules)
where public.progression_games.code=patch.code;
