create or replace function public.record_game_challenge_score(p_challenge_id uuid,p_score integer,p_metadata jsonb default '{}'::jsonb)
returns public.game_challenges
language plpgsql security definer set search_path = public, pg_temp
as $$
declare actor uuid:=auth.uid(); row public.game_challenges; safe_score integer:=greatest(0,least(coalesce(p_score,0),1000000)); actor_name text; opponent_id uuid; game_name text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into row from public.game_challenges where id=p_challenge_id for update;
  if not found then raise exception 'Challenge not found'; end if;
  if actor<>row.creator_id and actor<>row.invitee_id then raise exception 'You are not a participant in this challenge'; end if;
  if row.status<>'accepted' then raise exception 'Challenge must be accepted before scoring'; end if;
  if actor=row.creator_id then
    if row.creator_score is not null then raise exception 'Your score is already recorded'; end if;
    update public.game_challenges set creator_score=safe_score,metadata=metadata||coalesce(p_metadata,'{}'::jsonb) where id=row.id;
  else
    if row.invitee_score is not null then raise exception 'Your score is already recorded'; end if;
    update public.game_challenges set invitee_score=safe_score,metadata=metadata||coalesce(p_metadata,'{}'::jsonb) where id=row.id;
  end if;
  perform public.record_game_result(row.game_code,safe_score,0,jsonb_build_object('mode','multiplayer','challenge_id',row.id::text)||coalesce(p_metadata,'{}'::jsonb));
  select * into row from public.game_challenges where id=row.id;
  if row.creator_score is not null and row.invitee_score is not null then
    update public.game_challenges set status='completed',winner_id=case when creator_score=invitee_score then null when creator_score>invitee_score then creator_id else invitee_id end,completed_at=now() where id=row.id returning * into row;
    select coalesce(display_name,username,'A Kleenest player') into actor_name from public.profiles where id=actor;
    select name into game_name from public.progression_games where code=row.game_code;
    opponent_id:=case when actor=row.creator_id then row.invitee_id else row.creator_id end;
    insert into public.notifications(user_id,type,title,body,data) values(opponent_id,'game_challenge','Bathroom trust match completed',actor_name||' finished your '||coalesce(game_name,row.game_code)||' challenge. Open Play to see the result.',jsonb_build_object('challenge_id',row.id,'game_code',row.game_code,'route','/games'));
  end if;
  return row;
end; $$;
