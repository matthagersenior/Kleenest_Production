-- Expanded progression reward inventory, equipable identity, regional/specialty unlocks, secret achievements,
-- and advanced Game Center arenas. Owner grants remain an explicit bypass and platform owners retain full access.

alter table public.progression_reward_catalog
  drop constraint if exists progression_reward_catalog_reward_kind_check;
alter table public.progression_reward_catalog
  add constraint progression_reward_catalog_reward_kind_check
  check (reward_kind in (
    'theme','badge_showcase','profile_space','title','profile_frame','profile_background','map_flair',
    'checkin_animation','reaction_pack','collection_slot','mission_reroll','quest_slot','streak_shield',
    'map_filter','community_challenge','community_vote','beta_access','stats_pack','verification_privilege'
  ));

create table if not exists public.user_progression_reward_equipment (
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot text not null check (slot in (
    'theme','title','profile_frame','profile_background','map_flair','checkin_animation','reaction_pack','map_filter'
  )),
  reward_code text not null references public.progression_reward_catalog(code) on delete cascade,
  equipped_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,slot)
);
create index if not exists user_progression_reward_equipment_reward_idx
  on public.user_progression_reward_equipment(reward_code,user_id);
alter table public.user_progression_reward_equipment enable row level security;
revoke all on table public.user_progression_reward_equipment from anon,authenticated;

insert into public.progression_reward_catalog
(code,reward_kind,reward_key,name,description,active,owner_only,progression_unlock_enabled,min_global_level,min_trust_score,min_lifetime_xp,min_badges,sort_order,metadata)
values
('theme_founders_edition','theme','founders','Founders Edition','Permanent early-builder identity for the people who helped shape Kleenest before launch.',true,true,false,1,0,0,0,101,
 '{"family":"identity","rarity":"founder","owner_grant_only":true,"persistent":true}'::jsonb),
('theme_clean_slate','theme','clean-slate','Clean Slate','A precise, clinical environment for accuracy-first contributors.',true,false,true,8,20,7000,2,200,
 '{"family":"identity","discipline":"accuracy","persistent":true}'::jsonb),
('theme_midnight_transit','theme','midnight-transit','Midnight Transit','A late-night transit edition for contributors who keep the network useful after dark.',true,false,true,15,30,20000,4,210,
 '{"family":"identity","specialty_actions":["verify_location","reverify_stale"],"specialty_target":25,"persistent":true}'::jsonb),
('theme_neon_city','theme','neon-city','Neon City','Dense-market night energy for experienced urban explorers.',true,false,true,20,35,35000,5,220,
 '{"family":"identity","specialty_actions":["discover_gps","discover_onsite_live"],"specialty_target":20,"persistent":true}'::jsonb),
('theme_trailblazer','theme','trailblazer','Trailblazer','Topographic field colors for contributors who expand sparse coverage.',true,false,true,18,30,28000,4,230,
 '{"family":"identity","specialty_actions":["discover_gps","discover_onsite_live"],"specialty_target":30,"persistent":true}'::jsonb),
('theme_verified_gold','theme','verified-gold','Verified Gold','Charcoal and gold prestige for deeply trusted contributors.',true,false,true,60,80,450000,12,240,
 '{"family":"prestige","persistent":true}'::jsonb),
('theme_civic_atlas','theme','civic-atlas','Civic Atlas','Cartographic precision for contributors building broad verified coverage.',true,false,true,35,50,120000,7,250,
 '{"family":"identity","specialty_actions":["add_amenity","add_accessibility","verify_location"],"specialty_target":45,"persistent":true}'::jsonb),
('theme_road_warrior','theme','road-warrior','Road Warrior','An asphalt-and-safety-orange edition for frequent travelers.',true,false,true,30,45,90000,6,260,
 '{"family":"identity","specialty_actions":["discover_gps","verify_location"],"specialty_target":40,"persistent":true}'::jsonb),
('theme_community_builder','theme','community-builder','Community Builder','Warm social surfaces for contributors whose work helps other people decide.',true,false,true,25,40,65000,5,270,
 '{"family":"identity","specialty_actions":["helpful_contribution","substantive_review"],"specialty_target":35,"persistent":true}'::jsonb),
('theme_data_guardian','theme','data-guardian','Data Guardian','A radar-grid dark edition for verification and data-quality specialists.',true,false,true,55,75,350000,11,280,
 '{"family":"prestige","specialty_actions":["reverify_stale","verify_location"],"specialty_target":75,"persistent":true}'::jsonb),
