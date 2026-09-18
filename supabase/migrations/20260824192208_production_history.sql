create table if not exists public.game_challenges (
  id uuid primary key default gen_random_uuid(),
  game_code text not null references public.progression_games(code) on update cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','completed','expired')),
  creator_score integer,
  invitee_score integer,
  winner_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '48 hours'),
  check (creator_id <> invitee_id),
  check (creator_score is null or creator_score >= 0),
  check (invitee_score is null or invitee_score >= 0)
);
create index if not exists game_challenges_creator_idx on public.game_challenges(creator_id,status,created_at desc);
create index if not exists game_challenges_invitee_idx on public.game_challenges(invitee_id,status,created_at desc);
create index if not exists game_challenges_game_idx on public.game_challenges(game_code,status);

alter table public.game_challenges enable row level security;
revoke all on table public.game_challenges from anon, authenticated;

drop function if exists public.list_game_challenge_targets(integer);
create or replace function public.list_game_challenge_targets(p_limit integer default 50)
returns table(user_id uuid, display_name text, username text, avatar_url text, relationship text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required'; end if;
  return query
  select distinct on (other_id)
    other_id,
    p.display_name,
    p.username,
    p.avatar_url,
    rel
  from (
    select f.following_id as other_id, 'following'::text as rel from public.follows f where f.follower_id = actor
    union all
    select f.follower_id as other_id, 'follower'::text as rel from public.follows f where f.following_id = actor
  ) r
  join public.profiles p on p.id = r.other_id
  where r.other_id <> actor
  order by other_id, case when rel='following' then 0 else 1 end
  limit greatest(1, least(coalesce(p_limit,50),100));
end;
$$;

drop function if exists public.create_game_challenge(text,uuid,jsonb);
create or replace function public.create_game_challenge(p_game_code text, p_invitee_id uuid, p_metadata jsonb default '{}'::jsonb)
returns public.game_challenges
language plpgsql security definer set search_path = public, pg_temp
as $$
declare actor uuid := auth.uid(); row public.game_challenges;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_invitee_id is null or p_invitee_id = actor then raise exception 'Choose another player'; end if;
  if not exists(select 1 from public.progression_games g where g.code=p_game_code and g.enabled) then raise exception 'Game is not available'; end if;
  if not exists(select 1 from public.follows f where (f.follower_id=actor and f.following_id=p_invitee_id) or (f.follower_id=p_invitee_id and f.following_id=actor)) then raise exception 'You can challenge followers or people you follow'; end if;
  if exists(select 1 from public.game_challenges c where c.game_code=p_game_code and c.status in ('pending','accepted') and c.expires_at>now() and ((c.creator_id=actor and c.invitee_id=p_invitee_id) or (c.creator_id=p_invitee_id and c.invitee_id=actor))) then raise exception 'An active challenge already exists between these players'; end if;
  insert into public.game_challenges(game_code,creator_id,invitee_id,metadata) values(p_game_code,actor,p_invitee_id,coalesce(p_metadata,'{}'::jsonb)) returning * into row;
  return row;
end;
$$;

drop function if exists public.respond_game_challenge(uuid,boolean);
create or replace function public.respond_game_challenge(p_challenge_id uuid, p_accept boolean)
returns public.game_challenges
language plpgsql security definer set search_path = public, pg_temp
as $$
declare actor uuid := auth.uid(); row public.game_challenges;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into row from public.game_challenges where id=p_challenge_id for update;
  if not found then raise exception 'Challenge not found'; end if;
  if row.invitee_id<>actor then raise exception 'Only the invited player can respond'; end if;
  if row.status<>'pending' then raise exception 'Challenge is no longer pending'; end if;
  if row.expires_at<=now() then update public.game_challenges set status='expired' where id=row.id returning * into row; return row; end if;
  update public.game_challenges set status=case when p_accept then 'accepted' else 'declined' end, accepted_at=case when p_accept then now() else null end where id=row.id returning * into row;
  return row;
end;
$$;

drop function if exists public.list_game_challenges(text,integer);
create or replace function public.list_game_challenges(p_status text default null, p_limit integer default 50)
returns table(id uuid, game_code text, status text, creator_id uuid, invitee_id uuid, creator_name text, invitee_name text, creator_score integer, invitee_score integer, winner_id uuid, created_at timestamptz, expires_at timestamptz, completed_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required'; end if;
  update public.game_challenges set status='expired' where status='pending' and expires_at<=now();
  return query
  select c.id,c.game_code,c.status,c.creator_id,c.invitee_id,
    coalesce(cp.display_name,cp.username,'Player') creator_name,
    coalesce(ip.display_name,ip.username,'Player') invitee_name,
    c.creator_score,c.invitee_score,c.winner_id,c.created_at,c.expires_at,c.completed_at
  from public.game_challenges c
  left join public.profiles cp on cp.id=c.creator_id
  left join public.profiles ip on ip.id=c.invitee_id
  where (c.creator_id=actor or c.invitee_id=actor)
    and (p_status is null or c.status=p_status)
  order by c.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),100));
end;
$$;

