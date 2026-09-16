-- Kleenest Passport Foundation
-- Live migration version: 20260916203756
-- Passport is derived from canonical check-ins, reviews and review-photo evidence.

create table if not exists public.passport_stamp_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_-]{2,80}$'),
  name text not null,
  description text not null default '',
  icon text not null default '✦',
  category text not null default 'achievement',
  trigger_kind text not null default 'system',
  criteria jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  reward_xp integer not null default 0 check (reward_xp >= 0),
  public_default boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_passport_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  first_check_in_id uuid references public.check_ins(id) on delete set null,
  first_visited_at timestamptz not null,
  last_visited_at timestamptz not null,
  visit_count integer not null default 1 check (visit_count > 0),
  location_name_snapshot text not null,
  city_snapshot text,
  state_snapshot text,
  country_snapshot text,
  place_type_snapshot text,
  verification_method text,
  points_earned integer not null default 0,
  public_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, location_id)
);

create table if not exists public.user_passport_stamps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stamp_code text not null,
  dedupe_key text not null default 'once',
  location_id uuid references public.locations(id) on delete set null,
  stamp_name_snapshot text not null,
  icon_snapshot text not null default '✦',
  category_snapshot text not null default 'achievement',
  source_type text not null default 'system',
  source_id uuid,
  earned_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  public_visible boolean not null default true,
  unique(user_id, stamp_code, dedupe_key)
);

create table if not exists public.passport_catalog_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  stamp_code text not null,
  action text not null,
  reason text not null,
  previous_state jsonb,
  next_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_passport_visits_user_last on public.user_passport_visits(user_id,last_visited_at desc);
create index if not exists idx_user_passport_visits_user_city on public.user_passport_visits(user_id,city_snapshot);
create index if not exists idx_user_passport_visits_user_state on public.user_passport_visits(user_id,state_snapshot);
create index if not exists idx_user_passport_stamps_user_earned on public.user_passport_stamps(user_id,earned_at desc);
create index if not exists idx_user_passport_stamps_user_category on public.user_passport_stamps(user_id,category_snapshot);
create index if not exists idx_passport_catalog_audit_code_created on public.passport_catalog_audit(stamp_code,created_at desc);

alter table public.passport_stamp_catalog enable row level security;
alter table public.user_passport_visits enable row level security;
alter table public.user_passport_stamps enable row level security;
alter table public.passport_catalog_audit enable row level security;

revoke all on table public.passport_stamp_catalog from anon, authenticated;
revoke all on table public.user_passport_visits from anon, authenticated;
revoke all on table public.user_passport_stamps from anon, authenticated;
revoke all on table public.passport_catalog_audit from anon, authenticated;
grant select,insert,update,delete on table public.passport_stamp_catalog to service_role;
grant select,insert,update,delete on table public.user_passport_visits to service_role;
grant select,insert,update,delete on table public.user_passport_stamps to service_role;
grant select,insert on table public.passport_catalog_audit to service_role;

insert into public.passport_stamp_catalog(code,name,description,icon,category,trigger_kind,criteria,reward_xp,public_default,sort_order)
values
 ('first_verified_visit','First Stamp','Your first verified Kleenest visit.','🛂','milestone','check_in','{"verified_visits":1}'::jsonb,0,true,10),
 ('qr_scout','QR Scout','Verified a visit through a Kleenest QR code.','⌗','evidence','check_in','{"qr_check_in":true}'::jsonb,0,true,20),
 ('trusted_regular','Trusted Regular','Verified the same place three or more times.','↻','consistency','check_in','{"same_location_visits":3}'::jsonb,0,true,30),
 ('city_scout','City Scout','Collected verified stamps in three different cities.','🏙️','exploration','aggregate','{"distinct_cities":3}'::jsonb,0,true,40),
 ('state_scout','State Scout','Collected verified stamps in two different states.','🗺️','exploration','aggregate','{"distinct_states":2}'::jsonb,0,true,50),
 ('first_review','First Review','Published your first Kleenest restroom review.','✍️','contribution','review','{"published_reviews":1}'::jsonb,0,true,60),
 ('five_star_find','Five-Star Find','Published a 5-star restroom review.','★','discovery','review','{"stars":5}'::jsonb,0,true,70),
 ('freshness_champion','Freshness Champion','Reported a restroom at 90% cleanliness or better.','✨','freshness','review','{"cleanliness_pct_gte":90}'::jsonb,0,true,80),
 ('photo_proof','Photo Proof','Added photo evidence to a restroom review.','▣','evidence','review_photo','{"review_photo":true}'::jsonb,0,true,90)
