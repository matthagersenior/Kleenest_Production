-- First-class restroom facilities.
-- A Kleenest place can contain multiple independently trusted restroom facilities.
-- Place presence stays location-scoped; observations/reviews can become facility-scoped.

do $$
begin
  create type public.restroom_facility_type as enum (
    'men',
    'women',
    'family',
    'all_gender',
    'single_occupancy',
    'other'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.restroom_facilities (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  facility_type public.restroom_facility_type not null default 'other',
  label text,
  ordinal smallint not null default 1 check (ordinal >= 1),
  floor_label text,
  area_label text,
  -- Attributes describe the facility without changing its identity: accessible, changing table, touchless, shower, etc.
  attributes jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','temporarily_closed','closed')),
  source text not null default 'community',
  business_confirmed boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  evidence_review_count integer not null default 0,
  evidence_cleanliness_pct numeric,
  latest_evidence_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_restroom_facility_identity
  on public.restroom_facilities(
    location_id,
    facility_type,
    coalesce(label,''),
    ordinal
  ) where status <> 'closed';
create index if not exists idx_restroom_facilities_location_active
  on public.restroom_facilities(location_id, status, facility_type);

alter table public.check_ins
  add column if not exists restroom_facility_id uuid references public.restroom_facilities(id) on delete set null;
alter table public.reviews
  add column if not exists restroom_facility_id uuid references public.restroom_facilities(id) on delete set null;
alter table public.review_amenity_feedback
  add column if not exists restroom_facility_id uuid references public.restroom_facilities(id) on delete set null;
alter table public.location_amenity_observations
  add column if not exists restroom_facility_id uuid references public.restroom_facilities(id) on delete set null;

create index if not exists idx_check_ins_restroom_facility
  on public.check_ins(restroom_facility_id, checked_in_at desc)
  where restroom_facility_id is not null;
create index if not exists idx_reviews_restroom_facility
  on public.reviews(restroom_facility_id, created_at desc)
  where restroom_facility_id is not null;
create index if not exists idx_location_amenity_observations_restroom_facility
  on public.location_amenity_observations(restroom_facility_id, observed_at desc)
  where restroom_facility_id is not null;

alter table public.restroom_facilities enable row level security;
revoke all on table public.restroom_facilities from public, anon, authenticated;
grant select on table public.restroom_facilities to anon, authenticated, service_role;
drop policy if exists "Public restroom facility identity is readable" on public.restroom_facilities;
create policy "Public restroom facility identity is readable"
  on public.restroom_facilities for select
  to anon, authenticated
  using (status <> 'closed');

create or replace function public.list_location_restroom_facilities(p_location_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'location_id', f.location_id,
        'facility_type', f.facility_type,
        'label', f.label,
        'ordinal', f.ordinal,
        'floor_label', f.floor_label,
        'area_label', f.area_label,
        'attributes', f.attributes,
        'status', f.status,
        'source', f.source,
        'business_confirmed', f.business_confirmed,
        'verified_at', f.verified_at,
        'review_count', f.evidence_review_count,
        'cleanliness_pct', f.evidence_cleanliness_pct,
        'freshest_observed_at', f.latest_evidence_at
      )
      order by
        case f.facility_type
          when 'women' then 1
          when 'men' then 2
          when 'family' then 3
          when 'all_gender' then 4
          when 'single_occupancy' then 5
          else 6
        end,
        f.ordinal,
        coalesce(f.label,'')
    ),
    '[]'::jsonb
  )
  from public.restroom_facilities f
  where f.location_id=p_location_id
    and f.status <> 'closed';
$function$;

