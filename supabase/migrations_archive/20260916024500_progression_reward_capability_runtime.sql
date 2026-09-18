-- Runtime behavior for progression capability rewards.
-- Every capability below is enforced server-side; the client cannot self-grant access.

create or replace function internal.user_has_progression_reward(p_user_id uuid,p_reward_code text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select p_user_id is not null and (
    internal.is_actual_platform_owner(p_user_id)
    or exists(
      select 1 from public.user_progression_reward_grants g
      where g.user_id=p_user_id and g.reward_code=p_reward_code and g.revoked_at is null
    )
    or internal.progression_reward_eligible(p_user_id,p_reward_code)
  )
$$;
revoke all on function internal.user_has_progression_reward(uuid,text) from public,anon,authenticated;

create table if not exists public.user_reward_objective_rerolls(
  user_id uuid not null references public.profiles(id) on delete cascade,
  objective_id uuid not null references public.progression_objectives_v2(id) on delete cascade,
  hidden_until timestamptz not null,
  created_at timestamptz not null default now(),
  primary key(user_id,objective_id,created_at)
);
create index if not exists user_reward_objective_rerolls_active_idx on public.user_reward_objective_rerolls(user_id,hidden_until);
alter table public.user_reward_objective_rerolls enable row level security;
revoke all on table public.user_reward_objective_rerolls from anon,authenticated;

create table if not exists public.user_reward_objective_pins(
  user_id uuid not null references public.profiles(id) on delete cascade,
  objective_id uuid not null references public.progression_objectives_v2(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key(user_id,objective_id)
);
alter table public.user_reward_objective_pins enable row level security;
revoke all on table public.user_reward_objective_pins from anon,authenticated;

create table if not exists public.user_reward_streak_shield_usage(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  used_on date not null default current_date,
  prior_streak integer not null default 0,
  protected_streak integer not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id,used_on)
);
create index if not exists user_reward_streak_shield_usage_user_idx on public.user_reward_streak_shield_usage(user_id,used_on desc);
alter table public.user_reward_streak_shield_usage enable row level security;
revoke all on table public.user_reward_streak_shield_usage from anon,authenticated;

create table if not exists public.user_saved_collections(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists user_saved_collections_name_idx on public.user_saved_collections(user_id,lower(name));
alter table public.user_saved_collections enable row level security;
revoke all on table public.user_saved_collections from anon,authenticated;

create table if not exists public.user_saved_collection_items(
  collection_id uuid not null references public.user_saved_collections(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key(collection_id,location_id)
);
alter table public.user_saved_collection_items enable row level security;
revoke all on table public.user_saved_collection_items from anon,authenticated;

create table if not exists public.community_reward_challenges(
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check(length(btrim(title)) between 3 and 80),
  description text not null default '' check(length(description)<=500),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check(status in('active','closed')),
  created_at timestamptz not null default now()
);
create index if not exists community_reward_challenges_active_idx on public.community_reward_challenges(status,ends_at);
alter table public.community_reward_challenges enable row level security;
revoke all on table public.community_reward_challenges from anon,authenticated;

create table if not exists public.community_reward_challenge_participants(
  challenge_id uuid not null references public.community_reward_challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(challenge_id,user_id)
);
alter table public.community_reward_challenge_participants enable row level security;
revoke all on table public.community_reward_challenge_participants from anon,authenticated;

create table if not exists public.community_reward_proposals(
  code text primary key,
  category text not null,
  title text not null,
  description text not null,
  status text not null default 'open' check(status in('open','closed')),
  created_at timestamptz not null default now()
);
alter table public.community_reward_proposals enable row level security;
revoke all on table public.community_reward_proposals from anon,authenticated;

create table if not exists public.community_reward_votes(
  proposal_code text not null references public.community_reward_proposals(code) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null check(vote in('support','not_yet','abstain')),
  updated_at timestamptz not null default now(),
  primary key(proposal_code,user_id)
);
alter table public.community_reward_votes enable row level security;
revoke all on table public.community_reward_votes from anon,authenticated;

insert into public.community_reward_proposals(code,category,title,description,status)
values
('crowding-signal','discovery','Crowding / wait-time signal','Explore whether recent restroom queue and crowding reports should become a time-sensitive discovery signal.','open'),
('sensory-attributes','amenity','Sensory-friendly restroom attributes','Explore community-confirmed lighting, noise and privacy attributes for people who need a lower-sensory restroom experience.','open'),
('overnight-reliability','freshness','Overnight access reliability','Explore a separate freshness signal for bathrooms that are reliably accessible late at night or 24 hours.','open')
on conflict(code) do nothing;

create table if not exists public.user_beta_feature_preferences(
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature_code text not null check(feature_code in('evidence_gap_radar')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(user_id,feature_code)
);
alter table public.user_beta_feature_preferences enable row level security;
revoke all on table public.user_beta_feature_preferences from anon,authenticated;

create table if not exists public.user_reward_dispute_advisories(
  dispute_id uuid not null references public.business_photo_disputes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  signal text not null check(signal in('supports_current_evidence','supports_business_dispute','needs_more_evidence')),
  notes text not null default '' check(length(notes)<=500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(dispute_id,user_id)
);
alter table public.user_reward_dispute_advisories enable row level security;
revoke all on table public.user_reward_dispute_advisories from anon,authenticated;

create table if not exists public.review_reward_reactions(
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check(reaction in('fresh','verified','route','helpful','guardian','gold','resolved','evidence')),
  created_at timestamptz not null default now(),
  primary key(review_id,user_id,reaction)
);
create index if not exists review_reward_reactions_review_idx on public.review_reward_reactions(review_id,reaction);
alter table public.review_reward_reactions enable row level security;
revoke all on table public.review_reward_reactions from anon,authenticated;

create or replace function public.consumer_active_objectives()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with v2 as (
 select jsonb_build_object(
   'id',o.id,'source','progression_v2','kind',o.kind,'code',o.code,'title',o.title,'description',o.description,
   'rules',o.rules,'rewards',o.rewards,'starts_at',o.starts_at,'ends_at',o.ends_at,
   'progress',coalesce(up.progress,0),'target',coalesce(up.target,(o.rules->>'target')::numeric,1),'state',coalesce(up.state,'active'),
   'pinned',exists(select 1 from public.user_reward_objective_pins pin where pin.user_id=auth.uid() and pin.objective_id=o.id)
 ) item,
 case o.kind when 'quest' then 1 when 'mission' then 2 when 'challenge' then 3 when 'journey' then 4 when 'campaign' then 5 else 6 end ord,
 o.title sort_title
 from public.progression_objectives_v2 o
 left join public.user_objective_progress_v2 up on up.objective_id=o.id and up.user_id=auth.uid()
 where auth.uid() is not null and o.status='active' and (o.starts_at is null or o.starts_at<=now()) and (o.ends_at is null or o.ends_at>=now())
   and not exists(
     select 1 from public.user_reward_objective_rerolls rr
     where rr.user_id=auth.uid() and rr.objective_id=o.id and rr.hidden_until>now()
   )
), legacy_quests as (
 select jsonb_build_object(
   'id',q.id,'source','legacy_quest','kind','quest','code','quest:'||q.id::text,'title',q.name,'description',coalesce(q.description,''),
   'rules',coalesce(q.targeting_config,'{}'::jsonb)||jsonb_build_object('route_config',coalesce(q.route_config,'{}'::jsonb)),
   'rewards',coalesce(q.reward_config,'{}'::jsonb),'starts_at',q.start_at,'ends_at',q.end_at,
   'progress',coalesce(qp.progress,0),'target',1,'state',coalesce(qp.status,'available'),'pinned',false
 ) item,1 ord,q.name sort_title
 from public.quests q
 left join public.quest_participation qp on qp.quest_id=q.id and qp.user_id=auth.uid()
 where auth.uid() is not null and q.status in ('active','published') and (q.start_at is null or q.start_at<=now()) and (q.end_at is null or q.end_at>=now())
), legacy_contests as (
 select jsonb_build_object(
   'id',c.id,'source','legacy_contest','kind','contest','code','contest:'||c.id::text,'title',c.name,'description',coalesce(c.description,''),
   'rules',coalesce(c.scoring_rules,'{}'::jsonb)||jsonb_build_object('metrics_config',coalesce(c.metrics_config,'{}'::jsonb)),
   'rewards',coalesce(c.rewards,'{}'::jsonb),'starts_at',c.starts_at,'ends_at',c.ends_at,
   'progress',0,'target',1,'state','active','business_id',c.business_id,'pinned',false
 ) item,6 ord,c.name sort_title
 from public.contests c
 where auth.uid() is not null and c.status='active' and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>=now())
), business_campaigns as (
 select jsonb_build_object(
   'id',bc.id,'source','business_campaign','kind','campaign','code','business-campaign:'||bc.id::text,'title',bc.name,'description',coalesce(bc.description,''),
   'rules',jsonb_build_object('location_id',bc.location_id,'business_id',bc.business_id),
   'rewards','{}'::jsonb,'starts_at',bc.starts_at,'ends_at',bc.ends_at,
   'progress',0,'target',1,'state','active','business_id',bc.business_id,'location_id',bc.location_id,'pinned',false
 ) item,5 ord,bc.name sort_title
 from public.business_campaigns bc
 where auth.uid() is not null and bc.status='active' and (bc.starts_at is null or bc.starts_at<=now()) and (bc.ends_at is null or bc.ends_at>=now())
), all_items as (
 select * from v2 union all select * from legacy_quests union all select * from legacy_contests union all select * from business_campaigns
)
select coalesce(jsonb_agg(item order by ord,sort_title),'[]'::jsonb) from all_items
$$;
revoke all on function public.consumer_active_objectives() from public,anon;
grant execute on function public.consumer_active_objectives() to authenticated;

create or replace function public.consumer_reroll_progression_objective(p_objective_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_hidden_until timestamptz:=now()+interval '24 hours';
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if not internal.user_has_progression_reward(v_user,'mission_reroll_daily') then raise exception 'mission reroll reward is locked'; end if;
 if not exists(select 1 from public.progression_objectives_v2 o where o.id=p_objective_id and o.status='active' and (o.starts_at is null or o.starts_at<=now()) and (o.ends_at is null or o.ends_at>=now())) then raise exception 'objective is not active'; end if;
 if exists(select 1 from public.user_reward_objective_rerolls where user_id=v_user and created_at>=date_trunc('day',now())) then raise exception 'today''s mission reroll is already used'; end if;
 insert into public.user_reward_objective_rerolls(user_id,objective_id,hidden_until) values(v_user,p_objective_id,v_hidden_until);
 return jsonb_build_object('rerolled',true,'objective_id',p_objective_id,'hidden_until',v_hidden_until);
end
$$;

create or replace function public.consumer_pin_progression_objective(p_objective_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_limit integer:=1; v_count integer:=0;
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if internal.user_has_progression_reward(v_user,'quest_slot_bonus') then v_limit:=2; end if;
 if not exists(select 1 from public.progression_objectives_v2 o where o.id=p_objective_id and o.status='active') then raise exception 'objective is not active'; end if;
 select count(*)::integer into v_count from public.user_reward_objective_pins where user_id=v_user;
 if not exists(select 1 from public.user_reward_objective_pins where user_id=v_user and objective_id=p_objective_id) and v_count>=v_limit then raise exception 'focus slots are full'; end if;
 insert into public.user_reward_objective_pins(user_id,objective_id) values(v_user,p_objective_id) on conflict do nothing;
 return jsonb_build_object('pinned',true,'objective_id',p_objective_id,'slots',v_limit);
end
$$;

create or replace function public.consumer_unpin_progression_objective(p_objective_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'authentication required'; end if;
 delete from public.user_reward_objective_pins where user_id=v_user and objective_id=p_objective_id;
 return jsonb_build_object('pinned',false,'objective_id',p_objective_id);
end
$$;

create or replace function public.record_verification_streak(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 s public.verification_streaks;
 d date:=current_date;
 v_streak integer;
 v_longest integer;
 v_protected boolean:=false;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select * into s from public.verification_streaks where user_id=auth.uid() for update;
 if not found then
   insert into public.verification_streaks(user_id,current_streak,longest_streak,last_verified_at,last_verified_date,streak_started_at,last_location_id,updated_at)
   values(auth.uid(),1,1,now(),d,now(),p_location_id,now());
   return jsonb_build_object('current_streak',1,'longest_streak',1,'last_verified_date',d,'location_id',p_location_id,'shield_used',false);
 end if;
 if s.last_verified_date=d then
   update public.verification_streaks set last_verified_at=now(),last_location_id=p_location_id,updated_at=now() where user_id=auth.uid();
   return jsonb_build_object('current_streak',s.current_streak,'longest_streak',s.longest_streak,'last_verified_date',d,'location_id',p_location_id,'already_counted',true,'shield_used',false);
 end if;

 if s.last_verified_date=d-2
   and internal.user_has_progression_reward(auth.uid(),'streak_shield')
   and not exists(select 1 from public.user_reward_streak_shield_usage u where u.user_id=auth.uid() and u.used_on>=d-30) then
   v_streak:=s.current_streak+1;
   v_protected:=true;
   insert into public.user_reward_streak_shield_usage(user_id,used_on,prior_streak,protected_streak)
   values(auth.uid(),d,s.current_streak,v_streak);
 else
   v_streak:=case when s.last_verified_date=d-1 then s.current_streak+1 else 1 end;
 end if;
 v_longest:=greatest(s.longest_streak,v_streak);
 update public.verification_streaks
 set current_streak=v_streak,longest_streak=v_longest,last_verified_at=now(),last_verified_date=d,
     streak_started_at=case when s.last_verified_date in(d-1,d-2) and (s.last_verified_date=d-1 or v_protected) then s.streak_started_at else now() end,
     last_location_id=p_location_id,updated_at=now()
 where user_id=auth.uid();
 return jsonb_build_object('current_streak',v_streak,'longest_streak',v_longest,'last_verified_date',d,'location_id',p_location_id,'already_counted',false,'shield_used',v_protected);
end
$$;

create or replace function public.consumer_reward_collections()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'name',c.name,'created_at',c.created_at,
   'items',coalesce((select jsonb_agg(jsonb_build_object('location_id',i.location_id,'name',l.name,'address',l.address,'city',l.city,'state',l.state,'added_at',i.added_at) order by i.added_at desc)
     from public.user_saved_collection_items i join public.locations l on l.id=i.location_id where i.collection_id=c.id),'[]'::jsonb)
 ) order by c.updated_at desc),'[]'::jsonb)
 from public.user_saved_collections c where c.user_id=auth.uid()
$$;

create or replace function public.consumer_create_reward_collection(p_name text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_limit integer:=3; v_count integer:=0; v_id uuid;
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if internal.user_has_progression_reward(v_user,'saved_collection_plus_five') then v_limit:=8; end if;
 select count(*)::integer into v_count from public.user_saved_collections where user_id=v_user;
 if v_count>=v_limit then raise exception 'saved collection limit reached'; end if;
 insert into public.user_saved_collections(user_id,name) values(v_user,btrim(p_name)) returning id into v_id;
 return jsonb_build_object('id',v_id,'name',btrim(p_name),'limit',v_limit);
end
$$;

create or replace function public.consumer_add_favorite_to_collection(p_collection_id uuid,p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if not exists(select 1 from public.user_saved_collections where id=p_collection_id and user_id=v_user) then raise exception 'collection not found'; end if;
 if not exists(select 1 from public.favorites where user_id=v_user and location_id=p_location_id)
    and not exists(select 1 from public.location_favorites where user_id=v_user and location_id=p_location_id) then
   raise exception 'save this location before adding it to a collection';
 end if;
 insert into public.user_saved_collection_items(collection_id,location_id) values(p_collection_id,p_location_id) on conflict do nothing;
 update public.user_saved_collections set updated_at=now() where id=p_collection_id;
 return jsonb_build_object('added',true,'collection_id',p_collection_id,'location_id',p_location_id);
end
$$;

create or replace function public.consumer_remove_favorite_from_collection(p_collection_id uuid,p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if not exists(select 1 from public.user_saved_collections where id=p_collection_id and user_id=v_user) then raise exception 'collection not found'; end if;
 delete from public.user_saved_collection_items where collection_id=p_collection_id and location_id=p_location_id;
 update public.user_saved_collections set updated_at=now() where id=p_collection_id;
 return jsonb_build_object('removed',true,'collection_id',p_collection_id,'location_id',p_location_id);
end
$$;

create or replace function public.consumer_reward_community_challenges()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'title',c.title,'description',c.description,'ends_at',c.ends_at,'creator_user_id',c.creator_user_id,
   'creator_name',coalesce(p.display_name,p.username,'Contributor'),
   'participant_count',(select count(*) from public.community_reward_challenge_participants cp where cp.challenge_id=c.id),
   'joined',exists(select 1 from public.community_reward_challenge_participants cp where cp.challenge_id=c.id and cp.user_id=auth.uid())
 ) order by c.created_at desc),'[]'::jsonb)
 from public.community_reward_challenges c
 join public.profiles p on p.id=c.creator_user_id
 where c.status='active' and c.ends_at>now()
$$;

create or replace function public.consumer_create_reward_community_challenge(p_title text,p_description text,p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_days integer:=least(14,greatest(1,coalesce(p_days,7)));
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if not internal.user_has_progression_reward(v_user,'community_challenge_creator') then raise exception 'community challenge creator reward is locked'; end if;
 insert into public.community_reward_challenges(creator_user_id,title,description,ends_at)
 values(v_user,btrim(p_title),left(coalesce(p_description,''),500),now()+make_interval(days=>v_days))
 returning id into v_id;
 insert into public.community_reward_challenge_participants(challenge_id,user_id) values(v_id,v_user) on conflict do nothing;
 return jsonb_build_object('id',v_id,'created',true,'days',v_days);
end
$$;

create or replace function public.consumer_join_reward_community_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if not exists(select 1 from public.community_reward_challenges c where c.id=p_challenge_id and c.status='active' and c.ends_at>now()) then raise exception 'challenge is not active'; end if;
 insert into public.community_reward_challenge_participants(challenge_id,user_id) values(p_challenge_id,v_user) on conflict do nothing;
 return jsonb_build_object('joined',true,'challenge_id',p_challenge_id);
end
$$;

create or replace function public.consumer_reward_proposals()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'code',p.code,'category',p.category,'title',p.title,'description',p.description,
   'support',(select count(*) from public.community_reward_votes v where v.proposal_code=p.code and v.vote='support'),
   'not_yet',(select count(*) from public.community_reward_votes v where v.proposal_code=p.code and v.vote='not_yet'),
   'abstain',(select count(*) from public.community_reward_votes v where v.proposal_code=p.code and v.vote='abstain'),
   'my_vote',(select v.vote from public.community_reward_votes v where v.proposal_code=p.code and v.user_id=auth.uid())
 ) order by p.created_at,p.code),'[]'::jsonb)
 from public.community_reward_proposals p where p.status='open'
$$;

create or replace function public.consumer_vote_reward_proposal(p_proposal_code text,p_vote text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if not internal.user_has_progression_reward(v_user,'community_vote_privilege') then raise exception 'network vote reward is locked'; end if;
 if p_vote not in('support','not_yet','abstain') then raise exception 'invalid vote'; end if;
 if not exists(select 1 from public.community_reward_proposals where code=p_proposal_code and status='open') then raise exception 'proposal is not open'; end if;
 insert into public.community_reward_votes(proposal_code,user_id,vote,updated_at)
 values(p_proposal_code,v_user,p_vote,now())
 on conflict(proposal_code,user_id) do update set vote=excluded.vote,updated_at=now();
 return jsonb_build_object('proposal_code',p_proposal_code,'vote',p_vote);
end
$$;

create or replace function public.consumer_set_beta_feature(p_feature_code text,p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if not internal.user_has_progression_reward(v_user,'beta_access_lab') then raise exception 'Kleenest Labs access is locked'; end if;
 if p_feature_code not in('evidence_gap_radar') then raise exception 'unknown beta feature'; end if;
 insert into public.user_beta_feature_preferences(user_id,feature_code,enabled,updated_at)
 values(v_user,p_feature_code,coalesce(p_enabled,false),now())
 on conflict(user_id,feature_code) do update set enabled=excluded.enabled,updated_at=now();
 return jsonb_build_object('feature_code',p_feature_code,'enabled',coalesce(p_enabled,false));
end
$$;

create or replace function public.consumer_reward_impact_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if not internal.user_has_progression_reward(v_user,'stats_pack_impact') then raise exception 'impact stats reward is locked'; end if;
 return jsonb_build_object(
   'lifetime_xp',(select coalesce(sum(xp_awarded),0) from public.progression_events_v2 where user_id=v_user and status='awarded'),
   'verified_evidence',(select count(*) from public.progression_events_v2 where user_id=v_user and status='awarded' and action in('verify_location','reverify_stale')),
   'locations_touched',(select count(distinct location_id) from public.progression_events_v2 where user_id=v_user and status='awarded' and location_id is not null),
   'photos_added',(select count(*) from public.progression_events_v2 where user_id=v_user and status='awarded' and action='add_photo'),
   'amenity_updates',(select count(*) from public.progression_events_v2 where user_id=v_user and status='awarded' and action in('add_amenity','add_accessibility')),
   'helpful_contributions',(select count(*) from public.progression_events_v2 where user_id=v_user and status='awarded' and action='helpful_contribution'),
   'late_night_evidence',(select count(*) from public.progression_events_v2 where user_id=v_user and status='awarded' and (extract(hour from created_at at time zone 'America/Chicago')>=22 or extract(hour from created_at at time zone 'America/Chicago')<5)),
   'game_plays',(select count(*) from public.progression_metric_events where user_id=v_user and source_type='game' and metric='game_score'),
   'verification_streak',(select coalesce(current_streak,0) from public.verification_streaks where user_id=v_user),
   'longest_verification_streak',(select coalesce(longest_streak,0) from public.verification_streaks where user_id=v_user)
 );
end
$$;

create or replace function public.consumer_reward_verification_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if not internal.user_has_progression_reward(v_user,'verification_privilege_disputes') then raise exception 'disputed-data verification reward is locked'; end if;
 return (
   select coalesce(jsonb_agg(jsonb_build_object(
     'id',d.id,'location_id',d.location_id,'location_name',l.name,'address',l.address,'city',l.city,'state',l.state,
     'reason',d.reason,'created_at',d.created_at,
     'my_signal',(select a.signal from public.user_reward_dispute_advisories a where a.dispute_id=d.id and a.user_id=v_user)
   ) order by d.created_at desc),'[]'::jsonb)
   from public.business_photo_disputes d join public.locations l on l.id=d.location_id
   where d.status='open'
 );
end
$$;

create or replace function public.consumer_submit_dispute_advisory(p_dispute_id uuid,p_signal text,p_notes text default '')
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if not internal.user_has_progression_reward(v_user,'verification_privilege_disputes') then raise exception 'disputed-data verification reward is locked'; end if;
 if p_signal not in('supports_current_evidence','supports_business_dispute','needs_more_evidence') then raise exception 'invalid advisory signal'; end if;
 if not exists(select 1 from public.business_photo_disputes where id=p_dispute_id and status='open') then raise exception 'dispute is not open'; end if;
 insert into public.user_reward_dispute_advisories(dispute_id,user_id,signal,notes,created_at,updated_at)
 values(p_dispute_id,v_user,p_signal,left(coalesce(p_notes,''),500),now(),now())
 on conflict(dispute_id,user_id) do update set signal=excluded.signal,notes=excluded.notes,updated_at=now();
 return jsonb_build_object('submitted',true,'dispute_id',p_dispute_id,'signal',p_signal);
end
$$;

create or replace function public.consumer_toggle_reward_reaction(p_review_id uuid,p_reaction text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_allowed boolean:=false; v_removed boolean:=false;
begin
 if v_user is null then raise exception 'authentication required'; end if;
 v_allowed:=(
   (internal.user_has_progression_reward(v_user,'reaction_pack_signal') and p_reaction in('fresh','verified','route','helpful'))
   or (internal.user_has_progression_reward(v_user,'reaction_pack_guardian') and p_reaction in('guardian','gold','resolved','evidence'))
 );
 if not v_allowed then raise exception 'reaction is locked'; end if;
 if exists(select 1 from public.review_reward_reactions where review_id=p_review_id and user_id=v_user and reaction=p_reaction) then
   delete from public.review_reward_reactions where review_id=p_review_id and user_id=v_user and reaction=p_reaction;
   v_removed:=true;
 else
   insert into public.review_reward_reactions(review_id,user_id,reaction) values(p_review_id,v_user,p_reaction);
 end if;
 return jsonb_build_object('review_id',p_review_id,'reaction',p_reaction,'active',not v_removed);
end
$$;

create or replace function public.consumer_review_reward_reactions(p_review_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
 select coalesce(jsonb_object_agg(review_id::text,payload),'{}'::jsonb)
 from (
   select r.review_id,jsonb_build_object(
     'counts',jsonb_object_agg(r.reaction,r.cnt),
     'mine',coalesce((select jsonb_agg(rr.reaction order by rr.reaction) from public.review_reward_reactions rr where rr.review_id=r.review_id and rr.user_id=auth.uid()),'[]'::jsonb)
   ) payload
   from (
     select review_id,reaction,count(*)::integer cnt
     from public.review_reward_reactions
     where review_id=any(coalesce(p_review_ids,'{}'::uuid[]))
     group by review_id,reaction
   ) r
   group by r.review_id
 ) x
$$;

create or replace function public.consumer_reward_capabilities()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_owner boolean:=false;
begin
 if v_user is null then raise exception 'authentication required'; end if;
 v_owner:=internal.is_actual_platform_owner(v_user);
 return (
   with unlocked as (
     select c.*
     from public.progression_reward_catalog c
     where c.active and (
       v_owner
       or exists(select 1 from public.user_progression_reward_grants g where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null)
       or internal.progression_reward_eligible(v_user,c.code)
     )
   )
   select jsonb_build_object(
     'platform_owner',v_owner,
     'showcase_slot_bonus',coalesce(sum(coalesce((metadata->>'showcase_slot_bonus')::integer,0)),0),
     'saved_collection_bonus',coalesce(sum(coalesce((metadata->>'saved_collection_bonus')::integer,0)),0),
     'mission_rerolls',coalesce(sum(coalesce((metadata->>'mission_rerolls')::integer,0)),0),
     'quest_slots',coalesce(sum(coalesce((metadata->>'quest_slots')::integer,0)),0),
     'streak_shields',coalesce(sum(coalesce((metadata->>'streak_shields')::integer,0)),0),
     'community_challenge_creator',coalesce(bool_or(coalesce((metadata->>'community_challenge_creator')::boolean,false)),false),
     'community_vote',coalesce(bool_or(coalesce((metadata->>'community_vote')::boolean,false)),false),
     'beta_access',coalesce(bool_or(coalesce((metadata->>'beta_access')::boolean,false)),false),
     'stats_pack',coalesce(bool_or(coalesce((metadata->>'stats_pack')::boolean,false)),false),
     'verification_privilege',coalesce(bool_or(coalesce((metadata->>'verification_privilege')::boolean,false)),false),
     'beta_features',(select coalesce(jsonb_object_agg(feature_code,enabled),'{}'::jsonb) from public.user_beta_feature_preferences where user_id=v_user),
     'streak_shield_last_used',(select max(used_on) from public.user_reward_streak_shield_usage where user_id=v_user),
     'equipped',(select coalesce(jsonb_object_agg(eq.slot,jsonb_build_object('code',c2.code,'reward_key',c2.reward_key,'name',c2.name,'metadata',c2.metadata)),'{}'::jsonb)
       from public.user_progression_reward_equipment eq join public.progression_reward_catalog c2 on c2.code=eq.reward_code
       where eq.user_id=v_user)
   )
   from unlocked
 );
end
$$;

revoke all on function public.consumer_reroll_progression_objective(uuid) from public,anon;
revoke all on function public.consumer_pin_progression_objective(uuid) from public,anon;
revoke all on function public.consumer_unpin_progression_objective(uuid) from public,anon;
revoke all on function public.consumer_reward_collections() from public,anon;
revoke all on function public.consumer_create_reward_collection(text) from public,anon;
revoke all on function public.consumer_add_favorite_to_collection(uuid,uuid) from public,anon;
revoke all on function public.consumer_remove_favorite_from_collection(uuid,uuid) from public,anon;
revoke all on function public.consumer_reward_community_challenges() from public,anon;
revoke all on function public.consumer_create_reward_community_challenge(text,text,integer) from public,anon;
revoke all on function public.consumer_join_reward_community_challenge(uuid) from public,anon;
revoke all on function public.consumer_reward_proposals() from public,anon;
revoke all on function public.consumer_vote_reward_proposal(text,text) from public,anon;
revoke all on function public.consumer_set_beta_feature(text,boolean) from public,anon;
revoke all on function public.consumer_reward_impact_stats() from public,anon;
revoke all on function public.consumer_reward_verification_queue() from public,anon;
revoke all on function public.consumer_submit_dispute_advisory(uuid,text,text) from public,anon;
revoke all on function public.consumer_toggle_reward_reaction(uuid,text) from public,anon;
revoke all on function public.consumer_review_reward_reactions(uuid[]) from public,anon;

grant execute on function public.consumer_reroll_progression_objective(uuid) to authenticated;
grant execute on function public.consumer_pin_progression_objective(uuid) to authenticated;
grant execute on function public.consumer_unpin_progression_objective(uuid) to authenticated;
grant execute on function public.consumer_reward_collections() to authenticated;
grant execute on function public.consumer_create_reward_collection(text) to authenticated;
grant execute on function public.consumer_add_favorite_to_collection(uuid,uuid) to authenticated;
grant execute on function public.consumer_remove_favorite_from_collection(uuid,uuid) to authenticated;
grant execute on function public.consumer_reward_community_challenges() to authenticated;
grant execute on function public.consumer_create_reward_community_challenge(text,text,integer) to authenticated;
grant execute on function public.consumer_join_reward_community_challenge(uuid) to authenticated;
grant execute on function public.consumer_reward_proposals() to authenticated;
grant execute on function public.consumer_vote_reward_proposal(text,text) to authenticated;
grant execute on function public.consumer_set_beta_feature(text,boolean) to authenticated;
grant execute on function public.consumer_reward_impact_stats() to authenticated;
grant execute on function public.consumer_reward_verification_queue() to authenticated;
grant execute on function public.consumer_submit_dispute_advisory(uuid,text,text) to authenticated;
grant execute on function public.consumer_toggle_reward_reaction(uuid,text) to authenticated;
grant execute on function public.consumer_review_reward_reactions(uuid[]) to authenticated;
