create or replace function public.record_game_result(p_game_code text, p_score integer default 0, p_duration_ms integer default null, p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.progression_games%rowtype;
  v_action jsonb;
  v_event public.progression_metric_events%rowtype;
  v_points integer;
  v_score integer := greatest(coalesce(p_score,0),0);
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_game from public.progression_games where code=p_game_code and enabled=true limit 1;
  if not found then raise exception 'Game is unavailable'; end if;
  v_points := greatest(0, least(coalesce(v_game.reward_points,10), coalesce(v_game.reward_points,10)));
  select public.record_progression_action('game_play', v_game.id) into v_action;
  insert into public.progression_metric_events(user_id,metric,source_type,source_id,quantity,points_awarded,metadata)
  values(v_user,'game_score', 'progression_game',v_game.id,v_score,0,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('game_code',v_game.code,'duration_ms',p_duration_ms,'score',v_score));
  select * into v_event from public.progression_metric_events where user_id=v_user and id=currval(pg_get_serial_sequence('progression_metric_events','id'));
  perform public.evaluate_user_badges(v_user);
  return jsonb_build_object('ok',true,'game_id',v_game.id,'game_code',v_game.code,'score',v_score,'reward_points',coalesce((v_action->>'points_awarded')::integer,v_points),'action',v_action,'event_id',v_event.id);
end;
$$;
revoke all on function public.record_game_result(text,integer,integer,jsonb) from public;
grant execute on function public.record_game_result(text,integer,integer,jsonb) to authenticated;