('theme_spring_renewal','theme','spring-renewal','Spring Renewal','Fresh mint and blossom surfaces for the spring contribution season.',true,false,true,12,25,15000,3,290,
 '{"family":"seasonal","season":"spring","persistent":true}'::jsonb),
('theme_summer_roadtrip','theme','summer-roadtrip','Summer Roadtrip','Sky, sand and roadside citrus for warm-weather travel.',true,false,true,18,30,28000,4,300,
 '{"family":"seasonal","season":"summer","persistent":true}'::jsonb),
('theme_stl_edition','theme','stl-edition','St. Louis Edition','A regional Arch-inspired edition earned through meaningful St. Louis network contribution.',true,false,true,15,25,18000,3,310,
 '{"family":"market","market_state":"MO","market_cities":["st. louis","saint louis","clayton","university city","maplewood","brentwood","kirkwood","webster groves"],"market_target":20,"persistent":true}'::jsonb),
('theme_chicago_edition','theme','chicago-edition','Chicago Edition','A lakefront-and-steel edition earned through meaningful Chicago network contribution.',true,false,true,15,25,18000,3,320,
 '{"family":"market","market_state":"IL","market_cities":["chicago","evanston","oak park","skokie","cicero"],"market_target":20,"persistent":true}'::jsonb),

('frame_fresh_signal','profile_frame','fresh-signal','Fresh Signal Frame','A clean freshness-ring profile frame.',true,false,true,6,15,4000,1,400,
 '{"equip_slot":"profile_frame","visual":"freshness_ring"}'::jsonb),
('frame_trust_guardian','profile_frame','trust-guardian','Trust Guardian Frame','A rare public frame for high-trust contributors.',true,false,true,70,90,600000,15,410,
 '{"equip_slot":"profile_frame","visual":"guardian_ring"}'::jsonb),
('background_field_notes','profile_background','field-notes','Field Notes','A cartographic notebook background for contributor profiles.',true,false,true,10,20,10000,2,420,
 '{"equip_slot":"profile_background","visual":"field_notes"}'::jsonb),
('background_city_grid','profile_background','city-grid','City Grid','A dense urban grid background for public profiles.',true,false,true,30,45,85000,6,421,
 '{"equip_slot":"profile_background","visual":"city_grid"}'::jsonb),
('map_flair_heat_halo','map_flair','freshness-halo','Freshness Halo','Adds a freshness-inspired halo to your public map contribution identity.',true,false,true,20,35,40000,5,430,
 '{"equip_slot":"map_flair","visual":"heat_halo"}'::jsonb),
('map_flair_gold_ring','map_flair','gold-ring','Verified Gold Ring','A rare gold map flair for verified contributors.',true,false,true,60,80,450000,12,431,
 '{"equip_slot":"map_flair","visual":"gold_ring"}'::jsonb),
('checkin_animation_ripple','checkin_animation','signal-ripple','Signal Ripple','A richer verification ripple when a check-in is accepted.',true,false,true,12,25,15000,3,440,
 '{"equip_slot":"checkin_animation","visual":"signal_ripple"}'::jsonb),
('checkin_animation_guardian','checkin_animation','guardian-lock','Guardian Lock','A premium verification animation for Trust Guardians.',true,false,true,70,90,600000,15,441,
 '{"equip_slot":"checkin_animation","visual":"guardian_lock"}'::jsonb),
('reaction_pack_signal','reaction_pack','signal-pack','Signal Reaction Pack','Unlocks freshness, evidence and route reactions in Community.',true,false,true,14,25,18000,3,450,
 '{"equip_slot":"reaction_pack","reactions":["fresh","verified","route","helpful"]}'::jsonb),
('reaction_pack_guardian','reaction_pack','guardian-pack','Guardian Reaction Pack','A rare community reaction set for high-trust contributors.',true,false,true,65,85,520000,13,451,
 '{"equip_slot":"reaction_pack","reactions":["guardian","gold","resolved","evidence"]}'::jsonb),
('map_filter_precision','map_filter','precision','Precision Filters','Unlocks advanced freshness, trust and evidence-density map filters.',true,false,true,22,35,50000,5,460,
 '{"equip_slot":"map_filter","filters":["freshness_precision","trust_density","evidence_gaps"]}'::jsonb),
('map_filter_progression','map_filter','progression-opportunities','Progression Opportunity Filter','Highlights nearby locations that can advance missions and specialty tracks.',true,false,true,16,25,22000,3,461,
 '{"equip_slot":"map_filter","filters":["progression_opportunities"]}'::jsonb),

