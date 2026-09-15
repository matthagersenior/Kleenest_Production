-- Permanent canonical QR identities for claimed and unclaimed Kleenest locations.
-- Community QR identity is intentionally distinct from business ownership:
-- a code can exist before a claim, survive a claim/transfer, and gain capabilities without rotating.

alter table public.qr_codes
  alter column business_id drop not null,
  add column if not exists canonical_location_identity boolean not null default false,
  add column if not exists identity_scope text not null default 'business',
  add column if not exists placement_status text not null default 'digital_only';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.qr_codes'::regclass
      and conname='qr_codes_identity_scope_ck'
  ) then
    alter table public.qr_codes
      add constraint qr_codes_identity_scope_ck
      check (identity_scope in ('business','community'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.qr_codes'::regclass
      and conname='qr_codes_placement_status_ck'
  ) then
    alter table public.qr_codes
      add constraint qr_codes_placement_status_ck
      check (placement_status in ('digital_only','placed_unverified','placement_verified','disputed'));
  end if;
end $$;

create unique index if not exists qr_codes_one_canonical_location_identity_idx
  on public.qr_codes(location_id)
  where canonical_location_identity and location_id is not null;

create index if not exists qr_codes_location_identity_scope_idx
  on public.qr_codes(location_id,identity_scope,placement_status)
  where canonical_location_identity;

create table if not exists public.qr_location_placement_events (
  id uuid primary key default gen_random_uuid(),
  qr_code_id uuid not null references public.qr_codes(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('placed','placement_verified','damaged','missing','unauthorized','removed')),
  latitude double precision,
  longitude double precision,
  distance_meters double precision,
  metadata jsonb not null default '{}'::jsonb,
  review_status text not null default 'resolved' check (review_status in ('open','resolved','dismissed')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

create index if not exists qr_location_placement_events_qr_created_idx
  on public.qr_location_placement_events(qr_code_id,created_at desc);
create index if not exists qr_location_placement_events_location_created_idx
  on public.qr_location_placement_events(location_id,created_at desc);
create index if not exists qr_location_placement_events_open_idx
  on public.qr_location_placement_events(review_status,created_at desc)
  where review_status='open';

alter table public.qr_location_placement_events enable row level security;
revoke all on table public.qr_location_placement_events from public,anon,authenticated;
grant select,insert,update,delete on table public.qr_location_placement_events to service_role;

insert into public.progression_xp_actions(
  action,base_xp,specialty,cooldown_seconds,max_per_day,enabled,metadata
)
values
  ('qr_place',20,null,0,5,true,jsonb_build_object(
    'source','canonical_location_qr',
    'description','Recorded an on-site placement for a canonical location QR.'
  )),
  ('qr_verify',35,null,0,8,true,jsonb_build_object(
    'source','canonical_location_qr',
    'description','Independently verified an on-site canonical location QR placement.'
  ))
on conflict(action) do nothing;

create or replace function public.ensure_location_qr_identity(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_location public.locations;
  v_qr public.qr_codes;
  v_business uuid;
  v_network jsonb:='{}'::jsonb;
  v_network_verified boolean:=false;
  v_business_claimed boolean:=false;
  v_trust_state text:='community';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_location_id is null then raise exception 'Location is required'; end if;

  select *
  into v_location
  from public.locations
  where id=p_location_id and coalesce(is_active,true)
  limit 1;

  if not found then raise exception 'Location not found or inactive'; end if;

  v_business:=coalesce(
    v_location.claimed_business_id,
    v_location.business_id,
    (
      select lc.business_id
      from public.location_claims lc
      where lc.location_id=p_location_id
        and lower(coalesce(lc.status,'')) in ('approved','verified','active','claimed')
      order by lc.updated_at desc nulls last,lc.created_at desc nulls last
      limit 1
    )
  );

  select *
  into v_qr
  from public.qr_codes q
  where q.location_id=p_location_id
    and q.canonical_location_identity
  limit 1
  for update;

  if not found then
    insert into public.qr_codes(
      business_id,location_id,code,active,label,customization,purpose,action_type,
      action_payload,single_use,max_redemptions,canonical_location_identity,
      identity_scope,placement_status
    )
    values(
      v_business,
      p_location_id,
      'KLC'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,24)),
      true,
      coalesce(nullif(trim(coalesce(v_location.name,'')),''),'Kleenest location')||' · Location QR',
      public.qr_studio_validate_customization('{}'::jsonb),
      'location_identity',
      'location_details',
      jsonb_build_object('location_id',p_location_id,'route','location','canonical_location_identity',true),
      false,
      null,
      true,
      case when v_business is null then 'community' else 'business' end,
      'digital_only'
    )
    on conflict do nothing;

    select *
    into v_qr
    from public.qr_codes q
    where q.location_id=p_location_id
      and q.canonical_location_identity
    limit 1
    for update;

    if not found then raise exception 'Canonical location QR could not be created'; end if;
  end if;

  if v_qr.business_id is distinct from v_business
     or v_qr.identity_scope is distinct from case when v_business is null then 'community' else 'business' end then
    update public.qr_codes
    set business_id=v_business,
        identity_scope=case when v_business is null then 'community' else 'business' end,
        action_payload=coalesce(action_payload,'{}'::jsonb)
          || jsonb_build_object('location_id',p_location_id,'route','location','canonical_location_identity',true)
    where id=v_qr.id
    returning * into v_qr;
  end if;

  begin
    select t.value
    into v_network
    from public.mobile_location_network_statuses(array[p_location_id]::uuid[]) as t(value)
    limit 1;
  exception when others then
    v_network:='{}'::jsonb;
  end;

  v_network_verified:=coalesce((v_network->>'network_verified')::boolean,false);
  v_business_claimed:=coalesce((v_network->>'business_claimed')::boolean,false) or v_business is not null;

  v_trust_state:=case
    when v_business_claimed then 'business_claimed'
    when v_network_verified then 'kleenest_verified'
    when v_qr.placement_status='placement_verified' then 'placement_verified'
    else 'community'
  end;

  return jsonb_build_object(
    'id',v_qr.id,
    'code',v_qr.code,
    'location_id',v_qr.location_id,
    'location_name',v_location.name,
    'location_address',v_location.address,
    'business_id',v_business,
    'label',v_qr.label,
    'purpose',v_qr.purpose,
    'action_type',v_qr.action_type,
    'action_payload',coalesce(v_qr.action_payload,'{}'::jsonb),
    'single_use',coalesce(v_qr.single_use,false),
    'canonical_location_identity',true,
    'qr_scope',case when v_business is null then 'community' else 'business' end,
    'placement_status',v_qr.placement_status,
    'trust_state',v_trust_state,
    'business_claimed',v_business_claimed,
    'network_verified',v_network_verified,
    'claimable',not v_business_claimed,
    'network',v_network,
    'deep_link','kleenest://qr?code='||v_qr.code
  );
end;
$$;

revoke all on function public.ensure_location_qr_identity(uuid) from public,anon;
grant execute on function public.ensure_location_qr_identity(uuid) to authenticated,service_role;

create or replace function public.record_location_qr_placement_event(
  p_code text,
  p_event_type text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_event_type text:=lower(trim(coalesce(p_event_type,'')));
  v_qr_id uuid;
  v_location_id uuid;
  v_placement_status text;
  v_location_lat double precision;
  v_location_lng double precision;
  v_radius double precision;
  v_distance double precision;
  v_event_id uuid;
  v_progression jsonb:='{}'::jsonb;
  v_existing uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(trim(coalesce(p_code,'')),'') is null then raise exception 'QR code is required'; end if;
  if v_event_type not in ('placed','placement_verified','damaged','missing','unauthorized','removed') then
    raise exception 'Unsupported QR placement event';
  end if;

  select q.id,q.location_id,q.placement_status,l.latitude,l.longitude,
         greatest(50,least(coalesce(l.geofence_radius_m,150),500))::double precision
  into v_qr_id,v_location_id,v_placement_status,v_location_lat,v_location_lng,v_radius
  from public.qr_codes q
  join public.locations l on l.id=q.location_id
  where q.code=trim(p_code)
    and q.active=true
    and q.canonical_location_identity
    and coalesce(l.is_active,true)
  limit 1;

  if v_qr_id is null then raise exception 'Canonical location QR not found or inactive'; end if;

  if v_event_type in ('placed','placement_verified') then
    if p_lat is null or p_lng is null
       or p_lat not between -90 and 90
       or p_lng not between -180 and 180 then
      raise exception 'LOCATION_REQUIRED';
    end if;
    if v_location_lat is null or v_location_lng is null then
      raise exception 'LOCATION_COORDINATES_UNAVAILABLE';
    end if;

    v_distance:=6371000.0*2*asin(
      sqrt(
        power(sin(radians(p_lat-v_location_lat)/2),2)
        + cos(radians(v_location_lat))*cos(radians(p_lat))
        * power(sin(radians(p_lng-v_location_lng)/2),2)
      )
    );

    if v_distance>v_radius then
      raise exception 'OUTSIDE_GEOFENCE: distance=% radius=%',round(v_distance),round(v_radius);
    end if;
  end if;

  if v_event_type='placement_verified' and not exists(
    select 1
    from public.qr_location_placement_events e
    where e.qr_code_id=v_qr_id
      and e.event_type='placed'
      and e.actor_user_id is distinct from v_user
      and e.created_at>=now()-interval '180 days'
  ) then
    raise exception 'INDEPENDENT_PLACEMENT_REQUIRED';
  end if;

  select e.id
  into v_existing
  from public.qr_location_placement_events e
  where e.qr_code_id=v_qr_id
    and e.actor_user_id=v_user
    and e.event_type=v_event_type
    and e.created_at>=now()-interval '12 hours'
  order by e.created_at desc
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'event_id',v_existing,
      'duplicate',true,
      'event_type',v_event_type,
      'placement_status',v_placement_status,
      'xp_awarded',0
    );
  end if;

  insert into public.qr_location_placement_events(
    qr_code_id,location_id,actor_user_id,event_type,latitude,longitude,distance_meters,
    metadata,review_status
  )
  values(
    v_qr_id,v_location_id,v_user,v_event_type,p_lat,p_lng,v_distance,
    coalesce(p_metadata,'{}'::jsonb)
      || jsonb_build_object('source','consumer_mobile','server_authoritative',true),
    case when v_event_type in ('damaged','missing','unauthorized') then 'open' else 'resolved' end
  )
  returning id into v_event_id;

  update public.qr_codes
  set placement_status=case
    when v_event_type='placement_verified' then 'placement_verified'
    when v_event_type='placed' and placement_status<>'placement_verified' then 'placed_unverified'
    when v_event_type in ('damaged','missing','unauthorized') then 'disputed'
    when v_event_type='removed' then 'digital_only'
    else placement_status
  end
  where id=v_qr_id
  returning placement_status into v_placement_status;

  if v_event_type in ('placed','placement_verified') then
    begin
      v_progression:=public.record_progression_event_v2(
        case when v_event_type='placed' then 'qr_place' else 'qr_verify' end,
        jsonb_build_object(
          'location_id',v_location_id,
          'source_id',v_event_id,
          'qr_code_id',v_qr_id,
          'event_type',v_event_type,
          'evidence_tier',case when v_event_type='placed' then 2 else 3 end
        ),
        'qr-placement:'||v_event_id::text
      );
    exception when others then
      v_progression:=jsonb_build_object('xp_awarded',0,'withheld',true,'reason','progression_unavailable');
    end;
  end if;

  return jsonb_build_object(
    'event_id',v_event_id,
    'duplicate',false,
    'event_type',v_event_type,
    'placement_status',v_placement_status,
    'distance_meters',v_distance,
    'progression',v_progression,
    'xp_awarded',coalesce((v_progression->>'xp_awarded')::integer,0)
  );
end;
$$;

revoke all on function public.record_location_qr_placement_event(text,text,double precision,double precision,jsonb)
  from public,anon;
grant execute on function public.record_location_qr_placement_event(text,text,double precision,double precision,jsonb)
  to authenticated,service_role;

create or replace function public.sync_canonical_location_qr_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_business uuid;
begin
  v_business:=coalesce(new.claimed_business_id,new.business_id);
  update public.qr_codes
  set business_id=v_business,
      identity_scope=case when v_business is null then 'community' else 'business' end,
      action_payload=coalesce(action_payload,'{}'::jsonb)
        || jsonb_build_object('location_id',new.id,'route','location','canonical_location_identity',true)
  where location_id=new.id
    and canonical_location_identity;
  return new;
end;
$$;

revoke all on function public.sync_canonical_location_qr_identity() from public,anon,authenticated;
grant execute on function public.sync_canonical_location_qr_identity() to service_role;

drop trigger if exists trg_sync_canonical_location_qr_identity on public.locations;
create trigger trg_sync_canonical_location_qr_identity
after update of business_id,claimed_business_id on public.locations
for each row
when (
  old.business_id is distinct from new.business_id
  or old.claimed_business_id is distinct from new.claimed_business_id
)
execute function public.sync_canonical_location_qr_identity();

create or replace function public.resolve_custom_qr_action(p_qr_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_qr public.qr_codes%rowtype;
  v_location public.locations%rowtype;
  v_business uuid;
  v_network jsonb:='{}'::jsonb;
  v_network_verified boolean:=false;
  v_business_claimed boolean:=false;
  v_trust_state text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if nullif(trim(coalesce(p_qr_code,'')),'') is null then raise exception 'QR code is required'; end if;

  select *
  into v_qr
  from public.qr_codes
  where code=trim(p_qr_code) and active=true
  limit 1;

  if not found then raise exception 'Invalid or inactive Kleenest QR'; end if;

  if v_qr.location_id is not null then
    select *
    into v_location
    from public.locations
    where id=v_qr.location_id and coalesce(is_active,true)
    limit 1;

    if found then
      v_business:=coalesce(
        v_qr.business_id,
        v_location.claimed_business_id,
        v_location.business_id,
        (
          select lc.business_id
          from public.location_claims lc
          where lc.location_id=v_qr.location_id
            and lower(coalesce(lc.status,'')) in ('approved','verified','active','claimed')
          order by lc.updated_at desc nulls last,lc.created_at desc nulls last
          limit 1
        )
      );

      begin
        select t.value
        into v_network
        from public.mobile_location_network_statuses(array[v_qr.location_id]::uuid[]) as t(value)
        limit 1;
      exception when others then
        v_network:='{}'::jsonb;
      end;
    end if;
  else
    v_business:=v_qr.business_id;
  end if;

  v_network_verified:=coalesce((v_network->>'network_verified')::boolean,false);
  v_business_claimed:=coalesce((v_network->>'business_claimed')::boolean,false) or v_business is not null;

  v_trust_state:=case
    when v_business_claimed then 'business_claimed'
    when v_network_verified then 'kleenest_verified'
    when coalesce(v_qr.placement_status,'digital_only')='placement_verified' then 'placement_verified'
    else 'community'
  end;

  return jsonb_build_object(
    'id',v_qr.id,
    'code',v_qr.code,
    'location_id',v_qr.location_id,
    'location_name',v_location.name,
    'location_address',v_location.address,
    'business_id',v_business,
    'label',v_qr.label,
    'purpose',v_qr.purpose,
    'action_type',lower(coalesce(v_qr.action_type,'checkin')),
    'action_payload',coalesce(v_qr.action_payload,'{}'::jsonb),
    'single_use',coalesce(v_qr.single_use,false),
    'canonical_location_identity',coalesce(v_qr.canonical_location_identity,false),
    'qr_scope',case
      when coalesce(v_qr.canonical_location_identity,false) and v_business is null then 'community'
      when coalesce(v_qr.canonical_location_identity,false) then 'business'
      else coalesce(v_qr.identity_scope,'business')
    end,
    'placement_status',coalesce(v_qr.placement_status,'digital_only'),
    'trust_state',v_trust_state,
    'business_claimed',v_business_claimed,
    'network_verified',v_network_verified,
    'claimable',coalesce(v_qr.canonical_location_identity,false) and not v_business_claimed,
    'network',v_network,
    'deep_link','kleenest://qr?code='||v_qr.code
  );
end;
$$;

revoke all on function public.resolve_custom_qr_action(text) from public,anon;
grant execute on function public.resolve_custom_qr_action(text) to authenticated,service_role;

create or replace function public.record_qr_attribution(
  p_code text,
  p_action_type text default 'scan',
  p_source text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_qr public.qr_codes;
  v_id uuid;
  v_business uuid;
  v_location uuid;
  v_campaign uuid;
  v_promotion uuid;
  v_program uuid;
  v_meta jsonb:=coalesce(p_metadata,'{}'::jsonb);
  v_authority text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_code),'') is null or length(trim(p_code))>256 then
    raise exception 'QR code is required';
  end if;

  select * into v_qr
  from public.qr_codes
  where code=trim(p_code) and coalesce(active,true)
  limit 1;
  if not found then raise exception 'QR code not found or inactive'; end if;

  v_location:=v_qr.location_id;
  v_business:=v_qr.business_id;
  v_authority:=case
    when coalesce(v_qr.canonical_location_identity,false) then 'qr_location_identity'
    else 'qr_business'
  end;

  if v_location is not null then
    select coalesce(
      v_business,
      l.claimed_business_id,
      l.business_id,
      (
        select lc.business_id
        from public.location_claims lc
        where lc.location_id=l.id
          and lower(coalesce(lc.status,'')) in ('approved','verified','active','claimed')
        order by lc.updated_at desc nulls last,lc.created_at desc nulls last
        limit 1
      )
    )
    into v_business
    from public.locations l
    where l.id=v_location and coalesce(l.is_active,true);

    if not found then raise exception 'QR location unavailable'; end if;
  end if;

  begin v_campaign:=(v_meta->>'campaign_id')::uuid;
  exception when invalid_text_representation then v_campaign:=null; end;
  begin v_promotion:=(v_meta->>'promotion_id')::uuid;
  exception when invalid_text_representation then v_promotion:=null; end;
  begin v_program:=(v_meta->>'engagement_program_id')::uuid;
  exception when invalid_text_representation then v_program:=null; end;

  if v_campaign is not null and not exists(
    select 1
    from public.business_campaigns bc
    where bc.id=v_campaign
      and bc.business_id=v_business
      and (bc.location_id is null or bc.location_id=v_location)
    union all
    select 1
    from public.enterprise_partner_campaigns ec
    join public.enterprise_partner_networks en on en.id=ec.network_id
    where ec.id=v_campaign and en.owner_business_id=v_business
  ) then
    v_campaign:=null;
  end if;

  if v_promotion is not null and not exists(
    select 1
    from public.promotions p
    where p.id=v_promotion
      and p.business_id=v_business
      and (p.location_id is null or p.location_id=v_location)
  ) then
    v_promotion:=null;
  end if;

  if v_program is not null and not exists(
    select 1
    from public.qr_engagement_programs qep
    where qep.id=v_program and qep.qr_code_id=v_qr.id
  ) then
    v_program:=null;
  end if;

  insert into public.qr_attribution_events(
    qr_code_id,location_id,business_id,user_id,action_type,source,
    campaign_id,promotion_id,engagement_program_id,metadata
  )
  values(
    v_qr.id,v_location,v_business,auth.uid(),
    left(coalesce(nullif(trim(p_action_type),''),'scan'),80),
    left(nullif(trim(coalesce(p_source,'')),''),120),
    v_campaign,v_promotion,v_program,
    v_meta
      - array['campaign_id','promotion_id','engagement_program_id']::text[]
      || jsonb_build_object(
        'attribution_authority',v_authority,
        'canonical_location_identity',coalesce(v_qr.canonical_location_identity,false),
        'qr_scope',case when v_business is null then 'community' else 'business' end
      )
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_qr_attribution(text,text,text,jsonb) from public,anon;
grant execute on function public.record_qr_attribution(text,text,text,jsonb) to authenticated,service_role;

create or replace function public.verify_checkin(
  p_qr_code text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns public.check_ins
language plpgsql
security definer
set search_path=''
as $$
declare
  v_qr public.qr_codes%rowtype;
  v_result jsonb;
  v_check public.check_ins%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180 then
    raise exception 'LOCATION_REQUIRED';
  end if;

  select *
  into v_qr
  from public.qr_codes
  where code=trim(p_qr_code) and active=true
  limit 1;

  if not found or v_qr.location_id is null then raise exception 'Invalid or inactive QR code'; end if;

  v_result:=public.kleenest_map_check_in(v_qr.location_id,p_lat,p_lng);

  update public.check_ins
  set qr_code_id=v_qr.id,
      verification_method='qr',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'source','qr',
        'qr_code_id',v_qr.id,
        'canonical_location_identity',coalesce(v_qr.canonical_location_identity,false),
        'qr_scope',case when v_qr.business_id is null then 'community' else 'business' end
      )
  where id=(v_result->>'check_in_id')::uuid
    and user_id=auth.uid()
  returning * into v_check;

  if v_check.id is null then raise exception 'QR check-in could not be finalized'; end if;

  perform public.record_qr_attribution(
    v_qr.code,
    'checkin',
    'consumer_mobile',
    jsonb_build_object('check_in_id',v_check.id,'verification_method','qr')
  );

  return v_check;
end;
$$;

revoke all on function public.verify_checkin(text,double precision,double precision) from public,anon;
grant execute on function public.verify_checkin(text,double precision,double precision)
  to authenticated,service_role;

create or replace function public.admin_list_location_qr_placement_events(
  p_status text default 'open',
  p_limit integer default 100
)
returns setof jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_platform_owner_session() then raise exception 'Platform owner access required'; end if;

  return query
  select jsonb_build_object(
    'id',e.id,
    'qr_code_id',e.qr_code_id,
    'qr_code',q.code,
    'location_id',e.location_id,
    'location_name',l.name,
    'location_address',l.address,
    'event_type',e.event_type,
    'actor_user_id',e.actor_user_id,
    'distance_meters',e.distance_meters,
    'metadata',e.metadata,
    'review_status',e.review_status,
    'resolution_note',e.resolution_note,
    'created_at',e.created_at,
    'placement_status',q.placement_status,
    'business_id',q.business_id,
    'identity_scope',q.identity_scope
  )
  from public.qr_location_placement_events e
  join public.qr_codes q on q.id=e.qr_code_id
  join public.locations l on l.id=e.location_id
  where e.event_type in ('damaged','missing','unauthorized')
    and (
      nullif(trim(coalesce(p_status,'')),'') is null
      or e.review_status=lower(trim(p_status))
    )
  order by e.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),250));