create or replace function public.refresh_restroom_facility_evidence_summary(p_restroom_facility_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_restroom_facility_id is null then return; end if;
  update public.restroom_facilities f
  set evidence_review_count=(
        select count(*)::integer
        from public.reviews r
        where r.restroom_facility_id=f.id and r.status='published'
      ),
      evidence_cleanliness_pct=(
        select round(avg(r.cleanliness_pct))
        from public.reviews r
        where r.restroom_facility_id=f.id
          and r.status='published'
          and r.cleanliness_pct is not null
      ),
      latest_evidence_at=nullif(greatest(
        coalesce((
          select max(r.created_at)
          from public.reviews r
          where r.restroom_facility_id=f.id and r.status='published'
        ),'-infinity'::timestamptz),
        coalesce((
          select max(o.observed_at)
          from public.location_amenity_observations o
          where o.restroom_facility_id=f.id
        ),'-infinity'::timestamptz)
      ),'-infinity'::timestamptz),
      updated_at=now()
  where f.id=p_restroom_facility_id;
end;
$function$;

create or replace function public.sync_restroom_facility_evidence_summary()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_new uuid;
  v_old uuid;
begin
  if tg_op<>'DELETE' then v_new:=new.restroom_facility_id; end if;
  if tg_op<>'INSERT' then v_old:=old.restroom_facility_id; end if;

  if v_new is not null then
    perform public.refresh_restroom_facility_evidence_summary(v_new);
  end if;
  if v_old is not null and v_old is distinct from v_new then
    perform public.refresh_restroom_facility_evidence_summary(v_old);
  end if;
  return coalesce(new,old);
end;
$function$;

drop trigger if exists trg_review_restroom_facility_evidence_summary on public.reviews;
create trigger trg_review_restroom_facility_evidence_summary
after insert or update of restroom_facility_id,status,cleanliness_pct,created_at or delete
on public.reviews
for each row execute function public.sync_restroom_facility_evidence_summary();

drop trigger if exists trg_observation_restroom_facility_evidence_summary on public.location_amenity_observations;
create trigger trg_observation_restroom_facility_evidence_summary
after insert or update of restroom_facility_id,observed_at or delete
on public.location_amenity_observations
for each row execute function public.sync_restroom_facility_evidence_summary();

create or replace function public.identify_restroom_facility(
  p_location_id uuid,
  p_facility_type text,
  p_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_type public.restroom_facility_type;
  v_label text:=nullif(btrim(coalesce(p_label,'')),'');
  v_id uuid;
  v_row public.restroom_facilities%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_location_id is null then raise exception 'LOCATION_REQUIRED'; end if;

  begin
    v_type:=lower(btrim(coalesce(p_facility_type,'')))::public.restroom_facility_type;
  exception when invalid_text_representation then
    raise exception 'INVALID_RESTROOM_FACILITY_TYPE';
  end;

  if not exists(
    select 1 from public.locations l
    where l.id=p_location_id and l.is_active=true
  ) then
    raise exception 'LOCATION_NOT_FOUND';
  end if;

  -- Identity discovery is deliberately not trust/progression evidence.
  -- Reuse an existing unlabeled/same-label facility rather than creating duplicates.
  select f.* into v_row
  from public.restroom_facilities f
  where f.location_id=p_location_id
    and f.facility_type=v_type
    and coalesce(f.label,'')=coalesce(v_label,'')
    and f.status<>'closed'
  order by f.business_confirmed desc, f.ordinal asc, f.created_at asc
  limit 1;

  if v_row.id is not null then
    return jsonb_build_object(
      'id',v_row.id,'location_id',v_row.location_id,'facility_type',v_row.facility_type,
      'label',v_row.label,'ordinal',v_row.ordinal,'status',v_row.status,
      'business_confirmed',v_row.business_confirmed,'created',false
    );
  end if;

  insert into public.restroom_facilities(
    location_id,facility_type,label,ordinal,source,business_confirmed,created_by
  )
  values(
    p_location_id,v_type,v_label,1,'community_identified',false,v_uid
  )
  returning id into v_id;

  return jsonb_build_object(
    'id',v_id,'location_id',p_location_id,'facility_type',v_type,
    'label',v_label,'ordinal',1,'status','active',
    'business_confirmed',false,'created',true,
    'trust_effect','identity_only_no_xp_no_freshness'
  );
exception
  when unique_violation then
    select f.* into v_row
    from public.restroom_facilities f
    where f.location_id=p_location_id
      and f.facility_type=v_type
      and coalesce(f.label,'')=coalesce(v_label,'')
      and f.status<>'closed'
    order by f.ordinal asc
    limit 1;
    if v_row.id is null then raise; end if;
    return jsonb_build_object(
      'id',v_row.id,'location_id',v_row.location_id,'facility_type',v_row.facility_type,
      'label',v_row.label,'ordinal',v_row.ordinal,'status',v_row.status,
      'business_confirmed',v_row.business_confirmed,'created',false
    );
end;
$function$;

create or replace function public.assign_check_in_restroom_facility(
  p_check_in_id uuid,
  p_restroom_facility_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_location uuid;
  v_facility public.restroom_facilities%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_check_in_id is null then raise exception 'CHECK_IN_REQUIRED'; end if;
  if p_restroom_facility_id is null then raise exception 'RESTROOM_FACILITY_REQUIRED'; end if;

  select c.location_id into v_location
  from public.check_ins c
  where c.id=p_check_in_id and c.user_id=v_uid;
  if v_location is null then raise exception 'CHECK_IN_NOT_FOUND'; end if;

  select * into v_facility
  from public.restroom_facilities f
  where f.id=p_restroom_facility_id
    and f.location_id=v_location
    and f.status<>'closed';
  if v_facility.id is null then raise exception 'RESTROOM_FACILITY_NOT_AT_LOCATION'; end if;

  update public.check_ins
  set restroom_facility_id=v_facility.id,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'restroom_facility_id',v_facility.id,
        'restroom_facility_type',v_facility.facility_type,
        'facility_scoped',true
      )
  where id=p_check_in_id and user_id=v_uid;

  update public.reviews
  set restroom_facility_id=v_facility.id
  where check_in_id=p_check_in_id and user_id=v_uid;

  update public.review_amenity_feedback f
  set restroom_facility_id=v_facility.id
  from public.reviews r
  where f.review_id=r.id
    and r.check_in_id=p_check_in_id
    and r.user_id=v_uid;

  update public.location_amenity_observations
  set restroom_facility_id=v_facility.id,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'restroom_facility_id',v_facility.id,
        'facility_scoped',true
      )
  where user_id=v_uid and check_in_id=p_check_in_id;

  if to_regclass('public.qr_redemptions') is not null then
    update public.qr_redemptions
    set restroom_facility_id=v_facility.id
    where check_in_id=p_check_in_id and user_id=v_uid;
  end if;

  return jsonb_build_object(
    'ok',true,
    'check_in_id',p_check_in_id,
    'location_id',v_location,
    'restroom_facility_id',v_facility.id,
    'facility_type',v_facility.facility_type,
    'label',v_facility.label
  );
end;
$function$;

create or replace function public.copy_review_restroom_facility()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_location uuid;
  v_facility uuid;
begin
  if new.check_in_id is null then return new; end if;

  select c.location_id,c.restroom_facility_id
  into v_location,v_facility
  from public.check_ins c
  where c.id=new.check_in_id;

  if v_location is null or v_location is distinct from new.location_id then
    raise exception 'REVIEW_CHECK_IN_LOCATION_MISMATCH';
  end if;

  if new.restroom_facility_id is null then
    new.restroom_facility_id:=v_facility;
  elsif not exists(
    select 1 from public.restroom_facilities f
    where f.id=new.restroom_facility_id
      and f.location_id=new.location_id
      and f.status<>'closed'
  ) then
    raise exception 'RESTROOM_FACILITY_NOT_AT_LOCATION';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_copy_review_restroom_facility on public.reviews;
create trigger trg_copy_review_restroom_facility
before insert or update of check_in_id,location_id,restroom_facility_id
on public.reviews
for each row execute function public.copy_review_restroom_facility();

-- Keep the existing review-amenity API stable while carrying facility identity
-- from the verified review/check-in into every canonical observation.
create or replace function public.record_review_amenity_inventory(p_review_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
 v_uid uuid:=auth.uid(); v_location uuid; v_check_in uuid; v_facility uuid; v_check_method text;
 v_item jsonb; v_amenity uuid; v_sentiment text; v_qty integer; v_status text;
 v_count integer:=0; v_progression jsonb:=null; v_progression_error text:=null;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then raise exception 'AMENITY_INVENTORY_MUST_BE_ARRAY'; end if;

 select r.location_id,r.check_in_id,coalesce(r.restroom_facility_id,c.restroom_facility_id),c.verification_method
 into v_location,v_check_in,v_facility,v_check_method
 from public.reviews r
 join public.check_ins c on c.id=r.check_in_id and c.user_id=v_uid and c.location_id=r.location_id
 where r.id=p_review_id and r.user_id=v_uid and r.status='published';

 if v_location is null or v_check_in is null then raise exception 'VERIFIED_REVIEW_NOT_FOUND'; end if;

 delete from public.review_amenity_feedback where review_id=p_review_id;
 delete from public.location_amenity_observations
 where user_id=v_uid and location_id=v_location and check_in_id=v_check_in
   and metadata->>'review_id'=p_review_id::text
   and metadata->>'source'='review_amenity_inventory';

 for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
  v_amenity:=nullif(v_item->>'amenity_id','')::uuid;
  v_sentiment:=lower(coalesce(nullif(v_item->>'sentiment',''),'good'));
  v_qty:=case when v_item?'quantity' and nullif(v_item->>'quantity','') is not null then (v_item->>'quantity')::integer else null end;
  if v_amenity is null or not exists(select 1 from public.amenities where id=v_amenity) then raise exception 'AMENITY_NOT_FOUND'; end if;
  if v_sentiment not in ('good','needs_attention') then raise exception 'INVALID_AMENITY_SENTIMENT'; end if;
  if v_qty is not null and (v_qty<0 or v_qty>1000) then raise exception 'AMENITY_QUANTITY_OUT_OF_RANGE'; end if;

  insert into public.review_amenity_feedback(
    review_id,location_id,amenity_id,sentiment,observed_quantity,restroom_facility_id
  ) values(
    p_review_id,v_location,v_amenity,v_sentiment,v_qty,v_facility
  );

  v_status:=case when v_qty=0 then 'absent' else 'present' end;
  insert into public.location_amenity_observations(
    location_id,user_id,amenity_id,status,observed_quantity,confidence,
    verification_method,check_in_id,notes,observed_at,metadata,restroom_facility_id
  )
  values(
    v_location,v_uid,v_amenity,v_status,
    case when v_status='absent' then 0 else coalesce(v_qty,1) end,
    0.90,coalesce(nullif(v_check_method,''),'verified_review'),v_check_in,
    case when v_sentiment='needs_attention' then 'Needs attention reported in verified review' else null end,
    now(),
    jsonb_build_object(
      'source','review_amenity_inventory','review_id',p_review_id,
      'sentiment',v_sentiment,'server_authoritative',true,
      'restroom_facility_id',v_facility,'facility_scoped',v_facility is not null
    ),
    v_facility
  )
  on conflict (user_id,location_id,check_in_id,amenity_id,status) where check_in_id is not null
  do update set
    observed_quantity=excluded.observed_quantity,
    confidence=excluded.confidence,
    verification_method=excluded.verification_method,
    notes=excluded.notes,
    observed_at=excluded.observed_at,
    metadata=excluded.metadata,
    restroom_facility_id=excluded.restroom_facility_id;
  v_count:=v_count+1;
 end loop;

 if v_count>0 then
   begin
     v_progression:=public.award_review_amenity_progression(p_review_id);
   exception when others then
     v_progression_error:=sqlerrm;
     v_progression:=null;
   end;
 end if;

 return jsonb_build_object(
   'review_id',p_review_id,'location_id',v_location,'check_in_id',v_check_in,
   'restroom_facility_id',v_facility,
   'recorded',v_count,'canonical_observations',v_count,
   'progression',v_progression,'progression_error',v_progression_error
 );
end $function$;


-- Public batch summaries let discovery/search cards describe multiple restroom
-- facilities without inflating the core nearby-location RPC.
create or replace function public.list_restroom_facility_summaries(p_location_ids uuid[])
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'location_id', s.location_id,
        'facility_count', s.facility_count,
        'facility_types', s.facility_types,
        'business_confirmed_count', s.business_confirmed_count,
        'freshest_observed_at', s.freshest_observed_at
      )
      order by s.location_id
    ),
    '[]'::jsonb
  )
  from (
    select
      f.location_id,
      count(*)::integer as facility_count,
      array_agg(distinct f.facility_type::text order by f.facility_type::text) as facility_types,
      count(*) filter (where f.business_confirmed)::integer as business_confirmed_count,
      max(f.latest_evidence_at) as freshest_observed_at
    from public.restroom_facilities f
    where f.status <> 'closed'
      and f.location_id=any(coalesce(p_location_ids,'{}'::uuid[]))
    group by f.location_id
  ) s;
