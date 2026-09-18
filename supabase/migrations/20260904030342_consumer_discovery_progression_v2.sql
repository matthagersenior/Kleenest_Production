create table if not exists public.discovery_contributions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('remote','address','place_search','map_pin','gps','onsite_live')),
  discovery_state text not null default 'candidate' check (discovery_state in ('candidate','located','documented','on_site_observed','community_confirmed','verified','stale','disputed')),
  evidence_tier integer not null default 1 check (evidence_tier between 1 and 6),
  confidence numeric not null default 0.25 check (confidence between 0 and 1),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists discovery_contributions_location_idx on public.discovery_contributions(location_id, created_at desc);
create index if not exists discovery_contributions_user_idx on public.discovery_contributions(user_id, created_at desc);

create table if not exists public.progression_xp_actions (
  action text primary key,
  base_xp integer not null check (base_xp >= 0),
  specialty text,
  cooldown_seconds integer not null default 0,
  max_per_day integer,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);
insert into public.progression_xp_actions(action,base_xp,specialty,cooldown_seconds,max_per_day) values
 ('discover_remote',50,'explorer',0,20),
 ('discover_address',60,'explorer',0,20),
 ('discover_map_pin',65,'explorer',0,20),
 ('discover_gps',100,'explorer',0,20),
 ('discover_onsite_live',175,'explorer',0,20),
 ('add_photo',25,'photographer',0,40),
 ('add_amenity',18,'restroom_mapper',0,60),
 ('add_accessibility',30,'accessibility_scout',0,40),
 ('verify_location',55,'verifier',0,40),
 ('reverify_stale',70,'verifier',0,40),
 ('substantive_review',35,'reviewer',0,20),
 ('helpful_contribution',20,'community_contributor',0,50),
 ('pathfinder_milestone',100,'pathfinder',0,10),
 ('fleet_stop_complete',25,'pathfinder',0,100),
 ('quest_complete',100,null,0,20),
 ('mission_complete',200,null,0,10),
 ('challenge_complete',250,null,0,10),
 ('journey_complete',500,'pathfinder',0,5),
 ('contest_place',300,null,0,10),
 ('campaign_milestone',150,null,0,20)
on conflict(action) do update set base_xp=excluded.base_xp,specialty=excluded.specialty,cooldown_seconds=excluded.cooldown_seconds,max_per_day=excluded.max_per_day,enabled=true;

create table if not exists public.progression_events_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null references public.progression_xp_actions(action),
  location_id uuid references public.locations(id) on delete set null,
  subject jsonb not null default '{}'::jsonb,
  evidence_tier integer not null default 1 check (evidence_tier between 1 and 6),
  base_xp integer not null,
  multiplier numeric not null default 1,
  xp_awarded integer not null,
  idempotency_key text not null,
  status text not null default 'awarded' check (status in ('awarded','withheld','reversed')),
  created_at timestamptz not null default now(),
  unique(user_id,idempotency_key)
);
create index if not exists progression_events_v2_user_idx on public.progression_events_v2(user_id, created_at desc);
create index if not exists progression_events_v2_location_idx on public.progression_events_v2(location_id, created_at desc);

create table if not exists public.progression_specialty_levels (
  specialty text not null,
  level integer not null,
  title text not null,
  xp_threshold bigint not null,
  primary key(specialty,level)
);

create table if not exists public.progression_global_levels (
  level integer primary key,
  title text not null,
  xp_threshold bigint not null,
  unlock_text text
);
insert into public.progression_global_levels(level,title,xp_threshold,unlock_text)
select n,
  case when n<10 then 'Scout' when n<25 then 'Explorer' when n<50 then 'Pathfinder' when n<75 then 'Cartographer' else 'Kleenest Legend' end,
  ((n-1)*(n-1)*125)::bigint,
  case when n in (5,10,25,50,75,100) then 'Milestone level reward' else null end
from generate_series(1,100) n on conflict(level) do nothing;