end;
$$;

revoke all on function public.admin_list_location_qr_placement_events(text,integer)
  from public,anon,authenticated;
grant execute on function public.admin_list_location_qr_placement_events(text,integer)
  to authenticated,service_role;

create or replace function public.admin_resolve_location_qr_placement_event(
  p_event_id uuid,
  p_resolution text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_event public.qr_location_placement_events;
  v_resolution text:=lower(trim(coalesce(p_resolution,'')));
  v_next_status text;
begin
  if not public.is_platform_owner_session() then raise exception 'Platform owner access required'; end if;
  if v_resolution not in ('confirmed','dismissed','removed') then
    raise exception 'Resolution must be confirmed, dismissed, or removed';
  end if;

  select *
  into v_event
  from public.qr_location_placement_events
  where id=p_event_id
    and event_type in ('damaged','missing','unauthorized')
  for update;

  if not found then raise exception 'QR placement report not found'; end if;

  update public.qr_location_placement_events
  set review_status=case when v_resolution='dismissed' then 'dismissed' else 'resolved' end,
      resolved_by=auth.uid(),
      resolved_at=now(),
      resolution_note=nullif(trim(coalesce(p_note,'')),'')
  where id=p_event_id
  returning * into v_event;

  if v_resolution='removed'
     or (v_resolution='confirmed' and v_event.event_type in ('missing','unauthorized')) then
    v_next_status:='digital_only';
  elsif v_resolution='confirmed' then
    v_next_status:='disputed';
  else
    v_next_status:=case
      when exists(
        select 1 from public.qr_location_placement_events e
        where e.qr_code_id=v_event.qr_code_id
          and e.event_type='placement_verified'
          and e.review_status<>'dismissed'
      ) then 'placement_verified'
      when exists(
        select 1 from public.qr_location_placement_events e
        where e.qr_code_id=v_event.qr_code_id
          and e.event_type='placed'
          and e.review_status<>'dismissed'
      ) then 'placed_unverified'
      else 'digital_only'
    end;
  end if;

  update public.qr_codes
  set placement_status=v_next_status
  where id=v_event.qr_code_id;

  return jsonb_build_object(
    'event_id',v_event.id,
    'review_status',v_event.review_status,
    'resolution',v_resolution,
    'placement_status',v_next_status
  );
end;
$$;

revoke all on function public.admin_resolve_location_qr_placement_event(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.admin_resolve_location_qr_placement_event(uuid,text,text)
  to authenticated,service_role;