$function$;

-- QR codes can point at an exact restroom facility. Facility identity propagates
-- through QR check-ins, redemptions, attribution, and intelligence automatically.
alter table public.qr_codes
  add column if not exists restroom_facility_id uuid references public.restroom_facilities(id) on delete set null;
alter table public.qr_redemptions
  add column if not exists restroom_facility_id uuid references public.restroom_facilities(id) on delete set null;
alter table public.qr_attribution_events
  add column if not exists restroom_facility_id uuid references public.restroom_facilities(id) on delete set null;
alter table public.qr_intelligence_events
  add column if not exists restroom_facility_id uuid references public.restroom_facilities(id) on delete set null;

create index if not exists idx_qr_codes_restroom_facility on public.qr_codes(restroom_facility_id) where restroom_facility_id is not null;
create index if not exists idx_qr_redemptions_restroom_facility on public.qr_redemptions(restroom_facility_id,redeemed_at desc) where restroom_facility_id is not null;
create index if not exists idx_qr_attribution_restroom_facility on public.qr_attribution_events(restroom_facility_id,created_at desc) where restroom_facility_id is not null;
create index if not exists idx_qr_intelligence_restroom_facility on public.qr_intelligence_events(restroom_facility_id,occurred_at desc) where restroom_facility_id is not null;

