-- Progression World: seasons, collections, community goals, and evidence-backed trust.
-- game_play does not directly raise contributor_trust; only evidence-backed progression actions can add the progression trust bonus.

-- Converge objective lifecycle states with the already-shipped supply/owner control-plane functions.
alter table public.progression_objectives_v2 drop constraint if exists progression_objectives_v2_status_check;
alter table public.progression_objectives_v2 add constraint progression_objectives_v2_status_check
  check(status in('draft','scheduled','active','paused','completed','ended','archived'));

create table if not exists public.progression_seasons(
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  label text not null,
  description text not null default '',
  status text not null default 'draft' check(status in('draft','scheduled','active','ended','archived')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  theme jsonb not null default '{}'::jsonb,
  chapters jsonb not null default '[]'::jsonb,
  reward_track jsonb not null default '[]'::jsonb,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at>starts_at)
);
alter table public.progression_seasons enable row level security;
revoke all on table public.progression_seasons from anon,authenticated;
grant select,insert,update,delete on table public.progression_seasons to service_role;

create table if not exists public.progression_badge_collections(
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  season_id uuid references public.progression_seasons(id) on delete set null,
  name text not null,
  description text not null default '',
  icon text not null default '🏅',
  badge_codes text[] not null default '{}'::text[],
  reward jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.progression_badge_collections enable row level security;
revoke all on table public.progression_badge_collections from anon,authenticated;
grant select,insert,update,delete on table public.progression_badge_collections to service_role;

insert into public.progression_seasons(
  code,name,label,description,status,starts_at,ends_at,theme,chapters,reward_track,rules,updated_at
) values (
  'freshness_run_2026',
  'The Freshness Run',
  'SEASON 01',
  'An eight-week expedition to make Kleenest dramatically fresher: find uncertainty, verify what changed, build trustworthy trails, and move the whole community meter together.',
  'active',
  '2026-09-13T00:00:00Z',
  '2026-11-09T05:59:59Z',
  '{"accent":"freshness","icon":"🟢","motto":"Make the map fresher than you found it.","sponsor_surface":"progress"}'::jsonb,
  '[
    {"chapter":1,"code":"signal_hunt","title":"Signal Hunt","subtitle":"Find what the map does not know yet.","unlock_xp":0,"mechanics":["flash_quests","freshness_hunts"],"surprise":"Mystery signal drops appear as nearby evidence gaps."},
    {"chapter":2,"code":"trust_trail","title":"Trust Trail","subtitle":"Turn isolated facts into trustworthy places.","unlock_xp":600,"mechanics":["missions","verified_sequences"],"surprise":"Complete mixed evidence chains to reveal the next checkpoint."},
    {"chapter":3,"code":"city_pulse","title":"City Pulse","subtitle":"Move together and make a visible dent in stale data.","unlock_xp":1500,"mechanics":["community_campaigns","rival_ladders"],"surprise":"Community milestones reveal shared boosts and bonus objectives."},
    {"chapter":4,"code":"guardian_run","title":"Guardian Run","subtitle":"Finish the season as someone the network can rely on.","unlock_xp":3000,"mechanics":["journey_finale","contests","trust_rank"],"surprise":"Final-week objectives scale with your specialty and trust history."}
  ]'::jsonb,
  '[
    {"xp":0,"label":"Season entry","reward":"Freshness Run profile frame"},
    {"xp":500,"label":"Signal Scout","reward":"Bonus quest reveal"},
    {"xp":1200,"label":"Trail Builder","reward":"Collection spotlight + league flair"},
    {"xp":2200,"label":"City Pulse","reward":"Community challenge boost"},
    {"xp":3500,"label":"Trust Guardian","reward":"Season 01 completion mark"}
  ]'::jsonb,
  '{"season_number":1,"engagement_surfaces":["progress","community","game_center"],"urgent_discovery_ads":false}'::jsonb,
  now()
)
on conflict(code) do update set
 name=excluded.name,label=excluded.label,description=excluded.description,status=excluded.status,
 starts_at=excluded.starts_at,ends_at=excluded.ends_at,theme=excluded.theme,chapters=excluded.chapters,
 reward_track=excluded.reward_track,rules=excluded.rules,updated_at=now();

