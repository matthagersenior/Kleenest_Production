create table if not exists public.progression_reward_catalog (
  code text primary key,
  reward_kind text not null check (reward_kind in ('theme','badge_showcase','profile_space','title')),
  reward_key text not null,
  name text not null,
  description text,
  active boolean not null default true,
  owner_only boolean not null default true,
  progression_unlock_enabled boolean not null default false,
  min_global_level integer not null default 1 check (min_global_level >= 1),
  min_trust_score integer not null default 0 check (min_trust_score between 0 and 100),
  min_lifetime_xp bigint not null default 0 check (min_lifetime_xp >= 0),
  min_badges integer not null default 0 check (min_badges >= 0),
  available_from timestamptz,
  available_until timestamptz,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_progression_reward_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_code text not null references public.progression_reward_catalog(code) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  source text not null default 'owner' check (source in ('owner','progression','system')),
  reason text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists user_progression_reward_grants_active_unique
  on public.user_progression_reward_grants(user_id,reward_code)
  where revoked_at is null;
create index if not exists user_progression_reward_grants_user_idx
  on public.user_progression_reward_grants(user_id,granted_at desc);
create index if not exists user_progression_reward_grants_reward_idx
  on public.user_progression_reward_grants(reward_code,granted_at desc);

create table if not exists public.review_trust_discovery_awards (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  highest_band integer not null default 1 check (highest_band between 1 and 6),
  cumulative_xp integer not null default 0 check (cumulative_xp >= 0),
  last_source text,
  internal_signals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.progression_reward_catalog enable row level security;
alter table public.user_progression_reward_grants enable row level security;
alter table public.review_trust_discovery_awards enable row level security;

revoke all on table public.progression_reward_catalog from anon, authenticated;
revoke all on table public.user_progression_reward_grants from anon, authenticated;
revoke all on table public.review_trust_discovery_awards from anon, authenticated;

insert into public.progression_reward_catalog
(code,reward_kind,reward_key,name,description,active,owner_only,progression_unlock_enabled,min_global_level,min_trust_score,min_lifetime_xp,min_badges,sort_order,metadata)
values
('theme_fall_2026','theme','fall','Autumn Trail','Warm leaves, field notes and harvest-light surfaces for Kleenest explorers.',true,true,false,10,20,10125,2,110,
 '{"season":"fall","future_unlock":"Level 10 + Contributor trust","palette":"autumn","badge_code":"seasonal-autumn-trail-crest"}'::jsonb),
('theme_halloween_2026','theme','halloween','Night Watch','A midnight Halloween edition with pumpkin fire, moonlit violet and eerie trust signals.',true,true,false,25,40,72000,5,120,
 '{"season":"halloween","future_unlock":"Level 25 + Trusted","palette":"night_watch","badge_code":"seasonal-night-watch-crest"}'::jsonb),
('theme_thanksgiving_2026','theme','thanksgiving','Harvest Table','A rich Thanksgiving edition built around parchment, cranberry, copper and gratitude.',true,true,false,50,70,300125,10,130,
 '{"season":"thanksgiving","future_unlock":"Level 50 + Verified","palette":"harvest_table","badge_code":"seasonal-harvest-guardian-crest"}'::jsonb),
('theme_christmas_2026','theme','christmas','Winter Guardian','The furthest seasonal reward: deep evergreen, snow, gold and winter-red for Kleenest Trust Guardians.',true,true,false,75,90,684500,16,140,
 '{"season":"christmas","future_unlock":"Level 75 + Trust Guardian","palette":"winter_guardian","badge_code":"seasonal-winter-guardian-crest"}'::jsonb)
on conflict (code) do update set
  reward_kind=excluded.reward_kind,
  reward_key=excluded.reward_key,
  name=excluded.name,
  description=excluded.description,
  active=excluded.active,
  owner_only=excluded.owner_only,
  progression_unlock_enabled=excluded.progression_unlock_enabled,
  min_global_level=excluded.min_global_level,
  min_trust_score=excluded.min_trust_score,
  min_lifetime_xp=excluded.min_lifetime_xp,
  min_badges=excluded.min_badges,
  sort_order=excluded.sort_order,
  metadata=excluded.metadata,
  updated_at=now();

insert into public.badges(code,name,description,icon,criteria)
values
('seasonal-autumn-trail-crest','Autumn Trail Crest','Earned by contributors who reach the first public progression-and-trust showcase gate.','🍁', '{"type":"progression_identity","min_level":10,"min_trust":20,"public_showcase":true,"seasonal_crest":true,"tier":1}'::jsonb),
('seasonal-night-watch-crest','Night Watch Crest','A public crest for Pathfinders whose evidence history has reached Trusted standing.','🎃', '{"type":"progression_identity","min_level":25,"min_trust":40,"public_showcase":true,"seasonal_crest":true,"tier":2}'::jsonb),
('seasonal-harvest-guardian-crest','Harvest Guardian Crest','A public crest for experienced contributors with Verified evidence standing.','🌾', '{"type":"progression_identity","min_level":50,"min_trust":70,"public_showcase":true,"seasonal_crest":true,"tier":3}'::jsonb),
('seasonal-winter-guardian-crest','Winter Guardian Crest','The highest seasonal public crest, reserved for Kleenest Legends with Trust Guardian standing.','❄️', '{"type":"progression_identity","min_level":75,"min_trust":90,"public_showcase":true,"seasonal_crest":true,"tier":4}'::jsonb)
on conflict (code) do update set
  name=excluded.name,description=excluded.description,icon=excluded.icon,criteria=excluded.criteria;

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

  return jsonb_build_object(
    'level',v_level_no,
    'level_title',v_level_title,
    'lifetime_xp',v_total_xp,
    'trust_score',v_trust_score,
    'trust_rank',v_trust_rank,
    'evidence_level',coalesce(v_rep.verification_level,'new'),
    'badge_count',v_badges,
    'showcase_slots',v_slots,
    'public_showcase_unlocked',(v_level_no>=10 and v_trust_score>=20)
  );
end
$$;

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

  return v_count;
end
$$;

create or replace function internal.evaluate_review_trust_discovery(p_review_id uuid,p_source text default 'review')
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_review public.reviews%rowtype;
  v_verified boolean:=false;
  v_amenities integer:=0;
  v_photos integer:=0;
  v_score integer:=0;
  v_band integer:=1;
  v_cumulative integer:=0;
  v_previous integer:=0;
  v_delta integer:=0;
  v_event uuid;
begin
  select * into v_review from public.reviews where id=p_review_id and status='published';
  if not found or v_review.user_id is null then return jsonb_build_object('awarded',false); end if;

  if v_review.check_in_id is not null then
    select exists(
      select 1 from public.check_ins c
      where c.id=v_review.check_in_id
        and c.user_id=v_review.user_id
        and c.location_id=v_review.location_id
        and coalesce((c.metadata->>'progression_eligible')::boolean,false)
    ) into v_verified;
  end if;

  select count(distinct ao.amenity_id)::integer into v_amenities
  from public.location_amenity_observations ao
  where ao.user_id=v_review.user_id and ao.location_id=v_review.location_id
    and v_review.check_in_id is not null and ao.check_in_id=v_review.check_in_id;

  select count(*)::integer into v_photos
  from public.review_photos rp
  where rp.review_id=v_review.id and rp.moderation_status='visible';

  v_score:=
    (case when v_verified then 1 else 0 end)+
    (case when v_review.cleanliness_pct is not null then 1 else 0 end)+
    (case when length(coalesce(v_review.comment,''))>=80 then 1 else 0 end)+
    (case when length(coalesce(v_review.comment,''))>=180 then 1 else 0 end)+
    (case when v_amenities>0 then 1 else 0 end)+
    (case when v_photos>0 then 1 else 0 end);

  v_band:=greatest(1,least(6,v_score));
  v_cumulative:=case v_band
    when 1 then 0
    when 2 then 8
    when 3 then 18
    when 4 then 32
    when 5 then 48
    else 70 end;

  insert into public.review_trust_discovery_awards(review_id,user_id,highest_band,cumulative_xp,last_source,internal_signals)
  values(v_review.id,v_review.user_id,1,0,p_source,jsonb_build_object('verified',v_verified,'amenity_count',v_amenities,'photo_count',v_photos,'quality_score',v_score))
  on conflict(review_id) do nothing;

  select cumulative_xp into v_previous
  from public.review_trust_discovery_awards
  where review_id=v_review.id
  for update;

  v_delta:=greatest(0,v_cumulative-coalesce(v_previous,0));
  if v_delta>0 then
    insert into public.progression_events_v2(
      user_id,action,location_id,subject,evidence_tier,base_xp,multiplier,xp_awarded,idempotency_key,status
    ) values(
      v_review.user_id,'substantive_review',v_review.location_id,
      jsonb_build_object('source_type','review','source_id',v_review.id,'trust_discovery',true,'mystery',true,'quality_band',v_band),
      v_band,v_delta,1,v_delta,'trust-discovery:'||v_review.id::text||':'||v_band::text,'awarded'
    )
    on conflict(user_id,idempotency_key) do nothing
    returning id into v_event;

    if v_event is not null then
      insert into public.progression_metric_events(user_id,metric,source_type,source_id,quantity,points_awarded,metadata)
      values(v_review.user_id,'review_trust_discovery','review',v_review.id,1,v_delta,jsonb_build_object('quality_band',v_band,'mystery',true));
    end if;
  end if;

  update public.review_trust_discovery_awards
  set highest_band=greatest(highest_band,v_band),
      cumulative_xp=greatest(cumulative_xp,v_cumulative),
      last_source=p_source,
      internal_signals=jsonb_build_object('verified',v_verified,'amenity_count',v_amenities,'photo_count',v_photos,'quality_score',v_score),
      updated_at=now()
  where review_id=v_review.id;

  perform internal.award_progression_identity_badges(v_review.user_id);

  return jsonb_build_object(
    'awarded',v_delta>0,
    'xp_awarded',v_delta,
    'quality_band',v_band,
    'message',case when v_delta>0 then 'Trust Discovery unlocked' else null end
  );
end
$$;

create or replace function internal.trg_review_trust_discovery()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform internal.evaluate_review_trust_discovery(new.id,'review');
  return new;
exception when others then
  raise warning 'Review trust discovery skipped: %',sqlerrm;
  return new;
end
$$;

drop trigger if exists review_trust_discovery on public.reviews;
create trigger review_trust_discovery
after insert or update of comment,cleanliness_pct,status on public.reviews
for each row execute function internal.trg_review_trust_discovery();

create or replace function internal.trg_review_photo_trust_discovery()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform internal.evaluate_review_trust_discovery(new.review_id,'review_photo');
  return new;
exception when others then
  raise warning 'Review photo trust discovery skipped: %',sqlerrm;
  return new;
end
$$;

drop trigger if exists review_photo_trust_discovery on public.review_photos;
create trigger review_photo_trust_discovery
after insert on public.review_photos
for each row execute function internal.trg_review_photo_trust_discovery();

create or replace function internal.trg_amenity_review_trust_discovery()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_review_id uuid;
begin
  if new.check_in_id is null or new.user_id is null then return new; end if;
  select r.id into v_review_id
  from public.reviews r
  where r.check_in_id=new.check_in_id and r.user_id=new.user_id and r.location_id=new.location_id and r.status='published'
  order by r.created_at desc limit 1;
  if v_review_id is not null then
    perform internal.evaluate_review_trust_discovery(v_review_id,'amenity_observation');
  end if;
  return new;
exception when others then
  raise warning 'Amenity trust discovery skipped: %',sqlerrm;
  return new;
end
$$;

drop trigger if exists amenity_review_trust_discovery on public.location_amenity_observations;
create trigger amenity_review_trust_discovery
after insert on public.location_amenity_observations
for each row execute function internal.trg_amenity_review_trust_discovery();

create or replace function internal.trg_progression_identity_badges()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform internal.award_progression_identity_badges(new.user_id);
  return new;
exception when others then
  raise warning 'Progression identity badge evaluation skipped: %',sqlerrm;
  return new;
end
$$;

drop trigger if exists progression_identity_badges_on_xp on public.progression_events_v2;
create trigger progression_identity_badges_on_xp
after insert on public.progression_events_v2
for each row execute function internal.trg_progression_identity_badges();

create or replace function internal.trg_reputation_identity_badges()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform internal.award_progression_identity_badges(new.user_id);
  return new;
exception when others then
  raise warning 'Reputation identity badge evaluation skipped: %',sqlerrm;
  return new;
end
$$;

drop trigger if exists progression_identity_badges_on_reputation on public.contributor_reputation;
create trigger progression_identity_badges_on_reputation
after insert or update on public.contributor_reputation
for each row execute function internal.trg_reputation_identity_badges();

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
  v_owner:=public.is_platform_owner_session();
  v_identity:=internal.progression_public_identity(v_user);

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'code',c.code,
        'reward_kind',c.reward_kind,
        'reward_key',c.reward_key,
        'name',c.name,
        'description',c.description,
        'owner_only',c.owner_only,
        'progression_unlock_enabled',c.progression_unlock_enabled,
        'unlocked',(
          v_owner
          or exists(select 1 from public.user_progression_reward_grants g where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null)
          or (
            c.progression_unlock_enabled and not c.owner_only
            and coalesce((v_identity->>'level')::integer,1)>=c.min_global_level
            and coalesce((v_identity->>'trust_score')::integer,0)>=c.min_trust_score
            and coalesce((v_identity->>'lifetime_xp')::bigint,0)>=c.min_lifetime_xp
            and coalesce((v_identity->>'badge_count')::integer,0)>=c.min_badges
          )
        ),
        'unlock_source',case
          when v_owner then 'platform_owner'
          when exists(select 1 from public.user_progression_reward_grants g where g.user_id=v_user and g.reward_code=c.code and g.revoked_at is null) then 'owner_grant'
          when c.progression_unlock_enabled and not c.owner_only
            and coalesce((v_identity->>'level')::integer,1)>=c.min_global_level
            and coalesce((v_identity->>'trust_score')::integer,0)>=c.min_trust_score
            and coalesce((v_identity->>'lifetime_xp')::bigint,0)>=c.min_lifetime_xp
            and coalesce((v_identity->>'badge_count')::integer,0)>=c.min_badges then 'progression'
          else 'locked' end,
        'requirements',jsonb_build_object(
          'level',c.min_global_level,'trust_score',c.min_trust_score,'lifetime_xp',c.min_lifetime_xp,'badges',c.min_badges
        ),
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

create or replace function public.owner_progression_reward_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner authorization required'; end if;
  return (
    select coalesce(jsonb_agg(
      to_jsonb(c) || jsonb_build_object(
        'active_grants',(select count(*) from public.user_progression_reward_grants g where g.reward_code=c.code and g.revoked_at is null),
        'recent_grants',(select coalesce(jsonb_agg(jsonb_build_object(
          'id',g.id,'user_id',g.user_id,'display_name',p.display_name,'username',p.username,
          'source',g.source,'reason',g.reason,'granted_at',g.granted_at
        ) order by g.granted_at desc),'[]'::jsonb)
        from (
          select * from public.user_progression_reward_grants gg
          where gg.reward_code=c.code and gg.revoked_at is null
          order by gg.granted_at desc limit 10
        ) g
        join public.profiles p on p.id=g.user_id)
      )
      order by c.sort_order,c.name
    ),'[]'::jsonb)
    from public.progression_reward_catalog c
  );
end
$$;

create or replace function public.owner_grant_progression_reward(
  p_target_user_id uuid,p_reward_code text,p_reason text default 'Owner seasonal reward grant'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner authorization required'; end if;
  if not exists(select 1 from public.profiles where id=p_target_user_id) then raise exception 'profile not found'; end if;
  if not exists(select 1 from public.progression_reward_catalog where code=p_reward_code and active) then raise exception 'reward not found'; end if;

  if exists(select 1 from public.user_progression_reward_grants where user_id=p_target_user_id and reward_code=p_reward_code and revoked_at is null) then
    return jsonb_build_object('granted',true,'duplicate',true,'user_id',p_target_user_id,'reward_code',p_reward_code);
  end if;

  insert into public.user_progression_reward_grants(user_id,reward_code,granted_by,source,reason)
  values(p_target_user_id,p_reward_code,auth.uid(),'owner',coalesce(nullif(trim(p_reason),''),'Owner seasonal reward grant'))
  returning id into v_id;

  return jsonb_build_object('granted',true,'duplicate',false,'grant_id',v_id,'user_id',p_target_user_id,'reward_code',p_reward_code);
end
$$;

create or replace function public.owner_revoke_progression_reward(
  p_target_user_id uuid,p_reward_code text,p_reason text default 'Owner seasonal reward revoke'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner authorization required'; end if;
  update public.user_progression_reward_grants
  set revoked_at=now(),reason=coalesce(nullif(trim(p_reason),''),reason,'Owner seasonal reward revoke')
  where user_id=p_target_user_id and reward_code=p_reward_code and revoked_at is null;
  get diagnostics v_count=row_count;
  return jsonb_build_object('revoked',v_count>0,'count',v_count,'user_id',p_target_user_id,'reward_code',p_reward_code);
end
$$;

create or replace function public.owner_update_progression_reward_policy(
  p_reward_code text,
  p_owner_only boolean,
  p_progression_unlock_enabled boolean,
  p_min_global_level integer,
  p_min_trust_score integer,
  p_min_lifetime_xp bigint,
  p_min_badges integer,
  p_reason text default 'Owner progression reward policy update'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_row public.progression_reward_catalog;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner authorization required'; end if;
  if p_min_global_level<1 or p_min_trust_score<0 or p_min_trust_score>100 or p_min_lifetime_xp<0 or p_min_badges<0 then
    raise exception 'invalid progression requirement';
  end if;
  update public.progression_reward_catalog
  set owner_only=p_owner_only,
      progression_unlock_enabled=p_progression_unlock_enabled,
      min_global_level=p_min_global_level,
      min_trust_score=p_min_trust_score,
      min_lifetime_xp=p_min_lifetime_xp,
      min_badges=p_min_badges,
      metadata=metadata||jsonb_build_object('last_policy_reason',coalesce(nullif(trim(p_reason),''),'Owner progression reward policy update'),'last_policy_actor',auth.uid(),'last_policy_at',now()),
      updated_at=now()
  where code=p_reward_code
  returning * into v_row;
  if not found then raise exception 'reward not found'; end if;
  return to_jsonb(v_row);
end
$$;

create or replace function public.community_contributor_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_user_id is null then raise exception 'User id is required'; end if;
  if exists(select 1 from public.user_blocks b where b.blocker_id=p_user_id and b.blocked_id=auth.uid()) then
    raise exception 'Contributor unavailable';
  end if;
  select jsonb_build_object(
    'profile', jsonb_build_object('id',p.id,'display_name',p.display_name,'username',p.username,'avatar_url',p.avatar_url,'bio',p.bio,'points',p.points,'level',p.level,'streak',p.streak,'total_check_ins',p.total_check_ins,'total_reviews',p.total_reviews),
    'progression_identity',internal.progression_public_identity(p.id),
    'reputation', case when cr.user_id is null then jsonb_build_object('score',0,'level','new') else jsonb_build_object('score',cr.reputation_score,'level',cr.verification_level,'updated_at',cr.updated_at) end,
    'helpful_received',(select count(*) from public.review_likes rl join public.reviews rr on rr.id=rl.review_id where rr.user_id=p.id and rr.status='published' and rl.user_id<>p.id),
    'verified_review_count',(select count(*) from public.reviews vr where vr.user_id=p.id and vr.status='published' and vr.check_in_id is not null),
    'badges',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'code',b.code,'name',b.name,'description',b.description,'icon',b.icon,'earned_at',ub.earned_at,'criteria',b.criteria) order by coalesce((b.criteria->>'public_showcase')::boolean,false) desc,ub.earned_at desc),'[]'::jsonb) from public.user_badges ub join public.badges b on b.id=ub.badge_id where ub.user_id=p.id),
    'reviews',(
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',r.id,'location_id',r.location_id,'check_in_id',r.check_in_id,'stars',r.stars,'cleanliness_pct',r.cleanliness_pct,'comment',r.comment,'created_at',r.created_at,
          'helpful_count',(select count(*) from public.review_likes rl where rl.review_id=r.id),
          'verified_checked_in_at',case when ci.id is not null then ci.checked_in_at end,
          'verified_check_in_method',case when ci.id is not null then ci.verification_method end,
          'verified_distance_meters',case when ci.id is not null then ci.distance_meters end,
          'photo_evidence_count',(select count(*) from public.review_photos rp where rp.review_id=r.id),
          'amenity_evidence_count',(select count(distinct ao.amenity_id) from public.location_amenity_observations ao where ci.id is not null and ao.location_id=r.location_id and ao.user_id=r.user_id and ao.check_in_id=ci.id)
        ) order by r.created_at desc
      ),'[]'::jsonb)
      from (select * from public.reviews where user_id=p.id and status='published' order by created_at desc limit 20) r
      left join public.check_ins ci on ci.id=r.check_in_id and ci.user_id=r.user_id and ci.location_id=r.location_id
    )
  ) into result
  from public.profiles p
  left join public.contributor_reputation cr on cr.user_id=p.id
  where p.id=p_user_id and coalesce(p.is_demo_test,false)=false;
  if result is null then raise exception 'Contributor not found'; end if;
  return result;