create or replace function public.copy_qr_restroom_facility()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_location uuid;
  v_facility uuid;
begin
  if new.qr_code_id is null then return new; end if;
  select q.location_id,q.restroom_facility_id
  into v_location,v_facility
  from public.qr_codes q
  where q.id=new.qr_code_id;

  if v_facility is null then return new; end if;
  if to_jsonb(new)?'location_id'
     and nullif(to_jsonb(new)->>'location_id','') is not null
     and (to_jsonb(new)->>'location_id')::uuid is distinct from v_location then
    raise exception 'QR_LOCATION_MISMATCH';
  end if;
  new.restroom_facility_id:=coalesce(new.restroom_facility_id,v_facility);
  return new;
end;
$function$;

drop trigger if exists trg_qr_redemption_restroom_facility on public.qr_redemptions;
create trigger trg_qr_redemption_restroom_facility
before insert or update of qr_code_id
on public.qr_redemptions
for each row execute function public.copy_qr_restroom_facility();

drop trigger if exists trg_qr_attribution_restroom_facility on public.qr_attribution_events;
create trigger trg_qr_attribution_restroom_facility
before insert or update of qr_code_id
on public.qr_attribution_events
for each row execute function public.copy_qr_restroom_facility();

drop trigger if exists trg_qr_intelligence_restroom_facility on public.qr_intelligence_events;
create trigger trg_qr_intelligence_restroom_facility
before insert or update of qr_code_id
on public.qr_intelligence_events
for each row execute function public.copy_qr_restroom_facility();