('title_pathfinder','title','Pathfinder','Pathfinder','Public title for contributors building reliable trails.',true,false,true,10,20,10000,2,470,
 '{"equip_slot":"title"}'::jsonb),
('title_cartographer','title','Cartographer','Cartographer','Specialty title earned through sustained discovery work.',true,false,true,20,30,30000,4,471,
 '{"equip_slot":"title","specialty_actions":["discover_gps","discover_onsite_live"],"specialty_target":40}'::jsonb),
('title_atlas_guardian','title','Atlas Guardian','Atlas Guardian','Top discovery specialty title for broad trusted coverage.',true,false,true,55,70,300000,10,472,
 '{"equip_slot":"title","specialty_actions":["discover_gps","discover_onsite_live","verify_location"],"specialty_target":100}'::jsonb),
('title_verifier','title','Verifier','Verifier','Public title for contributors specializing in current evidence.',true,false,true,18,35,30000,4,473,
 '{"equip_slot":"title","specialty_actions":["verify_location","reverify_stale"],"specialty_target":35}'::jsonb),
('title_trusted_witness','title','Trusted Witness','Trusted Witness','Advanced verification title earned through repeated evidence work.',true,false,true,35,55,130000,7,474,
 '{"equip_slot":"title","specialty_actions":["verify_location","reverify_stale","substantive_review"],"specialty_target":70}'::jsonb),
('title_evidence_guardian','title','Evidence Guardian','Evidence Guardian','Top verification specialty title.',true,false,true,65,85,500000,13,475,
 '{"equip_slot":"title","specialty_actions":["verify_location","reverify_stale","substantive_review","add_photo"],"specialty_target":140}'::jsonb),

('showcase_slot_plus_one','collection_slot','showcase-plus-one','Showcase Slot +1','Adds one permanent public progression showcase slot.',true,false,true,20,35,45000,5,480,
 '{"showcase_slot_bonus":1}'::jsonb),
('saved_collection_plus_five','collection_slot','saved-plus-five','Saved Collection Expansion','Adds five extra curated saved-place collection slots.',true,false,true,15,25,20000,3,481,
 '{"saved_collection_bonus":5}'::jsonb),
('mission_reroll_daily','mission_reroll','daily-reroll','Mission Reroll','Unlocks one mission reroll charge in the reward capability layer.',true,false,true,18,30,28000,4,490,
 '{"mission_rerolls":1}'::jsonb),
('quest_slot_bonus','quest_slot','bonus-quest-slot','Bonus Quest Slot','Unlocks one additional simultaneous bonus quest slot.',true,false,true,25,40,65000,5,491,
 '{"quest_slots":1}'::jsonb),
('streak_shield','streak_shield','streak-shield','Streak Shield','Unlocks a progression streak-protection capability.',true,false,true,30,45,90000,6,492,
 '{"streak_shields":1}'::jsonb),
('community_challenge_creator','community_challenge','challenge-creator','Community Challenge Creator','Unlocks contributor-created community challenge capability.',true,false,true,40,60,175000,8,493,
 '{"community_challenge_creator":true}'::jsonb),
('community_vote_privilege','community_vote','network-vote','Network Vote','Unlocks voting on proposed community amenity and taxonomy improvements.',true,false,true,35,55,135000,7,494,
 '{"community_vote":true}'::jsonb),
('beta_access_lab','beta_access','labs','Kleenest Labs Access','Unlocks opt-in experimental consumer features before general release.',true,false,true,28,45,80000,6,495,
 '{"beta_access":true}'::jsonb),
('stats_pack_impact','stats_pack','impact-stats','Contributor Impact Analytics','Unlocks advanced personal impact, freshness and verification analytics.',true,false,true,32,50,110000,7,496,
 '{"stats_pack":true}'::jsonb),
('verification_privilege_disputes','verification_privilege','dispute-verifier','Disputed Data Verification','Unlocks invitation-only disputed-data verification missions.',true,false,true,55,75,325000,11,497,
 '{"verification_privilege":true}'::jsonb),

('achievement_night_owl','badge_showcase','night-owl','Night Owl','Secret achievement for repeatedly contributing trustworthy evidence late at night.',true,false,true,8,15,5000,1,520,
 '{"secret":true,"badge_code":"secret-night-owl","late_night_target":5,"specialty_actions":["verify_location","reverify_stale","discover_onsite_live"]}'::jsonb),