end
$$;

revoke all on function internal.progression_public_identity(uuid) from public, anon, authenticated;
revoke all on function internal.award_progression_identity_badges(uuid) from public, anon, authenticated;
revoke all on function internal.evaluate_review_trust_discovery(uuid,text) from public, anon, authenticated;
revoke all on function internal.trg_review_trust_discovery() from public, anon, authenticated;
revoke all on function internal.trg_review_photo_trust_discovery() from public, anon, authenticated;
revoke all on function internal.trg_amenity_review_trust_discovery() from public, anon, authenticated;
revoke all on function internal.trg_progression_identity_badges() from public, anon, authenticated;
revoke all on function internal.trg_reputation_identity_badges() from public, anon, authenticated;

revoke all on function public.consumer_progression_rewards() from public, anon;
grant execute on function public.consumer_progression_rewards() to authenticated;

revoke all on function public.owner_progression_reward_catalog() from public, anon;
grant execute on function public.owner_progression_reward_catalog() to authenticated;
revoke all on function public.owner_grant_progression_reward(uuid,text,text) from public, anon;
grant execute on function public.owner_grant_progression_reward(uuid,text,text) to authenticated;
revoke all on function public.owner_revoke_progression_reward(uuid,text,text) from public, anon;
grant execute on function public.owner_revoke_progression_reward(uuid,text,text) to authenticated;
revoke all on function public.owner_update_progression_reward_policy(text,boolean,boolean,integer,integer,bigint,integer,text) from public, anon;
grant execute on function public.owner_update_progression_reward_policy(text,boolean,boolean,integer,integer,bigint,integer,text) to authenticated;