create or replace function public.copy_qr_restroom_facility_to_check_in()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_location uuid;
  v_facility uuid;
begin
  if new.qr_code_id is null then return new; end if;
  select q.location_id,q.restroom_facility_id into v_location,v_facility
  from public.qr_codes q where q.id=new.qr_code_id;
  if v_facility is null then return new; end if;
  if new.location_id is distinct from v_location then raise exception 'QR_LOCATION_MISMATCH'; end if;
  new.restroom_facility_id:=coalesce(new.restroom_facility_id,v_facility);
  return new;
end;
$function$;

drop trigger if exists trg_check_in_qr_restroom_facility on public.check_ins;
create trigger trg_check_in_qr_restroom_facility
before insert or update of qr_code_id,location_id
on public.check_ins
for each row execute function public.copy_qr_restroom_facility_to_check_in();

-- Facility identity follows verified problems into remediation and preventive work.
alter table public.business_restroom_remediation_cases
  add column if not exists restroom_facility_id uuid references public.restroom_facilities(id) on delete set null;
alter table public.business_restroom_preventive_work_orders
  add column if not exists restroom_facility_id uuid references public.restroom_facilities(id) on delete set null;
create index if not exists idx_remediation_restroom_facility
  on public.business_restroom_remediation_cases(restroom_facility_id,status,opened_at desc)
  where restroom_facility_id is not null;
create index if not exists idx_preventive_restroom_facility
  on public.business_restroom_preventive_work_orders(restroom_facility_id,status,created_at desc)
  where restroom_facility_id is not null;

create or replace function public.copy_remediation_restroom_facility()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_location uuid;
  v_facility uuid;
begin
  if new.source_observation_id is null then return new; end if;
  select o.location_id,o.restroom_facility_id into v_location,v_facility
  from public.location_amenity_observations o where o.id=new.source_observation_id;
  if v_facility is null then return new; end if;
  if new.location_id is distinct from v_location then raise exception 'OBSERVATION_LOCATION_MISMATCH'; end if;
  new.restroom_facility_id:=coalesce(new.restroom_facility_id,v_facility);
  return new;
end;
$function$;

drop trigger if exists trg_remediation_restroom_facility on public.business_restroom_remediation_cases;
create trigger trg_remediation_restroom_facility
before insert or update of source_observation_id,location_id
on public.business_restroom_remediation_cases
for each row execute function public.copy_remediation_restroom_facility();

create or replace function public.copy_preventive_restroom_facility()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_facility uuid;
  v_location uuid;
begin
  if new.restroom_facility_id is not null then return new; end if;
  begin
    v_facility:=nullif(new.source_snapshot->>'restroom_facility_id','')::uuid;
  exception when invalid_text_representation then
    v_facility:=null;
  end;
  if v_facility is null then return new; end if;
  select f.location_id into v_location from public.restroom_facilities f where f.id=v_facility;
  if v_location is null or new.location_id is distinct from v_location then return new; end if;
  new.restroom_facility_id:=v_facility;
  return new;
