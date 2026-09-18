update public.progression_games
set rules = coalesce(rules,'{}'::jsonb) || case code
  when 'clean_sweep' then jsonb_build_object('score_model','mode_v2','max_score',120)
  when 'bathroom_memory' then jsonb_build_object('score_model','mode_v2','max_score',108)
  when 'trust_or_bust' then jsonb_build_object('score_model','mode_v2','max_score',120)
  when 'flush_the_facts' then jsonb_build_object('score_model','mode_v2','max_score',200,'time_limit_sec',7)
  when 'restroom_relay' then jsonb_build_object('score_model','mode_v2','max_score',128)
  when 'stall_strategy' then jsonb_build_object('score_model','mode_v2','max_score',250,'strategy_budget',20)
  when 'sink_sprint' then jsonb_build_object('score_model','mode_v2','max_score',216,'time_limit_sec',5)
  when 'route_to_relief' then jsonb_build_object('score_model','mode_v2','max_score',132)
  when 'review_rater' then jsonb_build_object('score_model','mode_v2','max_score',160)
  when 'evidence_detective' then jsonb_build_object('score_model','mode_v2','max_score',192)
  when 'amenity_architect' then jsonb_build_object('score_model','mode_v2','max_score',132)
  when 'cleanliness_clash' then jsonb_build_object('score_model','mode_v2','max_score',200)
  else '{}'::jsonb end
where code in ('clean_sweep','bathroom_memory','trust_or_bust','flush_the_facts','restroom_relay','stall_strategy','sink_sprint','route_to_relief','review_rater','evidence_detective','amenity_architect','cleanliness_clash');

create or replace function public.record_game_result(p_game_code text,p_score integer default 0,p_duration_ms integer default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
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
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select * into v_game from public.progression_games where code=p_game_code and enabled=true limit 1;
 if not found then raise exception 'Game is unavailable'; end if;
 v_max_score:=greatest(coalesce((v_game.rules->>'max_score')::integer,1000000),0);
 v_score:=least(v_raw_score,v_max_score);
 v_points:=greatest(coalesce(v_game.reward_points,10),0);
 select public.record_progression_action('game_play',v_game.id) into v_action;
 insert into public.progression_metric_events(user_id,metric,source_type,source_id,quantity,points_awarded,metadata)
 values(v_user,'game_score','progression_game',v_game.id,v_score,0,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('game_code',v_game.code,'duration_ms',p_duration_ms,'score',v_score,'submitted_score',v_raw_score,'max_score',v_max_score,'normalized',v_raw_score<>v_score)) returning id into v_event_id;
 perform public.evaluate_user_badges(v_user);
 return jsonb_build_object('ok',true,'game_id',v_game.id,'game_code',v_game.code,'score',v_score,'submitted_score',v_raw_score,'max_score',v_max_score,'normalized',v_raw_score<>v_score,'reward_points',coalesce((v_action->>'points_awarded')::integer,v_points),'action',v_action,'event_id',v_event_id);
end;
$$;

create or replace function public.record_game_challenge_score(p_challenge_id uuid,p_score integer,p_metadata jsonb default '{}'::jsonb)
returns public.game_challenges
language plpgsql security definer set search_path = ''
as $$
declare
 actor uuid:=auth.uid();
 row public.game_challenges;
 safe_score integer;
 raw_score integer:=greatest(coalesce(p_score,0),0);
 max_score integer:=1000000;
 actor_name text;
 opponent_id uuid;
 game_name text;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 select * into row from public.game_challenges where id=p_challenge_id for update;
 if not found then raise exception 'Challenge not found'; end if;
 if actor<>row.creator_id and actor<>row.invitee_id then raise exception 'You are not a participant in this challenge'; end if;
 if row.status<>'accepted' then raise exception 'Challenge must be accepted before scoring'; end if;
 select greatest(coalesce((g.rules->>'max_score')::integer,1000000),0),g.name into max_score,game_name from public.progression_games g where g.code=row.game_code and g.enabled=true;
 if not found then raise exception 'Game is unavailable'; end if;
 safe_score:=least(raw_score,max_score);
 if actor=row.creator_id then
   if row.creator_score is not null then raise exception 'Your score is already recorded'; end if;
   update public.game_challenges set creator_score=safe_score,metadata=metadata||coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('score_model','mode_v2','max_score',max_score) where id=row.id;
 else
   if row.invitee_score is not null then raise exception 'Your score is already recorded'; end if;
   update public.game_challenges set invitee_score=safe_score,metadata=metadata||coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('score_model','mode_v2','max_score',max_score) where id=row.id;
 end if;
 perform public.record_game_result(row.game_code,safe_score,0,jsonb_build_object('mode','multiplayer','challenge_id',row.id::text,'submitted_score',raw_score)||coalesce(p_metadata,'{}'::jsonb));
 select * into row from public.game_challenges where id=row.id;
 if row.creator_score is not null and row.invitee_score is not null then
   update public.game_challenges set status='completed',winner_id=case when creator_score=invitee_score then null when creator_score>invitee_score then creator_id else invitee_id end,completed_at=now() where id=row.id returning * into row;
   select coalesce(p.display_name,p.username,'A Kleenest player') into actor_name from public.profiles p where p.id=actor;
   opponent_id:=case when actor=row.creator_id then row.invitee_id else row.creator_id end;
   insert into public.notifications(user_id,type,title,body,data) values(opponent_id,'game_challenge','Bathroom trust match completed',coalesce(actor_name,'A Kleenest player')||' finished your '||coalesce(game_name,row.game_code)||' challenge. Open Play to see the result.',jsonb_build_object('challenge_id',row.id,'game_code',row.game_code,'route','/games'));
 end if;
 return row;
end;
$$;

revoke all on function public.record_game_result(text,integer,integer,jsonb) from public,anon;
grant execute on function public.record_game_result(text,integer,integer,jsonb) to authenticated,service_role;
revoke all on function public.record_game_challenge_score(uuid,integer,jsonb) from public,anon;
grant execute on function public.record_game_challenge_score(uuid,integer,jsonb) to authenticated,service_role;