on conflict(code) do update set
 name=excluded.name,description=excluded.description,icon=excluded.icon,category=excluded.category,
 trigger_kind=excluded.trigger_kind,criteria=excluded.criteria,sort_order=excluded.sort_order,updated_at=now();

CREATE OR REPLACE FUNCTION public._passport_award_stamp(p_user_id uuid, p_stamp_code text, p_dedupe_key text DEFAULT 'once'::text, p_location_id uuid DEFAULT NULL::uuid, p_source_type text DEFAULT 'system'::text, p_source_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_stamp public.passport_stamp_catalog%rowtype; v_inserted uuid;
begin
  if p_user_id is null then return false; end if;
  select * into v_stamp from public.passport_stamp_catalog where code=p_stamp_code and active=true limit 1;
  if not found then return false; end if;
  insert into public.user_passport_stamps(
    user_id,stamp_code,dedupe_key,location_id,stamp_name_snapshot,icon_snapshot,category_snapshot,
    source_type,source_id,metadata,public_visible
  ) values(
    p_user_id,p_stamp_code,coalesce(nullif(p_dedupe_key,''),'once'),p_location_id,v_stamp.name,v_stamp.icon,v_stamp.category,
    coalesce(nullif(p_source_type,''),'system'),p_source_id,coalesce(p_metadata,'{}'::jsonb),v_stamp.public_default
  ) on conflict(user_id,stamp_code,dedupe_key) do nothing
  returning id into v_inserted;
  return v_inserted is not null;
end $function$;

CREATE OR REPLACE FUNCTION public._passport_backfill_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; v_city_count integer; v_state_count integer;
begin
  if p_user_id is null then return; end if;
  insert into public.user_passport_visits(
    user_id,location_id,first_check_in_id,first_visited_at,last_visited_at,visit_count,
    location_name_snapshot,city_snapshot,state_snapshot,country_snapshot,place_type_snapshot,
    verification_method,points_earned,public_visible
  )
  select c.user_id,c.location_id,(array_agg(c.id order by c.checked_in_at asc))[1],min(c.checked_in_at),max(c.checked_in_at),count(*)::int,
    l.name,l.city,l.state,l.country,l.place_type,(array_agg(c.verification_method order by c.checked_in_at desc))[1],coalesce(sum(c.points_awarded),0)::int,true
  from public.check_ins c join public.locations l on l.id=c.location_id
  where c.user_id=p_user_id
  group by c.user_id,c.location_id,l.name,l.city,l.state,l.country,l.place_type
  on conflict(user_id,location_id) do update set
    first_visited_at=least(public.user_passport_visits.first_visited_at,excluded.first_visited_at),
    last_visited_at=greatest(public.user_passport_visits.last_visited_at,excluded.last_visited_at),
    visit_count=excluded.visit_count, location_name_snapshot=excluded.location_name_snapshot,
    city_snapshot=excluded.city_snapshot,state_snapshot=excluded.state_snapshot,country_snapshot=excluded.country_snapshot,
    place_type_snapshot=excluded.place_type_snapshot,verification_method=excluded.verification_method,
    points_earned=excluded.points_earned,updated_at=now();

  if exists(select 1 from public.user_passport_visits where user_id=p_user_id) then
    select * into r from public.user_passport_visits where user_id=p_user_id order by first_visited_at asc limit 1;
    perform public._passport_award_stamp(p_user_id,'first_verified_visit','once',r.location_id,'backfill',r.first_check_in_id,'{}'::jsonb);
  end if;
  if exists(select 1 from public.check_ins where user_id=p_user_id and qr_code_id is not null) then
    select c.id,c.location_id into r from public.check_ins c where c.user_id=p_user_id and c.qr_code_id is not null order by c.checked_in_at asc limit 1;
    perform public._passport_award_stamp(p_user_id,'qr_scout','once',r.location_id,'backfill',r.id,'{"qr":true}'::jsonb);
  end if;
  for r in select * from public.user_passport_visits where user_id=p_user_id and visit_count>=3 loop
    perform public._passport_award_stamp(p_user_id,'trusted_regular',r.location_id::text,r.location_id,'backfill',r.first_check_in_id,jsonb_build_object('visit_count',r.visit_count));
  end loop;
  select count(distinct nullif(trim(city_snapshot),''))::int,count(distinct nullif(trim(state_snapshot),''))::int into v_city_count,v_state_count
    from public.user_passport_visits where user_id=p_user_id;
  if coalesce(v_city_count,0)>=3 then perform public._passport_award_stamp(p_user_id,'city_scout','three_cities',null,'backfill',null,jsonb_build_object('distinct_cities',v_city_count)); end if;
  if coalesce(v_state_count,0)>=2 then perform public._passport_award_stamp(p_user_id,'state_scout','two_states',null,'backfill',null,jsonb_build_object('distinct_states',v_state_count)); end if;

  if exists(select 1 from public.reviews where user_id=p_user_id and status::text='published') then
    select id,location_id,stars,cleanliness_pct into r from public.reviews where user_id=p_user_id and status::text='published' order by created_at asc limit 1;
    perform public._passport_award_stamp(p_user_id,'first_review','once',r.location_id,'backfill',r.id,jsonb_build_object('stars',r.stars,'cleanliness_pct',r.cleanliness_pct));
  end if;
  for r in select id,location_id,stars,cleanliness_pct from public.reviews where user_id=p_user_id and status::text='published' loop
    if r.stars=5 then perform public._passport_award_stamp(p_user_id,'five_star_find',r.id::text,r.location_id,'backfill',r.id,jsonb_build_object('stars',5)); end if;
    if coalesce(r.cleanliness_pct,0)>=90 then perform public._passport_award_stamp(p_user_id,'freshness_champion',r.id::text,r.location_id,'backfill',r.id,jsonb_build_object('cleanliness_pct',r.cleanliness_pct)); end if;
  end loop;
  if exists(select 1 from public.review_photos rp join public.reviews rv on rv.id=rp.review_id where rv.user_id=p_user_id and rv.status::text='published') then
    select rp.id,rv.location_id,rv.id as review_id into r
      from public.review_photos rp join public.reviews rv on rv.id=rp.review_id
      where rv.user_id=p_user_id and rv.status::text='published' order by rp.created_at asc limit 1;
    perform public._passport_award_stamp(p_user_id,'photo_proof','once',r.location_id,'backfill',r.id,jsonb_build_object('review_id',r.review_id));
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public._passport_photo_stamp_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_review public.reviews%rowtype;
begin
  select * into v_review from public.reviews where id=new.review_id;
  if found and v_review.status::text='published' then
    perform public._passport_award_stamp(v_review.user_id,'photo_proof','once',v_review.location_id,'review_photo',new.id,jsonb_build_object('review_id',new.review_id));
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public._passport_refresh_visit_from_checkin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_location public.locations%rowtype; v_count integer; v_city_count integer; v_state_count integer;
begin
  select * into v_location from public.locations where id=new.location_id;
  if not found then return new; end if;
  insert into public.user_passport_visits(
    user_id,location_id,first_check_in_id,first_visited_at,last_visited_at,visit_count,
    location_name_snapshot,city_snapshot,state_snapshot,country_snapshot,place_type_snapshot,
    verification_method,points_earned,public_visible
  ) values(
    new.user_id,new.location_id,new.id,new.checked_in_at,new.checked_in_at,1,
    v_location.name,v_location.city,v_location.state,v_location.country,v_location.place_type,
    new.verification_method,coalesce(new.points_awarded,0),true
  ) on conflict(user_id,location_id) do update set
    last_visited_at=greatest(public.user_passport_visits.last_visited_at,excluded.last_visited_at),
    visit_count=public.user_passport_visits.visit_count+1,
    location_name_snapshot=excluded.location_name_snapshot, city_snapshot=excluded.city_snapshot,
    state_snapshot=excluded.state_snapshot, country_snapshot=excluded.country_snapshot,
    place_type_snapshot=excluded.place_type_snapshot, verification_method=excluded.verification_method,
    points_earned=public.user_passport_visits.points_earned+excluded.points_earned, updated_at=now();

  perform public._passport_award_stamp(new.user_id,'first_verified_visit','once',new.location_id,'check_in',new.id,jsonb_build_object('verification_method',new.verification_method));
  if new.qr_code_id is not null then
    perform public._passport_award_stamp(new.user_id,'qr_scout','once',new.location_id,'check_in',new.id,'{"qr":true}'::jsonb);
  end if;
  select visit_count into v_count from public.user_passport_visits where user_id=new.user_id and location_id=new.location_id;
  if coalesce(v_count,0)>=3 then
    perform public._passport_award_stamp(new.user_id,'trusted_regular',new.location_id::text,new.location_id,'check_in',new.id,jsonb_build_object('visit_count',v_count));
  end if;
  select count(distinct nullif(trim(city_snapshot),''))::int,count(distinct nullif(trim(state_snapshot),''))::int
    into v_city_count,v_state_count from public.user_passport_visits where user_id=new.user_id;
  if coalesce(v_city_count,0)>=3 then
    perform public._passport_award_stamp(new.user_id,'city_scout','three_cities',new.location_id,'aggregate',new.id,jsonb_build_object('distinct_cities',v_city_count));
  end if;
  if coalesce(v_state_count,0)>=2 then
    perform public._passport_award_stamp(new.user_id,'state_scout','two_states',new.location_id,'aggregate',new.id,jsonb_build_object('distinct_states',v_state_count));
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public._passport_review_stamp_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status::text <> 'published' then return new; end if;
  perform public._passport_award_stamp(new.user_id,'first_review','once',new.location_id,'review',new.id,jsonb_build_object('stars',new.stars,'cleanliness_pct',new.cleanliness_pct));
  if new.stars=5 then perform public._passport_award_stamp(new.user_id,'five_star_find',new.id::text,new.location_id,'review',new.id,jsonb_build_object('stars',5)); end if;
  if coalesce(new.cleanliness_pct,0)>=90 then perform public._passport_award_stamp(new.user_id,'freshness_champion',new.id::text,new.location_id,'review',new.id,jsonb_build_object('cleanliness_pct',new.cleanliness_pct)); end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.consumer_passport_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  perform public._passport_backfill_user(v_user);
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'places',(select count(*) from public.user_passport_visits where user_id=v_user),
      'visits',(select coalesce(sum(visit_count),0) from public.user_passport_visits where user_id=v_user),
      'cities',(select count(distinct nullif(trim(city_snapshot),'')) from public.user_passport_visits where user_id=v_user),
      'states',(select count(distinct nullif(trim(state_snapshot),'')) from public.user_passport_visits where user_id=v_user),
      'achievement_stamps',(select count(*) from public.user_passport_stamps where user_id=v_user)
    ),
    'recent_visits',coalesce((select jsonb_agg(jsonb_build_object(
      'id',v.id,'location_id',v.location_id,'name',v.location_name_snapshot,'city',v.city_snapshot,'state',v.state_snapshot,
      'country',v.country_snapshot,'place_type',v.place_type_snapshot,'first_visited_at',v.first_visited_at,'last_visited_at',v.last_visited_at,
      'visit_count',v.visit_count,'verification_method',v.verification_method,'points_earned',v.points_earned,'public_visible',v.public_visible
    ) order by v.last_visited_at desc) from (select * from public.user_passport_visits where user_id=v_user order by last_visited_at desc limit 60) v),'[]'::jsonb),
    'achievement_stamps',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'code',s.stamp_code,'name',s.stamp_name_snapshot,'icon',s.icon_snapshot,'category',s.category_snapshot,
      'location_id',s.location_id,'earned_at',s.earned_at,'metadata',s.metadata,'public_visible',s.public_visible
    ) order by s.earned_at desc) from public.user_passport_stamps s where s.user_id=v_user),'[]'::jsonb),
    'cities',coalesce((select jsonb_agg(jsonb_build_object('name',city,'places',places,'visits',visits,'last_visited_at',last_visited_at) order by places desc,city) from (
      select city_snapshot city,count(*) places,sum(visit_count) visits,max(last_visited_at) last_visited_at
      from public.user_passport_visits where user_id=v_user and nullif(trim(city_snapshot),'') is not null group by city_snapshot
    ) q),'[]'::jsonb),
    'states',coalesce((select jsonb_agg(jsonb_build_object('name',state,'places',places,'visits',visits) order by places desc,state) from (
      select state_snapshot state,count(*) places,sum(visit_count) visits from public.user_passport_visits
      where user_id=v_user and nullif(trim(state_snapshot),'') is not null group by state_snapshot
    ) q),'[]'::jsonb),
    'place_types',coalesce((select jsonb_agg(jsonb_build_object('name',place_type,'places',places) order by places desc,place_type) from (
      select coalesce(nullif(trim(place_type_snapshot),''),'other') place_type,count(*) places from public.user_passport_visits where user_id=v_user group by 1
    ) q),'[]'::jsonb),
    'next_collections',jsonb_build_array(
      jsonb_build_object('code','cities_3','name','Three-City Trail','current',(select count(distinct nullif(trim(city_snapshot),'')) from public.user_passport_visits where user_id=v_user),'target',3),
      jsonb_build_object('code','states_2','name','State Hopper','current',(select count(distinct nullif(trim(state_snapshot),'')) from public.user_passport_visits where user_id=v_user),'target',2),
      jsonb_build_object('code','places_10','name','Ten-Stamp Book','current',(select count(*) from public.user_passport_visits where user_id=v_user),'target',10)
    )
  ) into v_result;
  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.consumer_set_passport_visibility(p_item_type text, p_item_id uuid, p_visible boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid(); v_rows int:=0;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_item_type='visit' then
    update public.user_passport_visits set public_visible=p_visible,updated_at=now() where id=p_item_id and user_id=v_user;
    get diagnostics v_rows=row_count;
  elsif p_item_type='stamp' then
    update public.user_passport_stamps set public_visible=p_visible where id=p_item_id and user_id=v_user;
    get diagnostics v_rows=row_count;
  else raise exception 'invalid passport item type';
  end if;
  if v_rows=0 then raise exception 'passport item not found'; end if;
  return jsonb_build_object('ok',true,'item_type',p_item_type,'item_id',p_item_id,'public_visible',p_visible);
end $function$;

CREATE OR REPLACE FUNCTION public.owner_passport_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required'; end if;
  return jsonb_build_object(
    'catalog_count',(select count(*) from public.passport_stamp_catalog),
    'active_catalog_count',(select count(*) from public.passport_stamp_catalog where active),
    'users_with_passports',(select count(distinct user_id) from public.user_passport_visits),
    'place_stamps',(select count(*) from public.user_passport_visits),
    'verified_visits',(select coalesce(sum(visit_count),0) from public.user_passport_visits),
    'achievement_stamps',(select count(*) from public.user_passport_stamps),
    'top_stamp_types',coalesce((select jsonb_agg(jsonb_build_object('code',stamp_code,'count',cnt) order by cnt desc)
      from (select stamp_code,count(*) cnt from public.user_passport_stamps group by stamp_code order by cnt desc limit 15) q),'[]'::jsonb)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.owner_passport_stamp_catalog()
 RETURNS SETOF passport_stamp_catalog
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required'; end if;
  return query select * from public.passport_stamp_catalog order by sort_order,name;
end $function$;

CREATE OR REPLACE FUNCTION public.owner_passport_stamp_delete(p_code text, p_reason text DEFAULT 'KleenestOS Passport catalog delete'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_previous jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required'; end if;
  select to_jsonb(c) into v_previous from public.passport_stamp_catalog c where code=p_code;
  if v_previous is null then raise exception 'passport stamp not found'; end if;
  delete from public.passport_stamp_catalog where code=p_code;
  insert into public.passport_catalog_audit(actor_user_id,stamp_code,action,reason,previous_state,next_state)
  values(v_actor,p_code,'delete',coalesce(nullif(trim(p_reason),''),'KleenestOS Passport catalog delete'),v_previous,null);
  return jsonb_build_object('ok',true,'deleted_code',p_code);
end $function$;

CREATE OR REPLACE FUNCTION public.owner_passport_stamp_upsert(p_code text, p_patch jsonb, p_reason text DEFAULT 'KleenestOS Passport catalog update'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_previous jsonb; v_next jsonb; v_name text;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required'; end if;
  if p_code is null or p_code !~ '^[a-z0-9_-]{2,80}$' then raise exception 'invalid stamp code'; end if;
  if p_patch is null then p_patch='{}'::jsonb; end if;
  select to_jsonb(c) into v_previous from public.passport_stamp_catalog c where code=p_code;
  v_name=coalesce(nullif(trim(p_patch->>'name'),''),v_previous->>'name');
  if v_name is null then raise exception 'stamp name required'; end if;
  insert into public.passport_stamp_catalog(code,name,description,icon,category,trigger_kind,criteria,active,reward_xp,public_default,sort_order)
  values(
    p_code,v_name,coalesce(p_patch->>'description',''),coalesce(nullif(p_patch->>'icon',''),'✦'),coalesce(nullif(p_patch->>'category',''),'achievement'),
    coalesce(nullif(p_patch->>'trigger_kind',''),'system'),coalesce(p_patch->'criteria','{}'::jsonb),coalesce((p_patch->>'active')::boolean,true),
    greatest(0,coalesce((p_patch->>'reward_xp')::int,0)),coalesce((p_patch->>'public_default')::boolean,true),coalesce((p_patch->>'sort_order')::int,100)
  ) on conflict(code) do update set
    name=coalesce(nullif(p_patch->>'name',''),public.passport_stamp_catalog.name),
    description=coalesce(p_patch->>'description',public.passport_stamp_catalog.description),
    icon=coalesce(nullif(p_patch->>'icon',''),public.passport_stamp_catalog.icon),
    category=coalesce(nullif(p_patch->>'category',''),public.passport_stamp_catalog.category),
    trigger_kind=coalesce(nullif(p_patch->>'trigger_kind',''),public.passport_stamp_catalog.trigger_kind),
    criteria=coalesce(p_patch->'criteria',public.passport_stamp_catalog.criteria),
    active=coalesce((p_patch->>'active')::boolean,public.passport_stamp_catalog.active),
    reward_xp=greatest(0,coalesce((p_patch->>'reward_xp')::int,public.passport_stamp_catalog.reward_xp)),
    public_default=coalesce((p_patch->>'public_default')::boolean,public.passport_stamp_catalog.public_default),
    sort_order=coalesce((p_patch->>'sort_order')::int,public.passport_stamp_catalog.sort_order),
    updated_at=now();
  select to_jsonb(c) into v_next from public.passport_stamp_catalog c where code=p_code;
  insert into public.passport_catalog_audit(actor_user_id,stamp_code,action,reason,previous_state,next_state)
  values(v_actor,p_code,case when v_previous is null then 'create' else 'update' end,coalesce(nullif(trim(p_reason),''),'KleenestOS Passport catalog update'),v_previous,v_next);
  return v_next;
end $function$;

CREATE OR REPLACE FUNCTION public.public_passport_summary(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'places',(select count(*) from public.user_passport_visits where user_id=p_user_id and public_visible=true),
    'cities',(select count(distinct nullif(trim(city_snapshot),'')) from public.user_passport_visits where user_id=p_user_id and public_visible=true),
    'states',(select count(distinct nullif(trim(state_snapshot),'')) from public.user_passport_visits where user_id=p_user_id and public_visible=true),
    'stamps',coalesce((select jsonb_agg(jsonb_build_object('code',stamp_code,'name',stamp_name_snapshot,'icon',icon_snapshot,'category',category_snapshot,'earned_at',earned_at) order by earned_at desc)
      from (select * from public.user_passport_stamps where user_id=p_user_id and public_visible=true order by earned_at desc limit 12) s),'[]'::jsonb)
  );
$function$;

drop trigger if exists trg_passport_checkin on public.check_ins;
CREATE TRIGGER trg_passport_checkin AFTER INSERT ON check_ins FOR EACH ROW EXECUTE FUNCTION _passport_refresh_visit_from_checkin();

drop trigger if exists trg_passport_photo_stamp on public.review_photos;
CREATE TRIGGER trg_passport_photo_stamp AFTER INSERT ON review_photos FOR EACH ROW EXECUTE FUNCTION _passport_photo_stamp_trigger();

drop trigger if exists trg_passport_review_stamp on public.reviews;
CREATE TRIGGER trg_passport_review_stamp AFTER INSERT OR UPDATE OF status ON reviews FOR EACH ROW EXECUTE FUNCTION _passport_review_stamp_trigger();


revoke all on function public._passport_award_stamp(uuid,text,text,uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public._passport_award_stamp(uuid,text,text,uuid,text,uuid,jsonb) to service_role;
revoke all on function public._passport_refresh_visit_from_checkin() from public, anon, authenticated;
revoke all on function public._passport_review_stamp_trigger() from public, anon, authenticated;
revoke all on function public._passport_photo_stamp_trigger() from public, anon, authenticated;
revoke all on function public._passport_backfill_user(uuid) from public, anon, authenticated;
grant execute on function public._passport_backfill_user(uuid) to service_role;

revoke all on function public.consumer_passport_snapshot() from public, anon;
grant execute on function public.consumer_passport_snapshot() to authenticated;
revoke all on function public.consumer_set_passport_visibility(text,uuid,boolean) from public, anon;
grant execute on function public.consumer_set_passport_visibility(text,uuid,boolean) to authenticated;
revoke all on function public.public_passport_summary(uuid) from public;
grant execute on function public.public_passport_summary(uuid) to anon, authenticated;
revoke all on function public.owner_passport_stamp_catalog() from public, anon;
grant execute on function public.owner_passport_stamp_catalog() to authenticated;
revoke all on function public.owner_passport_snapshot() from public, anon;
grant execute on function public.owner_passport_snapshot() to authenticated;
revoke all on function public.owner_passport_stamp_upsert(text,jsonb,text) from public, anon;
grant execute on function public.owner_passport_stamp_upsert(text,jsonb,text) to authenticated;
revoke all on function public.owner_passport_stamp_delete(text,text) from public, anon;
grant execute on function public.owner_passport_stamp_delete(text,text) to authenticated;

insert into public.user_passport_visits(
  user_id,location_id,first_check_in_id,first_visited_at,last_visited_at,visit_count,
  location_name_snapshot,city_snapshot,state_snapshot,country_snapshot,place_type_snapshot,
  verification_method,points_earned,public_visible
)
select c.user_id,c.location_id,(array_agg(c.id order by c.checked_in_at asc))[1],min(c.checked_in_at),max(c.checked_in_at),count(*)::int,
  l.name,l.city,l.state,l.country,l.place_type,(array_agg(c.verification_method order by c.checked_in_at desc))[1],coalesce(sum(c.points_awarded),0)::int,true
from public.check_ins c join public.locations l on l.id=c.location_id
group by c.user_id,c.location_id,l.name,l.city,l.state,l.country,l.place_type
on conflict(user_id,location_id) do update set
  first_visited_at=least(public.user_passport_visits.first_visited_at,excluded.first_visited_at),
  last_visited_at=greatest(public.user_passport_visits.last_visited_at,excluded.last_visited_at),
  visit_count=excluded.visit_count,location_name_snapshot=excluded.location_name_snapshot,
  city_snapshot=excluded.city_snapshot,state_snapshot=excluded.state_snapshot,country_snapshot=excluded.country_snapshot,
  place_type_snapshot=excluded.place_type_snapshot,verification_method=excluded.verification_method,
  points_earned=excluded.points_earned,updated_at=now();

do $$ declare u record; begin
  for u in select distinct user_id from public.user_passport_visits loop
    perform public._passport_backfill_user(u.user_id);
  end loop;
end $$;