end;
$function$;

drop trigger if exists trg_preventive_restroom_facility on public.business_restroom_preventive_work_orders;
create trigger trg_preventive_restroom_facility
before insert or update of source_snapshot,location_id
on public.business_restroom_preventive_work_orders
for each row execute function public.copy_preventive_restroom_facility();

-- Claimed businesses can explicitly create, correct, close, and reopen the
-- restroom facilities they operate.
create or replace function public.business_list_restroom_facilities(
  p_business_id uuid,
  p_location_id uuid,
  p_include_closed boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'BUSINESS_MANAGEMENT_REQUIRED'; end if;
  if not exists(
    select 1 from public.locations l
    where l.id=p_location_id
      and coalesce(l.business_id,l.claimed_business_id)=p_business_id
  ) then raise exception 'LOCATION_NOT_MANAGED_BY_BUSINESS'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',f.id,
      'location_id',f.location_id,
      'facility_type',f.facility_type,
      'label',f.label,
      'ordinal',f.ordinal,
      'floor_label',f.floor_label,
      'area_label',f.area_label,
      'attributes',f.attributes,
      'status',f.status,
      'source',f.source,
      'business_confirmed',f.business_confirmed,
      'verified_at',f.verified_at,
      'review_count',f.evidence_review_count,
      'cleanliness_pct',f.evidence_cleanliness_pct,
      'freshest_observed_at',f.latest_evidence_at
    )
    order by case f.status when 'active' then 1 when 'temporarily_closed' then 2 else 3 end,
             f.facility_type,f.ordinal,coalesce(f.label,'')
  ),'[]'::jsonb)
  into v_result
  from public.restroom_facilities f
  where f.location_id=p_location_id
    and (coalesce(p_include_closed,true) or f.status<>'closed');

  return v_result;
end;
$function$;