insert into public.progression_badge_collections(code,season_id,name,description,icon,badge_codes,reward,sort_order,active,updated_at)
select x.code,s.id,x.name,x.description,x.icon,x.badge_codes,x.reward,x.sort_order,true,now()
from public.progression_seasons s
cross join (values
 ('fresh-evidence','Fresh Evidence','Build a reputation for proving what is true right now.','🛡️',array['trust-first-visit','freshness-keeper','trusted-contributor','verified-contributor']::text[],'{"completion_reward":"Fresh Evidence collector mark"}'::jsonb,10),
 ('field-guide','Field Guide','Become the reviewer people trust when they need an actual answer.','📖',array['review-first-hand','review-field-guide','review-community-trusted','quest-finisher']::text[],'{"completion_reward":"Field Guide collector mark"}'::jsonb,20),
 ('network-scout','Network Scout','Map the details that turn a pin into a useful stop.','🧭',array['amenity-scout','amenity-auditor','explorer-25','occupancy-scout']::text[],'{"completion_reward":"Network Scout collector mark"}'::jsonb,30),
 ('streak-and-skill','Streak & Skill','Show up consistently and build a durable Kleenest career.','🔥',array['streak-seven','streak-thirty','points-1000','quest-veteran']::text[],'{"completion_reward":"Streak & Skill collector mark"}'::jsonb,40)
) as x(code,name,description,icon,badge_codes,reward,sort_order)
where s.code='freshness_run_2026'
on conflict(code) do update set
 season_id=excluded.season_id,name=excluded.name,description=excluded.description,icon=excluded.icon,
 badge_codes=excluded.badge_codes,reward=excluded.reward,sort_order=excluded.sort_order,active=true,updated_at=now();