drop function if exists public.record_game_challenge_score(uuid,integer,jsonb);
create or replace function public.record_game_challenge_score(p_challenge_id uuid,p_score integer,p_metadata jsonb default '{}'::jsonb)
returns public.game_challenges
language plpgsql security definer set search_path = public, pg_temp
as $$
declare actor uuid := auth.uid(); row public.game_challenges; safe_score integer:=greatest(0,least(coalesce(p_score,0),1000000)); result jsonb;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into row from public.game_challenges where id=p_challenge_id for update;
  if not found then raise exception 'Challenge not found'; end if;
  if actor<>row.creator_id and actor<>row.invitee_id then raise exception 'You are not a participant in this challenge'; end if;
  if row.status<>'accepted' then raise exception 'Challenge must be accepted before scoring'; end if;
  if actor=row.creator_id then
    if row.creator_score is not null then raise exception 'Your score is already recorded'; end if;
    update public.game_challenges set creator_score=safe_score,metadata=metadata || coalesce(p_metadata,'{}'::jsonb) where id=row.id;
  else
    if row.invitee_score is not null then raise exception 'Your score is already recorded'; end if;
    update public.game_challenges set invitee_score=safe_score,metadata=metadata || coalesce(p_metadata,'{}'::jsonb) where id=row.id;
  end if;
  perform public.record_game_result(row.game_code,safe_score,0,jsonb_build_object('mode','multiplayer','challenge_id',row.id::text)||coalesce(p_metadata,'{}'::jsonb));
  select * into row from public.game_challenges where id=row.id;
  if row.creator_score is not null and row.invitee_score is not null then
    update public.game_challenges set status='completed',winner_id=case when creator_score=invitee_score then null when creator_score>invitee_score then creator_id else invitee_id end,completed_at=now() where id=row.id returning * into row;
  else
    select * into row from public.game_challenges where id=row.id;
  end if;
  return row;
end;
$$;

revoke all on function public.list_game_challenge_targets(integer) from public,anon,authenticated;
revoke all on function public.create_game_challenge(text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.respond_game_challenge(uuid,boolean) from public,anon,authenticated;
revoke all on function public.list_game_challenges(text,integer) from public,anon,authenticated;
revoke all on function public.record_game_challenge_score(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.list_game_challenge_targets(integer) to authenticated;
grant execute on function public.create_game_challenge(text,uuid,jsonb) to authenticated;
grant execute on function public.respond_game_challenge(uuid,boolean) to authenticated;
grant execute on function public.list_game_challenges(text,integer) to authenticated;
grant execute on function public.record_game_challenge_score(uuid,integer,jsonb) to authenticated;

insert into public.progression_games(code,name,description,game_type,reward_points,difficulty,rules,enabled,metrics_config) values
('clean_sweep','Clean Sweep','Sweep the cleanest evidence tiles before the timer runs out.','trust_tap',10,'easy','{"focus":"verified_evidence","rounds":12}'::jsonb,true,'{"metric":"game_clean_sweep"}'::jsonb),
('bathroom_memory','Bathroom Memory','Match restroom amenity pairs and learn the signals that matter.','memory',15,'easy','{"focus":"amenities","pairs":6}'::jsonb,true,'{"metric":"game_bathroom_memory"}'::jsonb),
('trust_or_bust','Trust or Bust','Separate verified restroom evidence from weak or misleading signals.','trust_quiz',20,'medium','{"focus":"verification","questions":8}'::jsonb,true,'{"metric":"game_trust_or_bust"}'::jsonb),
('flush_the_facts','Flush the Facts','Rapid-fire bathroom intelligence and evidence decisions.','rapid_fire',20,'medium','{"focus":"review_quality","questions":10}'::jsonb,true,'{"metric":"game_flush_the_facts"}'::jsonb),
('restroom_relay','Restroom Relay','Race through a chain of cleanliness, accessibility, and amenity decisions.','relay',25,'medium','{"focus":"review_workflow","rounds":8}'::jsonb,true,'{"metric":"game_restroom_relay"}'::jsonb),
('stall_strategy','Stall Strategy','Choose the strongest evidence path for a restroom before your opponent.','strategy',30,'hard','{"focus":"evidence","turns":10}'::jsonb,true,'{"metric":"game_stall_strategy"}'::jsonb),
('sink_sprint','Sink Sprint','Identify sink, soap, drying, and accessibility signals at speed.','rapid_fire',20,'easy','{"focus":"amenities","rounds":12}'::jsonb,true,'{"metric":"game_sink_sprint"}'::jsonb),
('route_to_relief','Route to Relief','Build the most trustworthy restroom stop from route and review clues.','route_puzzle',25,'medium','{"focus":"routing","rounds":6}'::jsonb,true,'{"metric":"game_route_to_relief"}'::jsonb),
('review_rater','Review Rater','Rank review evidence by usefulness to the next restroom visitor.','ranking',30,'medium','{"focus":"review_quality","rounds":8}'::jsonb,true,'{"metric":"game_review_rater"}'::jsonb),
('evidence_detective','Evidence Detective','Spot the clues that make a restroom rating trustworthy.','detective',35,'hard','{"focus":"verification","rounds":8}'::jsonb,true,'{"metric":"game_evidence_detective"}'::jsonb),
('amenity_architect','Amenity Architect','Build the best restroom profile from fixtures, accessibility, and cleanliness facts.','builder',30,'hard','{"focus":"amenities","rounds":8}'::jsonb,true,'{"metric":"game_amenity_architect"}'::jsonb),
('cleanliness_clash','Cleanliness Clash','Compete head-to-head to identify the stronger restroom evidence set.','multiplayer_trust',40,'hard','{"focus":"trust","multiplayer":true,"rounds":8}'::jsonb,true,'{"metric":"game_cleanliness_clash"}'::jsonb)
on conflict(code) do update set name=excluded.name,description=excluded.description,game_type=excluded.game_type,reward_points=excluded.reward_points,difficulty=excluded.difficulty,rules=excluded.rules,enabled=true,metrics_config=excluded.metrics_config;