create or replace function public.business_manage_restroom_facility(
  p_business_id uuid,
  p_location_id uuid,
  p_restroom_facility_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_action text:=lower(btrim(coalesce(p_action,'')));
  v_type public.restroom_facility_type;
  v_row public.restroom_facilities%rowtype;
  v_ordinal smallint;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'BUSINESS_MANAGEMENT_REQUIRED'; end if;
  if not exists(
    select 1 from public.locations l
    where l.id=p_location_id
      and coalesce(l.business_id,l.claimed_business_id)=p_business_id
      and l.is_active=true
  ) then raise exception 'LOCATION_NOT_MANAGED_BY_BUSINESS'; end if;

  if v_action='create' then
    begin
      v_type:=lower(btrim(coalesce(p_payload->>'facility_type','other')))::public.restroom_facility_type;
    exception when invalid_text_representation then
      raise exception 'INVALID_RESTROOM_FACILITY_TYPE';
    end;
    v_ordinal:=coalesce(nullif(p_payload->>'ordinal','')::smallint,(
      select coalesce(max(f.ordinal),0)+1
      from public.restroom_facilities f
      where f.location_id=p_location_id and f.facility_type=v_type and f.status<>'closed'
    ));
    insert into public.restroom_facilities(
      location_id,facility_type,label,ordinal,floor_label,area_label,attributes,status,
      source,business_confirmed,created_by,verified_at
    ) values(
      p_location_id,v_type,nullif(btrim(coalesce(p_payload->>'label','')),''),
      greatest(v_ordinal,1),
      nullif(btrim(coalesce(p_payload->>'floor_label','')),''),
      nullif(btrim(coalesce(p_payload->>'area_label','')),''),
      case when jsonb_typeof(p_payload->'attributes')='object' then p_payload->'attributes' else '{}'::jsonb end,
      'active','business_managed',true,v_uid,now()
    ) returning * into v_row;
  else
    select * into v_row
    from public.restroom_facilities f
    where f.id=p_restroom_facility_id and f.location_id=p_location_id
    for update;
    if v_row.id is null then raise exception 'RESTROOM_FACILITY_NOT_FOUND'; end if;

    if v_action='update' then
      if p_payload?'facility_type' then
        begin
          v_type:=lower(btrim(p_payload->>'facility_type'))::public.restroom_facility_type;
        exception when invalid_text_representation then
          raise exception 'INVALID_RESTROOM_FACILITY_TYPE';
        end;
      else
        v_type:=v_row.facility_type;
      end if;
      update public.restroom_facilities
      set facility_type=v_type,
          label=case when p_payload?'label' then nullif(btrim(coalesce(p_payload->>'label','')),'') else label end,
          ordinal=case when p_payload?'ordinal' then greatest((p_payload->>'ordinal')::smallint,1) else ordinal end,
          floor_label=case when p_payload?'floor_label' then nullif(btrim(coalesce(p_payload->>'floor_label','')),'') else floor_label end,
          area_label=case when p_payload?'area_label' then nullif(btrim(coalesce(p_payload->>'area_label','')),'') else area_label end,
          attributes=case when jsonb_typeof(p_payload->'attributes')='object' then attributes||(p_payload->'attributes') else attributes end,
          business_confirmed=true,
          source='business_managed',
          verified_at=now(),
          updated_at=now()
      where id=v_row.id
      returning * into v_row;
    elsif v_action in ('close','archive','deactivate') then
      update public.restroom_facilities set status='closed',business_confirmed=true,updated_at=now() where id=v_row.id returning * into v_row;
    elsif v_action in ('reopen','activate') then
      update public.restroom_facilities set status='active',business_confirmed=true,verified_at=now(),updated_at=now() where id=v_row.id returning * into v_row;
    elsif v_action='temporarily_close' then
      update public.restroom_facilities set status='temporarily_closed',business_confirmed=true,updated_at=now() where id=v_row.id returning * into v_row;
    else
      raise exception 'INVALID_RESTROOM_FACILITY_ACTION';
    end if;
  end if;

  return to_jsonb(v_row);
end;
$function$;

create or replace function public.business_assign_qr_restroom_facility(
  p_business_id uuid,
  p_qr_code_id uuid,
  p_restroom_facility_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_qr public.qr_codes%rowtype;
  v_facility public.restroom_facilities%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'BUSINESS_MANAGEMENT_REQUIRED'; end if;

  select * into v_qr from public.qr_codes q
  where q.id=p_qr_code_id and q.business_id=p_business_id
  for update;
  if v_qr.id is null then raise exception 'QR_CODE_NOT_FOUND'; end if;

  if p_restroom_facility_id is not null then
    select * into v_facility from public.restroom_facilities f
    where f.id=p_restroom_facility_id and f.location_id=v_qr.location_id and f.status<>'closed';
    if v_facility.id is null then raise exception 'RESTROOM_FACILITY_NOT_AT_QR_LOCATION'; end if;
  end if;

  update public.qr_codes
  set restroom_facility_id=p_restroom_facility_id
  where id=v_qr.id
  returning * into v_qr;

  return jsonb_build_object(
    'ok',true,
    'qr_code_id',v_qr.id,
    'location_id',v_qr.location_id,
    'restroom_facility_id',v_qr.restroom_facility_id
  );
end;
$function$;

create or replace function public.business_restroom_facility_analytics(
  p_business_id uuid,
  p_location_id uuid default null,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_start timestamptz:=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)));
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'BUSINESS_MANAGEMENT_REQUIRED'; end if;

  select coalesce(jsonb_agg(row_data order by (row_data->>'location_name'),(row_data->>'facility_type'),(row_data->>'ordinal')::int),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'restroom_facility_id',f.id,
      'location_id',f.location_id,
      'location_name',l.name,
      'facility_type',f.facility_type,
      'label',f.label,
      'ordinal',f.ordinal,
      'attributes',f.attributes,
      'status',f.status,
      'business_confirmed',f.business_confirmed,
      'verified_check_ins',(select count(*) from public.check_ins c where c.restroom_facility_id=f.id and c.checked_in_at>=v_start),
      'reviews',(select count(*) from public.reviews r where r.restroom_facility_id=f.id and r.status='published' and r.created_at>=v_start),
      'cleanliness_pct',(select round(avg(r.cleanliness_pct))::integer from public.reviews r where r.restroom_facility_id=f.id and r.status='published' and r.cleanliness_pct is not null and r.created_at>=v_start),
      'amenity_observations',(select count(*) from public.location_amenity_observations o where o.restroom_facility_id=f.id and o.observed_at>=v_start),
      'open_remediation',(select count(*) from public.business_restroom_remediation_cases c where c.restroom_facility_id=f.id and c.status not in ('resolved','dismissed')),
      'open_preventive_work',(select count(*) from public.business_restroom_preventive_work_orders w where w.restroom_facility_id=f.id and w.status not in ('completed','dismissed')),
      'qr_attributions',(select count(*) from public.qr_attribution_events q where q.restroom_facility_id=f.id and q.created_at>=v_start),
      'freshest_evidence_at',greatest(
        f.verified_at,
        (select max(r.created_at) from public.reviews r where r.restroom_facility_id=f.id and r.status='published'),
        (select max(o.observed_at) from public.location_amenity_observations o where o.restroom_facility_id=f.id)
      )
    ) row_data
    from public.restroom_facilities f
    join public.locations l on l.id=f.location_id
    where coalesce(l.business_id,l.claimed_business_id)=p_business_id
      and (p_location_id is null or f.location_id=p_location_id)
  ) rows;

  return v_result;