-- Season objectives keep the existing canonical objective ledger, but add richer mechanics as metadata.
insert into public.progression_objectives_v2(kind,code,title,description,status,starts_at,ends_at,rules,rewards,scope)
values
 ('quest','season01-signal-scout','Signal Scout','Find one stale truth and refresh it before somebody else relies on it.','active','2026-09-13T00:00:00Z','2026-11-09T05:59:59Z',
  '{"action":"reverify_stale","target":1,"mechanic":"flash_quest","surprise":"mystery_bonus","trust_eligible":true}'::jsonb,
  '{"xp":120,"season_xp":120,"reveal":"Signal cache"}'::jsonb,
  '{"season_code":"freshness_run_2026","chapter":"signal_hunt","audience":"consumer"}'::jsonb),
 ('mission','season01-proof-thread','Proof Thread','Build five pieces of useful restroom evidence into a visible trust trail.','active','2026-09-13T00:00:00Z','2026-10-12T05:59:59Z',
  '{"actions":["add_amenity","add_accessibility","substantive_review","add_photo","verify_location"],"target":5,"mechanic":"evidence_chain","trust_eligible":true}'::jsonb,
  '{"xp":350,"season_xp":350,"reveal":"Trust Trail checkpoint"}'::jsonb,
  '{"season_code":"freshness_run_2026","chapter":"trust_trail","audience":"consumer"}'::jsonb),
 ('challenge','season01-freshness-pressure','72-Hour Freshness Pressure','Reverify three stale locations while the challenge window is hot.','active','2026-09-13T00:00:00Z','2026-09-21T05:59:59Z',
  '{"action":"reverify_stale","target":3,"mechanic":"timed_pressure","window_hours":72,"trust_eligible":true}'::jsonb,
  '{"xp":300,"season_xp":300,"badge_progress":"fresh-evidence"}'::jsonb,
  '{"season_code":"freshness_run_2026","chapter":"signal_hunt","audience":"consumer"}'::jsonb),
 ('journey','season01-city-trail','The City Trail','Build a twelve-action trail through discovery, verification and useful evidence. Four chapter thresholds reveal as you move.','active','2026-09-13T00:00:00Z','2026-11-09T05:59:59Z',
  '{"actions":["discover_gps","discover_onsite_live","verify_location","reverify_stale","add_amenity","add_accessibility","substantive_review"],"target":12,"mechanic":"chapter_journey","chapters":[3,6,9,12],"trust_eligible":true}'::jsonb,
  '{"xp":900,"season_xp":900,"completion":"Season journey mark"}'::jsonb,
  '{"season_code":"freshness_run_2026","chapter":"guardian_run","audience":"consumer"}'::jsonb),
 ('campaign','season01-accessibility-pulse','Accessibility Pulse','The community is racing together to add 250 fresh accessibility signals. Your personal contribution target is four.','active','2026-09-13T00:00:00Z','2026-10-18T05:59:59Z',
  '{"action":"add_accessibility","target":4,"community_target":250,"mechanic":"community_meter","trust_eligible":true}'::jsonb,
  '{"xp":400,"season_xp":400,"community_reveal":"City Pulse bonus week"}'::jsonb,
  '{"season_code":"freshness_run_2026","chapter":"city_pulse","audience":"consumer"}'::jsonb),
 ('contest','season01-evidence-cup','Fresh Evidence Cup','Climb the seasonal photo-evidence ladder. Personal completion is six useful photos; placement is determined by contribution score.','active','2026-09-13T00:00:00Z','2026-09-28T05:59:59Z',
  '{"action":"add_photo","target":6,"mechanic":"ranked_contest","ranking_metric":"photos","trust_eligible":true}'::jsonb,
  '{"xp":450,"season_xp":450,"prize_ladder":[{"place":1,"reward":"Fresh Evidence Cup champion mark"},{"place":3,"reward":"Podium mark"},{"place":10,"reward":"Top 10 mark"}]}'::jsonb,
  '{"season_code":"freshness_run_2026","chapter":"city_pulse","audience":"consumer"}'::jsonb)
on conflict(code) do update set
 title=excluded.title,description=excluded.description,status=excluded.status,starts_at=excluded.starts_at,
 ends_at=excluded.ends_at,rules=excluded.rules,rewards=excluded.rewards,scope=excluded.scope;

-- Retire stale generated objectives and legacy contests so Progress does not look like a test catalog.
update public.progression_objectives_v2
set status='ended'
where status='active' and ends_at is not null and ends_at<now();

update public.contests
set status='completed'
where status='active' and ends_at<now();

-- Keep duplicate badge history, but hide duplicate catalog entries rather than deleting earned history.
update public.badges
set criteria=coalesce(criteria,'{}'::jsonb)||'{"catalog_hidden":true,"catalog_status":"legacy"}'::jsonb
where code in(
 'five_star_reviewer','five-star-reviewer','first_checkin','first-check-in','first-checkin',
 'first_review','first-review','reviewer','month_master','month-streak','week-streak','week_warrior','week-warrior',
 'point_collector','point-collector'
);

create or replace function public.consumer_progression_world()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_season public.progression_seasons%rowtype;
  v_season_xp bigint:=0;
  v_total_xp bigint:=0;
  v_collections jsonb:='[]'::jsonb;
  v_campaign jsonb;
  v_contest jsonb;
  v_rivals jsonb:='[]'::jsonb;
  v_reputation public.contributor_reputation%rowtype;
  v_contribution_xp bigint:=0;
  v_progression_bonus integer:=0;
  v_evidence_cap integer:=20;
  v_trust_score integer:=0;
  v_trust_rank text:='New';
  v_next_trust integer:=20;