('achievement_first_responder','badge_showcase','first-responder','First Responder','Secret achievement for repeatedly refreshing stale information before others rely on it.',true,false,true,10,20,8000,2,521,
 '{"secret":true,"badge_code":"secret-first-responder","specialty_actions":["reverify_stale"],"specialty_target":10}'::jsonb),
('achievement_needle_haystack','badge_showcase','needle-haystack','Needle in the Haystack','Secret achievement for finding and proving useful locations where the network had weak evidence.',true,false,true,14,25,18000,3,522,
 '{"secret":true,"badge_code":"secret-needle-haystack","specialty_actions":["discover_onsite_live"],"specialty_target":12,"min_evidence_tier":4}'::jsonb),
('achievement_arcade_architect','badge_showcase','arcade-architect','Arcade Architect','Secret achievement for mastering the advanced Kleenest arenas.',true,false,true,12,0,12000,2,523,
 '{"secret":true,"badge_code":"secret-arcade-architect","game_codes":["freshness_flow","signal_stack","trust_tower","route_rush"],"game_plays_target":12}'::jsonb)
on conflict (code) do update set
 reward_kind=excluded.reward_kind,reward_key=excluded.reward_key,name=excluded.name,description=excluded.description,
 active=excluded.active,owner_only=excluded.owner_only,progression_unlock_enabled=excluded.progression_unlock_enabled,
 min_global_level=excluded.min_global_level,min_trust_score=excluded.min_trust_score,min_lifetime_xp=excluded.min_lifetime_xp,
 min_badges=excluded.min_badges,sort_order=excluded.sort_order,metadata=excluded.metadata,updated_at=now();

insert into public.badges(code,name,description,icon,criteria)
values
('secret-night-owl','Night Owl','A hidden achievement for reliable late-night evidence.','🌙','{"type":"secret_progression","secret":true,"public_showcase":true}'::jsonb),
('secret-first-responder','First Responder','A hidden achievement for refreshing stale information quickly.','⚡','{"type":"secret_progression","secret":true,"public_showcase":true}'::jsonb),
('secret-needle-haystack','Needle in the Haystack','A hidden achievement for proving useful low-confidence discoveries.','🧭','{"type":"secret_progression","secret":true,"public_showcase":true}'::jsonb),
('secret-arcade-architect','Arcade Architect','A hidden achievement for repeated mastery in advanced Game Center arenas.','🕹️','{"type":"secret_progression","secret":true,"public_showcase":true}'::jsonb)
on conflict(code) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,criteria=excluded.criteria;