end;
$function$;

-- Fleet workspaces can ask for restroom-facility opportunities along a selected
-- set of route/location IDs without receiving business-private operations data.
create or replace function public.fleet_restroom_facility_service_opportunities(
  p_business_id uuid,
  p_location_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.has_fleet_access(p_business_id) then raise exception 'FLEET_ACCESS_REQUIRED'; end if;

  select coalesce(jsonb_agg(row_data order by (row_data->>'location_name'),(row_data->>'facility_type')),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'location_id',l.id,
      'location_name',l.name,
      'latitude',l.latitude,
      'longitude',l.longitude,
      'restroom_facility_id',f.id,
      'facility_type',f.facility_type,
      'label',f.label,
      'area_label',f.area_label,
      'floor_label',f.floor_label,
      'attributes',f.attributes,
      'status',f.status,
      'cleanliness_pct',(select round(avg(r.cleanliness_pct))::integer from public.reviews r where r.restroom_facility_id=f.id and r.status='published' and r.cleanliness_pct is not null),
      'freshest_evidence_at',greatest(
        f.verified_at,
        (select max(r.created_at) from public.reviews r where r.restroom_facility_id=f.id and r.status='published'),
        (select max(o.observed_at) from public.location_amenity_observations o where o.restroom_facility_id=f.id)
      )
    ) row_data
    from public.restroom_facilities f
    join public.locations l on l.id=f.location_id and l.is_active=true
    where f.status<>'closed'
      and (p_location_ids is null or f.location_id=any(p_location_ids))
    limit 500
  ) rows;

  return v_result;
end;
$function$;

revoke all on function public.list_location_restroom_facilities(uuid) from public;
revoke all on function public.list_restroom_facility_summaries(uuid[]) from public;
revoke all on function public.identify_restroom_facility(uuid,text,text) from public,anon;
revoke all on function public.assign_check_in_restroom_facility(uuid,uuid) from public,anon;
revoke all on function public.copy_review_restroom_facility() from public,anon,authenticated;
revoke all on function public.refresh_restroom_facility_evidence_summary(uuid) from public,anon,authenticated;
revoke all on function public.sync_restroom_facility_evidence_summary() from public,anon,authenticated;
revoke all on function public.copy_qr_restroom_facility() from public,anon,authenticated;
revoke all on function public.copy_qr_restroom_facility_to_check_in() from public,anon,authenticated;
revoke all on function public.copy_remediation_restroom_facility() from public,anon,authenticated;
revoke all on function public.copy_preventive_restroom_facility() from public,anon,authenticated;
revoke all on function public.record_review_amenity_inventory(uuid,jsonb) from public,anon;
revoke all on function public.business_list_restroom_facilities(uuid,uuid,boolean) from public,anon;
revoke all on function public.business_manage_restroom_facility(uuid,uuid,uuid,text,jsonb) from public,anon;
revoke all on function public.business_restroom_facility_analytics(uuid,uuid,integer) from public,anon;
revoke all on function public.business_assign_qr_restroom_facility(uuid,uuid,uuid) from public,anon;
revoke all on function public.fleet_restroom_facility_service_opportunities(uuid,uuid[]) from public,anon;
grant execute on function public.list_location_restroom_facilities(uuid) to anon,authenticated,service_role;
grant execute on function public.list_restroom_facility_summaries(uuid[]) to anon,authenticated,service_role;
grant execute on function public.identify_restroom_facility(uuid,text,text) to authenticated,service_role;
grant execute on function public.assign_check_in_restroom_facility(uuid,uuid) to authenticated,service_role;
grant execute on function public.record_review_amenity_inventory(uuid,jsonb) to authenticated,service_role;
grant execute on function public.business_list_restroom_facilities(uuid,uuid,boolean) to authenticated,service_role;
grant execute on function public.business_manage_restroom_facility(uuid,uuid,uuid,text,jsonb) to authenticated,service_role;
grant execute on function public.business_restroom_facility_analytics(uuid,uuid,integer) to authenticated,service_role;
grant execute on function public.business_assign_qr_restroom_facility(uuid,uuid,uuid) to authenticated,service_role;
grant execute on function public.fleet_restroom_facility_service_opportunities(uuid,uuid[]) to authenticated,service_role;
