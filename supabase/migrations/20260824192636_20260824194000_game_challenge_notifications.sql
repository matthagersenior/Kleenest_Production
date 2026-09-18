create or replace function public.create_game_challenge(p_game_code text,p_invitee_id uuid,p_metadata jsonb default '{}'::jsonb)
returns public.game_challenges
language plpgsql security definer set search_path = public, pg_temp
as $$
declare actor uuid:=auth.uid(); row public.game_challenges; actor_name text; game_name text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_invitee_id is null or p_invitee_id=actor then raise exception 'Choose another player'; end if;
  if not exists(select 1 from public.progression_games g where g.code=p_game_code and g.enabled) then raise exception 'Game is not available'; end if;
  if not exists(select 1 from public.follows f where (f.follower_id=actor and f.following_id=p_invitee_id) or (f.follower_id=p_invitee_id and f.following_id=actor)) then raise exception 'You can challenge followers or people you follow'; end if;
  if exists(select 1 from public.game_challenges c where c.game_code=p_game_code and c.status in ('pending','accepted') and c.expires_at>now() and ((c.creator_id=actor and c.invitee_id=p_invitee_id) or (c.creator_id=p_invitee_id and c.invitee_id=actor))) then raise exception 'An active challenge already exists between these players'; end if;
  insert into public.game_challenges(game_code,creator_id,invitee_id,metadata) values(p_game_code,actor,p_invitee_id,coalesce(p_metadata,'{}'::jsonb)) returning * into row;
  select coalesce(display_name,username,'A Kleenest player') into actor_name from public.profiles where id=actor;
  select name into game_name from public.progression_games where code=p_game_code;
  insert into public.notifications(user_id,type,title,body,data) values(p_invitee_id,'game_challenge','New bathroom trust challenge',actor_name||' challenged you to '||coalesce(game_name,p_game_code)||'.',jsonb_build_object('challenge_id',row.id,'game_code',p_game_code,'route','/games'));
  return row;
end; $$;

create or replace function public.respond_game_challenge(p_challenge_id uuid,p_accept boolean)
returns public.game_challenges
language plpgsql security definer set search_path = public, pg_temp
as $$
declare actor uuid:=auth.uid(); row public.game_challenges; actor_name text; game_name text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into row from public.game_challenges where id=p_challenge_id for update;
  if not found then raise exception 'Challenge not found'; end if;
  if row.invitee_id<>actor then raise exception 'Only the invited player can respond'; end if;
  if row.status<>'pending' then raise exception 'Challenge is no longer pending'; end if;
  if row.expires_at<=now() then update public.game_challenges set status='expired' where id=row.id returning * into row; return row; end if;
  update public.game_challenges set status=case when p_accept then 'accepted' else 'declined' end,accepted_at=case when p_accept then now() else null end where id=row.id returning * into row;
  if p_accept then
    select coalesce(display_name,username,'A Kleenest player') into actor_name from public.profiles where id=actor;
    select name into game_name from public.progression_games where code=row.game_code;
    insert into public.notifications(user_id,type,title,body,data) values(row.creator_id,'game_challenge','Challenge accepted',actor_name||' accepted your '||coalesce(game_name,row.game_code)||' challenge.',jsonb_build_object('challenge_id',row.id,'game_code',row.game_code,'route','/games'));
  end if;
  return row;
end; $$;