begin
  if v_user is null then raise exception 'authentication required'; end if;

  select * into v_season
  from public.progression_seasons s
  where s.status='active' and s.starts_at<=now() and s.ends_at>=now()
  order by s.starts_at desc
  limit 1;

  select coalesce(sum(e.xp_awarded),0)::bigint into v_total_xp
  from public.progression_events_v2 e
  where e.user_id=v_user and e.status='awarded';

  if v_season.id is not null then
    select coalesce(sum(e.xp_awarded),0)::bigint into v_season_xp
    from public.progression_events_v2 e
    where e.user_id=v_user and e.status='awarded'
      and e.created_at between v_season.starts_at and v_season.ends_at;
  end if;

  select coalesce(sum(e.xp_awarded),0)::bigint into v_contribution_xp
  from public.progression_events_v2 e
  where e.user_id=v_user and e.status='awarded'
    and e.action in(
      'verify_location','reverify_stale','substantive_review','add_accessibility',
      'add_amenity','add_photo','helpful_contribution','discover_gps','discover_onsite_live'
    );

  select * into v_reputation from public.contributor_reputation where user_id=v_user;
  if not found then
    v_reputation.reputation_score:=0;
    v_reputation.verified_checkins_count:=0;
    v_reputation.confirmed_observations_count:=0;
    v_reputation.verification_level:='new';
  end if;

  v_progression_bonus:=case
    when v_contribution_xp>=10000 then 20
    when v_contribution_xp>=6000 then 16
    when v_contribution_xp>=3000 then 12
    when v_contribution_xp>=1500 then 8
    when v_contribution_xp>=750 then 5
    when v_contribution_xp>=250 then 2
    else 0 end;

  v_evidence_cap:=case
    when coalesce(v_reputation.verified_checkins_count,0)=0 then 19
    when coalesce(v_reputation.verified_checkins_count,0)<4 or coalesce(v_reputation.confirmed_observations_count,0)<2 then 39
    when coalesce(v_reputation.verified_checkins_count,0)<10 or coalesce(v_reputation.confirmed_observations_count,0)<4 then 69
    else 100 end;

  v_trust_score:=least(v_evidence_cap,greatest(0,round(coalesce(v_reputation.reputation_score,0))::integer+v_progression_bonus));
  v_trust_rank:=case when v_trust_score>=90 then 'Trust Guardian' when v_trust_score>=70 then 'Verified'
    when v_trust_score>=40 then 'Trusted' when v_trust_score>=20 then 'Contributor' else 'New' end;
  v_next_trust:=case when v_trust_score<20 then 20 when v_trust_score<40 then 40 when v_trust_score<70 then 70 when v_trust_score<90 then 90 else 100 end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code',c.code,'name',c.name,'description',c.description,'icon',c.icon,'badge_codes',c.badge_codes,
    'earned_count',(select count(*) from public.user_badges ub join public.badges b on b.id=ub.badge_id where ub.user_id=v_user and b.code=any(c.badge_codes)),
    'total_count',cardinality(c.badge_codes),'reward',c.reward
  ) order by c.sort_order,c.name),'[]'::jsonb)
  into v_collections
  from public.progression_badge_collections c
  where c.active and (c.season_id is null or c.season_id=v_season.id);

  select jsonb_build_object(
    'id',o.id,'code',o.code,'title',o.title,'description',o.description,'rules',o.rules,'rewards',o.rewards,
    'progress',coalesce(up.progress,0),'target',coalesce(up.target,(o.rules->>'target')::numeric,1),
    'community_progress',(
      select count(*) from public.progression_events_v2 e
      where e.status='awarded' and e.created_at>=coalesce(o.starts_at,v_season.starts_at)
        and e.created_at<=coalesce(o.ends_at,v_season.ends_at)
        and (e.action=o.rules->>'action' or coalesce(o.rules->'actions','[]'::jsonb)?e.action)
    ),
    'community_target',coalesce((o.rules->>'community_target')::integer,0)
  ) into v_campaign
  from public.progression_objectives_v2 o
  left join public.user_objective_progress_v2 up on up.objective_id=o.id and up.user_id=v_user
  where o.kind='campaign' and o.status='active' and o.scope->>'season_code'=v_season.code
    and (o.starts_at is null or o.starts_at<=now()) and (o.ends_at is null or o.ends_at>=now())
  order by o.starts_at desc nulls last limit 1;

  select jsonb_build_object(
    'id',o.id,'code',o.code,'title',o.title,'description',o.description,'rules',o.rules,'rewards',o.rewards,
    'progress',coalesce(up.progress,0),'target',coalesce(up.target,(o.rules->>'target')::numeric,1)
  ) into v_contest
  from public.progression_objectives_v2 o
  left join public.user_objective_progress_v2 up on up.objective_id=o.id and up.user_id=v_user
  where o.kind='contest' and o.status='active' and o.scope->>'season_code'=v_season.code
    and (o.starts_at is null or o.starts_at<=now()) and (o.ends_at is null or o.ends_at>=now())
  order by o.starts_at desc nulls last limit 1;

  with connected as(
    select f.following_id user_id from public.follows f where f.follower_id=v_user
    union
    select f.follower_id user_id from public.follows f where f.following_id=v_user
    union
    select v_user
  ), scores as(
    select c.user_id,coalesce(sum(e.xp_awarded),0)::bigint score
    from connected c
    left join public.progression_events_v2 e on e.user_id=c.user_id and e.status='awarded'
      and (v_season.id is null or e.created_at between v_season.starts_at and v_season.ends_at)
    group by c.user_id
  ), ranked as(
    select s.user_id,s.score,dense_rank() over(order by s.score desc,s.user_id) rank
    from scores s
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',r.user_id,'display_name',coalesce(p.display_name,p.username,'Kleenest contributor'),
    'score',r.score,'rank',r.rank,'is_current_user',r.user_id=v_user
  ) order by r.rank limit 12),'[]'::jsonb)
  into v_rivals
  from ranked r join public.profiles p on p.id=r.user_id
  where coalesce(p.is_demo_test,false)=false;

  return jsonb_build_object(
    'season',case when v_season.id is null then null else jsonb_build_object(
      'id',v_season.id,'code',v_season.code,'name',v_season.name,'label',v_season.label,
      'description',v_season.description,'starts_at',v_season.starts_at,'ends_at',v_season.ends_at,
      'theme',v_season.theme,'chapters',v_season.chapters,'reward_track',v_season.reward_track,
      'rules',v_season.rules,'season_xp',v_season_xp,
      'days_remaining',greatest(0,ceil(extract(epoch from(v_season.ends_at-now()))/86400.0)::integer)
    ) end,
    'badge_collections',v_collections,
    'community_campaign',v_campaign,
    'featured_contest',v_contest,
    'rivals',v_rivals,
    'contributor_trust',jsonb_build_object(
      'score',v_trust_score,'rank',v_trust_rank,'next_rank_score',v_next_trust,
      'evidence_score',round(coalesce(v_reputation.reputation_score,0))::integer,
      'evidence_level',coalesce(v_reputation.verification_level,'new'),
      'verified_checkins',coalesce(v_reputation.verified_checkins_count,0),
      'confirmed_observations',coalesce(v_reputation.confirmed_observations_count,0),
      'evidence_backed_progression_xp',v_contribution_xp,'progression_bonus',v_progression_bonus,
      'evidence_cap',v_evidence_cap,
      'explanation','Trust grows with verified evidence and evidence-backed progression. Game play can improve mastery and League standing but does not directly raise Contributor Trust.'
    ),
    'lifetime_xp',v_total_xp,
    'generated_at',now()
  );
end;
$$;

revoke all on function public.consumer_progression_world() from public,anon;
grant execute on function public.consumer_progression_world() to authenticated,service_role;