create or replace function internal.progression_reward_eligible(p_user_id uuid,p_reward_code text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  c public.progression_reward_catalog%rowtype;
  identity jsonb;
  event_count integer:=0;
  market_count integer:=0;
  game_count integer:=0;
  target integer:=0;
  min_tier integer:=1;
begin
  if p_user_id is null or p_reward_code is null then return false; end if;
  select * into c from public.progression_reward_catalog where code=p_reward_code and active;
  if not found or c.owner_only or not c.progression_unlock_enabled then return false; end if;

  identity:=internal.progression_public_identity(p_user_id);
  if coalesce((identity->>'level')::integer,1)<c.min_global_level
    or coalesce((identity->>'trust_score')::integer,0)<c.min_trust_score
    or coalesce((identity->>'lifetime_xp')::bigint,0)<c.min_lifetime_xp
    or coalesce((identity->>'badge_count')::integer,0)<c.min_badges then
    return false;
  end if;

  target:=coalesce((c.metadata->>'specialty_target')::integer,0);
  if target>0 and jsonb_typeof(c.metadata->'specialty_actions')='array' then
    min_tier:=greatest(1,coalesce((c.metadata->>'min_evidence_tier')::integer,1));
    select count(*)::integer into event_count
    from public.progression_events_v2 e
    where e.user_id=p_user_id and e.status='awarded' and e.evidence_tier>=min_tier
      and exists(select 1 from jsonb_array_elements_text(c.metadata->'specialty_actions') a(value) where a.value=e.action);
    if event_count<target then return false; end if;
  end if;

  target:=coalesce((c.metadata->>'market_target')::integer,0);
  if target>0 and jsonb_typeof(c.metadata->'market_cities')='array' then
    select count(distinct e.location_id)::integer into market_count
    from public.progression_events_v2 e
    join public.locations l on l.id=e.location_id
    where e.user_id=p_user_id and e.status='awarded'
      and lower(coalesce(l.state,''))=lower(coalesce(c.metadata->>'market_state',l.state,''))
      and exists(select 1 from jsonb_array_elements_text(c.metadata->'market_cities') city(value) where lower(city.value)=lower(coalesce(l.city,'')));
    if market_count<target then return false; end if;
  end if;

  target:=coalesce((c.metadata->>'late_night_target')::integer,0);
  if target>0 then
    select count(*)::integer into event_count
    from public.progression_events_v2 e
    where e.user_id=p_user_id and e.status='awarded'
      and (extract(hour from e.created_at at time zone 'America/Chicago')>=22 or extract(hour from e.created_at at time zone 'America/Chicago')<5)
      and (
        jsonb_typeof(c.metadata->'specialty_actions')<>'array'
        or exists(select 1 from jsonb_array_elements_text(c.metadata->'specialty_actions') a(value) where a.value=e.action)
      );
    if event_count<target then return false; end if;
  end if;

  target:=coalesce((c.metadata->>'game_plays_target')::integer,0);
  if target>0 and jsonb_typeof(c.metadata->'game_codes')='array' then
    select count(*)::integer into game_count
    from public.progression_metric_events e
    join public.progression_games g on g.id=e.source_id
    where e.user_id=p_user_id and e.metric='game_score' and e.source_type='game'
      and exists(select 1 from jsonb_array_elements_text(c.metadata->'game_codes') gc(value) where gc.value=g.code);
    if game_count<target then return false; end if;
  end if;

  return true;
end
$$;

revoke all on function internal.progression_reward_eligible(uuid,text) from public,anon,authenticated;

create or replace function internal.award_progression_rewards(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer:=0;
begin
  if p_user_id is null then return 0; end if;

  with eligible as (
    select c.code,c.reward_kind,c.metadata
    from public.progression_reward_catalog c
    where c.active and c.progression_unlock_enabled and not c.owner_only
      and internal.progression_reward_eligible(p_user_id,c.code)
      and not exists(
        select 1 from public.user_progression_reward_grants g
        where g.user_id=p_user_id and g.reward_code=c.code and g.revoked_at is null
      )
  ), inserted as (
    insert into public.user_progression_reward_grants(user_id,reward_code,granted_by,source,reason)
    select p_user_id,e.code,null,'progression','Earned automatically through Kleenest progression'
    from eligible e
    on conflict do nothing
    returning reward_code
  ), badge_rewards as (
    select i.reward_code,c.metadata->>'badge_code' badge_code
    from inserted i
    join public.progression_reward_catalog c on c.code=i.reward_code
    where c.reward_kind='badge_showcase' and nullif(c.metadata->>'badge_code','') is not null
  ), badge_insert as (
    insert into public.user_badges(user_id,badge_id)
    select p_user_id,b.id
    from badge_rewards r
    join public.badges b on b.code=r.badge_code
    on conflict do nothing
    returning 1
  )
  select count(*)::integer into v_count from inserted;

  return v_count;
end
$$;

revoke all on function internal.award_progression_rewards(uuid) from public,anon,authenticated;

create or replace function internal.award_progression_theme_rewards(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
begin
  return internal.award_progression_rewards(p_user_id);
end
$$;
revoke all on function internal.award_progression_theme_rewards(uuid) from public,anon,authenticated;

create or replace function internal.award_progression_identity_badges(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_identity jsonb;
  v_level integer;
  v_trust integer;
  v_count integer:=0;
begin
  if p_user_id is null then return 0; end if;
  v_identity:=internal.progression_public_identity(p_user_id);
  v_level:=coalesce((v_identity->>'level')::integer,1);
  v_trust:=coalesce((v_identity->>'trust_score')::integer,0);

  with eligible as (
    select b.id
    from public.badges b
    where b.criteria->>'type'='progression_identity'
      and v_level>=coalesce((b.criteria->>'min_level')::integer,1)
      and v_trust>=coalesce((b.criteria->>'min_trust')::integer,0)
  ), inserted as (
    insert into public.user_badges(user_id,badge_id)
    select p_user_id,id from eligible
    on conflict do nothing
    returning 1
  )
  select count(*)::integer into v_count from inserted;

  perform internal.award_progression_rewards(p_user_id);
  return v_count;
end
$$;
revoke all on function internal.award_progression_identity_badges(uuid) from public,anon,authenticated;

create or replace function internal.progression_public_identity(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_total_xp bigint:=0;
  v_level jsonb:='{}'::jsonb;
  v_level_no integer:=1;
  v_level_title text:='Scout';
  v_rep public.contributor_reputation%rowtype;
  v_contribution_xp bigint:=0;
  v_progression_bonus integer:=0;
  v_evidence_cap integer:=19;
  v_trust_score integer:=0;
  v_trust_rank text:='New';
  v_badges integer:=0;
  v_slots integer:=1;
  v_bonus_slots integer:=0;
  v_equipped jsonb:='{}'::jsonb;
begin
  if p_user_id is null then return '{}'::jsonb; end if;

  select coalesce(sum(e.xp_awarded),0)::bigint into v_total_xp
  from public.progression_events_v2 e
  where e.user_id=p_user_id and e.status='awarded';

  v_level:=public._progression_level_for_xp(v_total_xp);
  v_level_no:=coalesce((v_level->>'level')::integer,1);
  v_level_title:=coalesce(v_level->>'title','Scout');

  select * into v_rep from public.contributor_reputation where user_id=p_user_id;
  if not found then
    v_rep.reputation_score:=0;
    v_rep.verified_checkins_count:=0;
    v_rep.confirmed_observations_count:=0;
    v_rep.verification_level:='new';
  end if;

  select coalesce(sum(e.xp_awarded),0)::bigint into v_contribution_xp
  from public.progression_events_v2 e
  where e.user_id=p_user_id and e.status='awarded'
    and e.action in(
      'verify_location','reverify_stale','substantive_review','add_accessibility',
      'add_amenity','add_photo','helpful_contribution','discover_gps','discover_onsite_live'
    );

  v_progression_bonus:=case
    when v_contribution_xp>=10000 then 20
    when v_contribution_xp>=6000 then 16
    when v_contribution_xp>=3000 then 12
    when v_contribution_xp>=1500 then 8
    when v_contribution_xp>=750 then 5
    when v_contribution_xp>=250 then 2
    else 0 end;

  v_evidence_cap:=case
    when coalesce(v_rep.verified_checkins_count,0)=0 then 19
    when coalesce(v_rep.verified_checkins_count,0)<4 or coalesce(v_rep.confirmed_observations_count,0)<2 then 39
    when coalesce(v_rep.verified_checkins_count,0)<10 or coalesce(v_rep.confirmed_observations_count,0)<4 then 69
    else 100 end;

  v_trust_score:=least(v_evidence_cap,greatest(0,round(coalesce(v_rep.reputation_score,0))::integer+v_progression_bonus));
  v_trust_rank:=case
    when v_trust_score>=90 then 'Trust Guardian'
    when v_trust_score>=70 then 'Verified'
    when v_trust_score>=40 then 'Trusted'
    when v_trust_score>=20 then 'Contributor'
    else 'New' end;

  select count(*)::integer into v_badges from public.user_badges where user_id=p_user_id;

  v_slots:=case
    when v_level_no>=75 and v_trust_score>=90 then 6
    when v_level_no>=50 and v_trust_score>=70 then 4
    when v_level_no>=25 and v_trust_score>=40 then 3
    when v_level_no>=10 and v_trust_score>=20 then 2
    else 1 end;

  select coalesce(sum(coalesce((c.metadata->>'showcase_slot_bonus')::integer,0)),0)::integer
  into v_bonus_slots
  from public.user_progression_reward_grants g
  join public.progression_reward_catalog c on c.code=g.reward_code
  where g.user_id=p_user_id and g.revoked_at is null and c.active;

  select coalesce(jsonb_object_agg(eq.slot,jsonb_build_object(
    'code',c.code,'reward_key',c.reward_key,'name',c.name,'kind',c.reward_kind,'metadata',c.metadata
  )),'{}'::jsonb)
  into v_equipped
  from public.user_progression_reward_equipment eq
  join public.progression_reward_catalog c on c.code=eq.reward_code and c.active
  where eq.user_id=p_user_id;

  return jsonb_build_object(
    'level',v_level_no,
    'level_title',v_level_title,
    'lifetime_xp',v_total_xp,
    'trust_score',v_trust_score,
    'trust_rank',v_trust_rank,
    'evidence_level',coalesce(v_rep.verification_level,'new'),
    'badge_count',v_badges,
    'showcase_slots',least(10,v_slots+v_bonus_slots),
    'showcase_slot_bonus',v_bonus_slots,
    'public_showcase_unlocked',(v_level_no>=10 and v_trust_score>=20),
    'equipped_rewards',v_equipped
  );
end
$$;
revoke all on function internal.progression_public_identity(uuid) from public,anon,authenticated;

create or replace function public.consumer_progression_rewards()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_owner boolean:=false;
  v_identity jsonb;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  v_owner:=internal.is_actual_platform_owner(v_user);
  v_identity:=internal.progression_public_identity(v_user);

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'code',c.code,
        'reward_kind',c.reward_kind,
        'reward_key',c.reward_key,
        'name',c.name,
        'description',case when coalesce((c.metadata->>'secret')::boolean,false)
          and not (
            v_owner
            or exists(select 1 from public.user_progression_reward_grants g where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null)
            or internal.progression_reward_eligible(v_user,c.code)
          ) then 'Secret achievement · keep contributing to reveal it.' else c.description end,
        'owner_only',c.owner_only,
        'progression_unlock_enabled',c.progression_unlock_enabled,
        'unlocked',(
          v_owner
          or exists(select 1 from public.user_progression_reward_grants g where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null)
          or internal.progression_reward_eligible(v_user,c.code)
        ),
        'equipped',exists(select 1 from public.user_progression_reward_equipment eq where eq.user_id=v_user and eq.reward_code=c.code),
        'equip_slot',(select eq.slot from public.user_progression_reward_equipment eq where eq.user_id=v_user and eq.reward_code=c.code limit 1),
        'unlock_source',case
          when v_owner then 'platform_owner'
          when exists(select 1 from public.user_progression_reward_grants g where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null and g.source='progression') then 'progression_earned'
          when exists(select 1 from public.user_progression_reward_grants g where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null) then 'owner_grant'
          when internal.progression_reward_eligible(v_user,c.code) then 'progression_eligible'
          else 'locked' end,
        'requirements',case when coalesce((c.metadata->>'secret')::boolean,false)
          and not (
            v_owner
            or exists(select 1 from public.user_progression_reward_grants g where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null)
            or internal.progression_reward_eligible(v_user,c.code)
          ) then jsonb_build_object('secret',true) else jsonb_build_object(
            'level',c.min_global_level,'trust_score',c.min_trust_score,'lifetime_xp',c.min_lifetime_xp,'badges',c.min_badges
          ) end,
        'identity',v_identity,
        'metadata',c.metadata,
        'sort_order',c.sort_order
      ) order by c.sort_order,c.name
    ),'[]'::jsonb)
    from public.progression_reward_catalog c
    where c.active
      and (c.available_from is null or c.available_from<=now())
      and (c.available_until is null or c.available_until>=now())
  );
end
$$;

create or replace function public.consumer_equip_progression_reward(p_reward_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  c public.progression_reward_catalog%rowtype;
  v_slot text;
  v_unlocked boolean:=false;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into c from public.progression_reward_catalog where code=p_reward_code and active;
  if not found then raise exception 'reward not found'; end if;

  v_unlocked:=internal.is_actual_platform_owner(v_user)
    or exists(select 1 from public.user_progression_reward_grants g where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null)
    or internal.progression_reward_eligible(v_user,c.code);
  if not v_unlocked then raise exception 'reward is locked'; end if;

  v_slot:=case c.reward_kind
    when 'theme' then 'theme'
    when 'title' then 'title'
    when 'profile_frame' then 'profile_frame'
    when 'profile_background' then 'profile_background'
    when 'map_flair' then 'map_flair'
    when 'checkin_animation' then 'checkin_animation'
    when 'reaction_pack' then 'reaction_pack'
    when 'map_filter' then 'map_filter'
    else null end;
  if v_slot is null then raise exception 'reward is not equipable'; end if;

  insert into public.user_progression_reward_equipment(user_id,slot,reward_code,equipped_at,updated_at)
  values(v_user,v_slot,c.code,now(),now())
  on conflict(user_id,slot) do update set reward_code=excluded.reward_code,equipped_at=now(),updated_at=now();

  return jsonb_build_object('equipped',true,'slot',v_slot,'reward_code',c.code,'reward_key',c.reward_key);
end
$$;

create or replace function public.consumer_unequip_progression_reward(p_slot text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_count integer:=0;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  delete from public.user_progression_reward_equipment where user_id=v_user and slot=p_slot;
  get diagnostics v_count=row_count;
  return jsonb_build_object('unequipped',v_count>0,'slot',p_slot);
end
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
      'equipped',(select coalesce(jsonb_object_agg(eq.slot,jsonb_build_object('code',c2.code,'reward_key',c2.reward_key,'name',c2.name,'metadata',c2.metadata)),'{}'::jsonb)
        from public.user_progression_reward_equipment eq join public.progression_reward_catalog c2 on c2.code=eq.reward_code
        where eq.user_id=v_user)
    )
    from unlocked
  );
end
$$;

create or replace function public.owner_user_progression_rewards(p_target_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner authorization required'; end if;
  if not exists(select 1 from public.profiles where id=p_target_user_id) then raise exception 'profile not found'; end if;

  return (
    select coalesce(jsonb_agg(
      to_jsonb(c) || jsonb_build_object(
        'active_grant',exists(
          select 1 from public.user_progression_reward_grants g
          where g.user_id=p_target_user_id and g.reward_code=c.code and g.revoked_at is null
        ),
        'grant_source',(
          select g.source from public.user_progression_reward_grants g
          where g.user_id=p_target_user_id and g.reward_code=c.code and g.revoked_at is null
          order by g.granted_at desc limit 1
        ),
        'granted_at',(
          select g.granted_at from public.user_progression_reward_grants g
          where g.user_id=p_target_user_id and g.reward_code=c.code and g.revoked_at is null
          order by g.granted_at desc limit 1
        ),
        'progression_eligible',internal.progression_reward_eligible(p_target_user_id,c.code)
      )
      order by c.sort_order,c.name
    ),'[]'::jsonb)
    from public.progression_reward_catalog c
    where c.active
  );
end
$;

revoke all on function public.consumer_progression_rewards() from public,anon;
grant execute on function public.consumer_progression_rewards() to authenticated;
revoke all on function public.consumer_equip_progression_reward(text) from public,anon;
grant execute on function public.consumer_equip_progression_reward(text) to authenticated;
revoke all on function public.consumer_unequip_progression_reward(text) from public,anon;
grant execute on function public.consumer_unequip_progression_reward(text) to authenticated;
revoke all on function public.consumer_reward_capabilities() from public,anon;
grant execute on function public.consumer_reward_capabilities() to authenticated;
revoke all on function public.owner_user_progression_rewards(uuid) from public,anon;
grant execute on function public.owner_user_progression_rewards(uuid) to authenticated;

insert into public.progression_games(code,name,description,game_type,reward_points,difficulty,rules,enabled,metrics_config)
values
('freshness_flow','Freshness Flow','Build a complete evidence flow by choosing the next trustworthy node before the signal chain breaks.','flow_builder',35,'medium',
 '{"rounds":8,"max_score":360,"score_model":"arena_v4","presentation":"flow_map","focus":"evidence_chain"}'::jsonb,true,'{"tracks":["accuracy","combo","flow_integrity"]}'::jsonb),
('signal_stack','Signal Stack','Sort evidence into a stable trust stack while pressure and conflicting signals increase.','stack_sort',35,'medium',
 '{"rounds":9,"max_score":420,"score_model":"arena_v4","presentation":"stack","focus":"evidence_priority"}'::jsonb,true,'{"tracks":["accuracy","combo","stack_height"]}'::jsonb),
('trust_tower','Trust Tower','Defend a public trust tower from stale, vague and unsupported claims.','tower_defense',45,'hard',
 '{"rounds":10,"max_score":500,"score_model":"arena_v4","presentation":"tower","focus":"trust_defense","lives":3}'::jsonb,true,'{"tracks":["accuracy","survival","combo"]}'::jsonb),
('route_rush','Route Rush','Race through route decisions where distance, freshness, access and evidence all compete.','route_rush',40,'hard',
 '{"rounds":9,"max_score":500,"score_model":"arena_v4","presentation":"route_rush","focus":"routing","time_limit_sec":6}'::jsonb,true,'{"tracks":["accuracy","speed","combo"]}'::jsonb)
on conflict(code) do update set
 name=excluded.name,description=excluded.description,game_type=excluded.game_type,reward_points=excluded.reward_points,
 difficulty=excluded.difficulty,rules=excluded.rules,enabled=true,metrics_config=excluded.metrics_config;

-- Re-evaluate all existing non-demo contributors so new earned rewards appear without waiting for another event.
do $$
declare v_profile record;
begin
  for v_profile in select p.id from public.profiles p where coalesce(p.is_demo_test,false)=false loop
    perform internal.award_progression_identity_badges(v_profile.id);
  end loop;
end
$$;