insert into public.progression_specialty_levels(specialty,level,title,xp_threshold)
select s,n,
  initcap(replace(s,'_',' ')) || ' ' || n::text,
  ((n-1)*(n-1)*75)::bigint
from unnest(array['explorer','verifier','accessibility_scout','restroom_mapper','photographer','reviewer','community_contributor','pathfinder']) s
cross join generate_series(1,50) n on conflict(specialty,level) do nothing;

create table if not exists public.progression_objectives_v2 (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('quest','mission','challenge','journey','contest','campaign')),
  code text unique not null,
  title text not null,
  description text not null default '',
  status text not null default 'active' check (status in ('draft','active','completed','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  rules jsonb not null default '{}'::jsonb,
  rewards jsonb not null default '{}'::jsonb,
  scope jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.user_objective_progress_v2 (
  objective_id uuid not null references public.progression_objectives_v2(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  progress numeric not null default 0,
  target numeric not null default 1,
  state text not null default 'active' check (state in ('active','completed','expired')),
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(objective_id,user_id)
);

insert into public.progression_objectives_v2(kind,code,title,description,rules,rewards) values
 ('quest','first-discovery','First Discovery','Add a missing place to the Kleenest network.', '{"action":"discover_any","target":1}'::jsonb,'{"xp":100}'::jsonb),
 ('mission','restroom-mapper-5','Restroom Mapper','Document restroom intelligence at five locations.', '{"action":"add_amenity","target":5}'::jsonb,'{"xp":200}'::jsonb),
 ('challenge','weekly-verifier-10','Weekly Verifier','Verify ten location facts.', '{"action":"verify_location","target":10}'::jsonb,'{"xp":250}'::jsonb),
 ('journey','neighborhood-scout','Neighborhood Scout','Begin the Explorer journey by discovering and verifying nearby places.', '{"actions":["discover_any","verify_location"],"target":10}'::jsonb,'{"xp":500}'::jsonb),
 ('contest','discovery-sprint','Discovery Sprint','Compete on verified discoveries.', '{"action":"discover_any","target":1}'::jsonb,'{"xp":300}'::jsonb),
 ('campaign','accessibility-drive','Accessibility Drive','Improve accessibility information across the network.', '{"action":"add_accessibility","target":5}'::jsonb,'{"xp":150}'::jsonb)
on conflict(code) do nothing;

create or replace function public._progression_level_for_xp(p_xp bigint)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('level',g.level,'title',g.title,'xp_threshold',g.xp_threshold,'next_threshold',coalesce(n.xp_threshold,g.xp_threshold),'unlock_text',n.unlock_text)
  from public.progression_global_levels g
  left join public.progression_global_levels n on n.level=g.level+1
  where g.xp_threshold <= p_xp
  order by g.level desc limit 1
$$;

create or replace function public.record_progression_event_v2(p_action text,p_subject jsonb default '{}'::jsonb,p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_cfg public.progression_xp_actions%rowtype;
  v_key text := coalesce(nullif(p_idempotency_key,''), p_action||':'||coalesce(p_subject->>'source_id',gen_random_uuid()::text));
  v_existing public.progression_events_v2%rowtype;
  v_tier integer := greatest(1,least(6,coalesce((p_subject->>'evidence_tier')::integer,1)));
  v_mult numeric;
  v_xp integer;
  v_event uuid;
  v_location uuid := nullif(p_subject->>'location_id','')::uuid;
  v_total bigint;
  v_level jsonb;
  v_specialty jsonb := '[]'::jsonb;
  v_count integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_cfg from public.progression_xp_actions where action=p_action and enabled;
  if not found then raise exception 'unsupported progression action'; end if;
  select * into v_existing from public.progression_events_v2 where user_id=v_user and idempotency_key=v_key;
  if found then return jsonb_build_object('event_id',v_existing.id,'xp_awarded',0,'duplicate',true); end if;
  if v_cfg.max_per_day is not null then
    select count(*) into v_count from public.progression_events_v2 where user_id=v_user and action=p_action and created_at>=date_trunc('day',now()) and status='awarded';
    if v_count >= v_cfg.max_per_day then return jsonb_build_object('xp_awarded',0,'withheld',true,'reason','daily_limit'); end if;
  end if;
  if p_action like 'discover_%' and v_location is not null then
    if not exists(select 1 from public.discovery_contributions d where d.location_id=v_location and d.user_id=v_user and d.evidence_tier>=v_tier) then
      raise exception 'discovery evidence does not support requested tier';
    end if;
  end if;
  v_mult := case v_tier when 1 then 1.0 when 2 then 1.15 when 3 then 1.35 when 4 then 1.75 when 5 then 2.0 else 2.25 end;
  v_xp := round(v_cfg.base_xp*v_mult)::integer;
  insert into public.progression_events_v2(user_id,action,location_id,subject,evidence_tier,base_xp,multiplier,xp_awarded,idempotency_key)
  values(v_user,p_action,v_location,coalesce(p_subject,'{}'::jsonb),v_tier,v_cfg.base_xp,v_mult,v_xp,v_key) returning id into v_event;
  insert into public.progression_metric_events(user_id,metric,source_type,source_id,quantity,points_awarded,metadata)
  values(v_user,'xp_v2','progression_event_v2',v_event,1,v_xp,jsonb_build_object('action',p_action,'evidence_tier',v_tier))
  on conflict do nothing;
  if v_cfg.specialty is not null then
    v_specialty := jsonb_build_array(jsonb_build_object('specialty',v_cfg.specialty,'xp_awarded',v_xp));
  end if;
  update public.user_objective_progress_v2 up
  set progress=least(up.target,up.progress+1),
      state=case when up.progress+1>=up.target then 'completed' else up.state end,
      completed_at=case when up.progress+1>=up.target then coalesce(up.completed_at,now()) else up.completed_at end,
      updated_at=now()
  from public.progression_objectives_v2 o
  where up.objective_id=o.id and up.user_id=v_user and up.state='active'
    and (o.rules->>'action'=p_action or (o.rules->>'action'='discover_any' and p_action like 'discover_%') or coalesce(o.rules->'actions','[]'::jsonb) ? p_action);
  insert into public.user_objective_progress_v2(objective_id,user_id,target)
  select o.id,v_user,coalesce((o.rules->>'target')::numeric,1)
  from public.progression_objectives_v2 o
  where o.status='active' and (o.starts_at is null or o.starts_at<=now()) and (o.ends_at is null or o.ends_at>=now())
    and (o.rules->>'action'=p_action or (o.rules->>'action'='discover_any' and p_action like 'discover_%') or coalesce(o.rules->'actions','[]'::jsonb) ? p_action)
  on conflict(objective_id,user_id) do update set progress=least(public.user_objective_progress_v2.target,public.user_objective_progress_v2.progress+1),updated_at=now(),state=case when public.user_objective_progress_v2.progress+1>=public.user_objective_progress_v2.target then 'completed' else public.user_objective_progress_v2.state end,completed_at=case when public.user_objective_progress_v2.progress+1>=public.user_objective_progress_v2.target then coalesce(public.user_objective_progress_v2.completed_at,now()) else public.user_objective_progress_v2.completed_at end;
  select coalesce(sum(xp_awarded),0)::bigint into v_total from public.progression_events_v2 where user_id=v_user and status='awarded';
  v_level:=public._progression_level_for_xp(v_total);
  return jsonb_build_object('event_id',v_event,'base_xp',v_cfg.base_xp,'multiplier',v_mult,'xp_awarded',v_xp,'evidence_tier',v_tier,'global_level',v_level,'specialty_updates',v_specialty,'duplicate',false);
end $$;

create or replace function public.consumer_match_or_create_discovery(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();
  v_name text:=nullif(btrim(p_input->>'name'),'');
  v_address text:=nullif(btrim(p_input->>'address'),'');
  v_lat double precision:=nullif(p_input->>'latitude','')::double precision;
  v_lon double precision:=nullif(p_input->>'longitude','')::double precision;
  v_method text:=coalesce(nullif(p_input->>'method',''),'remote');
  v_loc public.locations%rowtype;
  v_new boolean:=false;
  v_tier integer;
  v_conf numeric;
  v_state text;
  v_contrib uuid;
  v_xp jsonb;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if v_method not in ('remote','address','place_search','map_pin','gps','onsite_live') then raise exception 'invalid discovery method'; end if;
  if v_name is null and v_address is null and (v_lat is null or v_lon is null) then raise exception 'name, address, or coordinates required'; end if;
  select * into v_loc from public.locations l
  where l.is_active is distinct from false and (
    (v_lat is not null and v_lon is not null and l.latitude between v_lat-0.001 and v_lat+0.001 and l.longitude between v_lon-0.001 and v_lon+0.001 and (v_name is null or lower(l.name)=lower(v_name)))
    or (v_address is not null and lower(coalesce(l.address,''))=lower(v_address) and (v_name is null or lower(l.name)=lower(v_name)))
    or (nullif(p_input->>'external_id','') is not null and l.source_external_id=p_input->>'external_id' and (p_input->>'external_source' is null or l.source_dataset=p_input->>'external_source'))
  ) order by l.verification_confidence desc nulls last,l.created_at asc limit 1;
  if v_loc.id is null then
    insert into public.locations(name,address,latitude,longitude,place_type,source,source_dataset,source_external_id,source_metadata,created_by,is_active)
    values(coalesce(v_name,'Community discovery'),v_address,v_lat,v_lon,coalesce(p_input->>'place_type','place'),'community_discovery',p_input->>'external_source',p_input->>'external_id',jsonb_build_object('discovery_method',v_method,'submitted_payload',p_input),v_user,true)
    returning * into v_loc;
    v_new:=true;
  end if;
  v_tier:=case v_method when 'onsite_live' then 4 when 'gps' then 3 when 'map_pin' then 2 when 'address' then 2 when 'place_search' then 2 else 1 end;
  v_conf:=case v_tier when 4 then .80 when 3 then .65 when 2 then .45 else .25 end;
  v_state:=case when v_tier>=4 then 'on_site_observed' when v_tier>=2 then 'located' else 'candidate' end;
  insert into public.discovery_contributions(location_id,user_id,method,discovery_state,evidence_tier,confidence,payload)
  values(v_loc.id,v_user,v_method,v_state,v_tier,v_conf,p_input) returning id into v_contrib;
  insert into public.location_submissions(location_id,submitted_by,payload,status)
  values(v_loc.id,v_user,p_input||jsonb_build_object('discovery_contribution_id',v_contrib,'method',v_method,'evidence_tier',v_tier),'submitted');
  v_xp:=public.record_progression_event_v2(case v_method when 'onsite_live' then 'discover_onsite_live' when 'gps' then 'discover_gps' when 'map_pin' then 'discover_map_pin' when 'address' then 'discover_address' else 'discover_remote' end,
    jsonb_build_object('location_id',v_loc.id,'source_id',v_contrib,'evidence_tier',v_tier,'new_location',v_new), 'discovery:'||v_contrib::text);
  return jsonb_build_object('location_id',v_loc.id,'matched_existing',not v_new,'discovery_id',v_contrib,'discovery_state',v_state,'evidence_tier',v_tier,'confidence',v_conf,'xp',v_xp);
end $$;

create or replace function public.consumer_record_discovery_evidence(p_location_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();
  v_method text:=coalesce(nullif(p_input->>'method',''),'remote');
  v_tier integer;
  v_conf numeric;
  v_obs uuid;
  v_action text;
  v_xp jsonb;
  v_contrib uuid;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if not exists(select 1 from public.locations where id=p_location_id) then raise exception 'location not found'; end if;
  v_tier:=case v_method when 'onsite_live' then 4 when 'gps' then 3 when 'photo_remote' then 2 else 1 end;
  v_conf:=case v_tier when 4 then .85 when 3 then .70 when 2 then .50 else .30 end;
  insert into public.location_observations(location_id,observer_user_id,observation_type,observed_at,latitude,longitude,accuracy_m,evidence,confidence,source)
  values(p_location_id,v_user,coalesce(p_input->>'observation_type','discovery_evidence'),now(),nullif(p_input->>'latitude','')::double precision,nullif(p_input->>'longitude','')::double precision,nullif(p_input->>'accuracy_m','')::double precision,p_input,v_conf,'consumer_discovery') returning id into v_obs;
  select id into v_contrib from public.discovery_contributions where location_id=p_location_id and user_id=v_user order by created_at desc limit 1;
  if v_contrib is null then
    insert into public.discovery_contributions(location_id,user_id,method,discovery_state,evidence_tier,confidence,payload)
    values(p_location_id,v_user,case when v_method in ('gps','onsite_live') then v_method else 'remote' end,case when v_tier>=4 then 'on_site_observed' else 'documented' end,v_tier,v_conf,p_input) returning id into v_contrib;
  else
    update public.discovery_contributions set evidence_tier=greatest(evidence_tier,v_tier),confidence=greatest(confidence,v_conf),discovery_state=case when v_tier>=4 then 'on_site_observed' else 'documented' end,payload=payload||p_input,updated_at=now() where id=v_contrib;
  end if;
  v_action:=case when p_input ? 'accessibility' then 'add_accessibility' when p_input ? 'photo_path' or p_input ? 'photo_url' then 'add_photo' when p_input ? 'amenities' then 'add_amenity' else 'helpful_contribution' end;
  v_xp:=public.record_progression_event_v2(v_action,jsonb_build_object('location_id',p_location_id,'source_id',v_obs,'evidence_tier',v_tier),'evidence:'||v_obs::text);
  return jsonb_build_object('observation_id',v_obs,'evidence_tier',v_tier,'confidence',v_conf,'xp',v_xp);
end $$;

create or replace function public.consumer_progression_overview()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_total bigint; v_level jsonb; v_specs jsonb; v_recent jsonb; v_badges jsonb;
begin
 if v_user is null then raise exception 'authentication required'; end if;
 select coalesce(sum(xp_awarded),0)::bigint into v_total from public.progression_events_v2 where user_id=v_user and status='awarded';
 v_level:=public._progression_level_for_xp(v_total);
 select coalesce(jsonb_agg(jsonb_build_object('specialty',s.specialty,'xp',s.xp,'level',coalesce((select max(l.level) from public.progression_specialty_levels l where l.specialty=s.specialty and l.xp_threshold<=s.xp),1))), '[]'::jsonb) into v_specs
 from (select a.specialty,coalesce(sum(e.xp_awarded),0)::bigint xp from public.progression_events_v2 e join public.progression_xp_actions a on a.action=e.action where e.user_id=v_user and e.status='awarded' and a.specialty is not null group by a.specialty) s;
 select coalesce(jsonb_agg(x order by x->>'created_at' desc),'[]'::jsonb) into v_recent from (select jsonb_build_object('action',action,'xp',xp_awarded,'created_at',created_at,'subject',subject) x from public.progression_events_v2 where user_id=v_user order by created_at desc limit 30) q;
 select coalesce(jsonb_agg(jsonb_build_object('code',b.code,'name',b.name,'description',b.description,'icon',b.icon,'earned',ub.user_id is not null,'earned_at',ub.earned_at,'criteria',b.criteria) order by (ub.user_id is not null) desc,b.name),'[]'::jsonb) into v_badges from public.badges b left join public.user_badges ub on ub.badge_id=b.id and ub.user_id=v_user;
 return jsonb_build_object('lifetime_xp',v_total,'global_level',v_level,'specialties',coalesce(v_specs,'[]'::jsonb),'recent_xp',v_recent,'badges',v_badges);
end $$;

create or replace function public.consumer_active_objectives()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'kind',o.kind,'code',o.code,'title',o.title,'description',o.description,'rules',o.rules,'rewards',o.rewards,'starts_at',o.starts_at,'ends_at',o.ends_at,'progress',coalesce(up.progress,0),'target',coalesce(up.target,(o.rules->>'target')::numeric,1),'state',coalesce(up.state,'active')) order by o.kind,o.title),'[]'::jsonb)
 from public.progression_objectives_v2 o left join public.user_objective_progress_v2 up on up.objective_id=o.id and up.user_id=auth.uid()
 where auth.uid() is not null and o.status='active' and (o.starts_at is null or o.starts_at<=now()) and (o.ends_at is null or o.ends_at>=now())
$$;

create or replace function public.consumer_progression_rankings(p_scope text default 'global',p_metric text default 'xp',p_context jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
 with scores as (
  select e.user_id,sum(e.xp_awarded)::bigint score from public.progression_events_v2 e where e.status='awarded' group by e.user_id
 ), ranked as (
  select user_id,score,dense_rank() over(order by score desc) rank from scores
 )
 select coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'score',r.score,'rank',r.rank,'scope',p_scope,'metric',p_metric) order by r.rank),'[]'::jsonb) from (select * from ranked order by rank limit 100) r
$$;

create or replace function public.consumer_nearby_progression_opportunities(p_lat double precision,p_lon double precision,p_radius_m integer default 5000)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('location_id',l.id,'name',l.name,'address',l.address,'latitude',l.latitude,'longitude',l.longitude,'kind',case when coalesce(l.bathroom_verification_count,0)=0 then 'missing_restroom_intelligence' when l.bathroom_verified_at is null or l.bathroom_verified_at<now()-interval '180 days' then 'stale_verification' else 'incomplete_evidence' end,'distance_m',round((111320*sqrt(power(l.latitude-p_lat,2)+power((l.longitude-p_lon)*cos(radians(p_lat)),2)))::numeric,0)) order by (power(l.latitude-p_lat,2)+power(l.longitude-p_lon,2))),'[]'::jsonb)
 from (select * from public.locations where is_active is distinct from false and latitude is not null and longitude is not null and 111320*sqrt(power(latitude-p_lat,2)+power((longitude-p_lon)*cos(radians(p_lat)),2))<=p_radius_m order by power(latitude-p_lat,2)+power(longitude-p_lon,2) limit 30) l
$$;

grant execute on function public.consumer_match_or_create_discovery(jsonb) to authenticated;
grant execute on function public.consumer_record_discovery_evidence(uuid,jsonb) to authenticated;
grant execute on function public.record_progression_event_v2(text,jsonb,text) to authenticated;
grant execute on function public.consumer_progression_overview() to authenticated;
grant execute on function public.consumer_active_objectives() to authenticated;
grant execute on function public.consumer_progression_rankings(text,text,jsonb) to authenticated;
grant execute on function public.consumer_nearby_progression_opportunities(double precision,double precision,integer) to authenticated;

alter table public.discovery_contributions enable row level security;
alter table public.progression_events_v2 enable row level security;
alter table public.user_objective_progress_v2 enable row level security;
drop policy if exists discovery_contributions_owner on public.discovery_contributions;
create policy discovery_contributions_owner on public.discovery_contributions for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists progression_events_v2_owner on public.progression_events_v2;
create policy progression_events_v2_owner on public.progression_events_v2 for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists user_objective_progress_v2_owner on public.user_objective_progress_v2;
create policy user_objective_progress_v2_owner on public.user_objective_progress_v2 for select to authenticated using (user_id=(select auth.uid()));
