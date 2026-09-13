-- Business Claim & Verification Center
-- Subscription/payment grants a workspace only. Existing-location authority is earned through
-- evidence, current-operator consent, or Kleenest platform-owner review.

alter table public.location_claims
  add column if not exists requested_authority text not null default 'location_operator',
  add column if not exists verification_state text not null default 'unverified',
  add column if not exists assurance_level text not null default 'workspace_customer',
  add column if not exists risk_score integer not null default 60,
  add column if not exists risk_reasons jsonb not null default '[]'::jsonb,
  add column if not exists existing_operator_business_id uuid references public.businesses(id) on delete set null,
  add column if not exists verified_evidence jsonb not null default '[]'::jsonb,
  add column if not exists verification_method text,
  add column if not exists verified_at timestamptz,
  add column if not exists last_evidence_at timestamptz,
  add column if not exists resolved_by uuid,
  add column if not exists resolution_note text,
  add column if not exists disputed_at timestamptz;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='location_claims_risk_score_check') then
    alter table public.location_claims add constraint location_claims_risk_score_check check(risk_score between 0 and 100);
  end if;
  if not exists(select 1 from pg_constraint where conname='location_claims_requested_authority_check') then
    alter table public.location_claims add constraint location_claims_requested_authority_check
      check(requested_authority in ('location_operator','location_transfer'));
  end if;
  if not exists(select 1 from pg_constraint where conname='location_claims_verification_state_check') then
    alter table public.location_claims add constraint location_claims_verification_state_check
      check(verification_state in (
        'unverified','evidence_pending','evidence_verified','review_required',
        'automated_approved','operator_approved','operator_rejected','platform_approved','platform_rejected'
      ));
  end if;
  if not exists(select 1 from pg_constraint where conname='location_claims_assurance_level_check') then
    alter table public.location_claims add constraint location_claims_assurance_level_check
      check(assurance_level in ('workspace_customer','business_identity_verified','location_operator_verified'));
  end if;
end$$;

create index if not exists idx_location_claims_existing_operator
  on public.location_claims(existing_operator_business_id,status,updated_at desc)
  where existing_operator_business_id is not null;

create table if not exists public.business_claim_verification_challenges(
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.location_claims(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_by uuid not null,
  method text not null check(method in ('dns_txt')),
  status text not null default 'pending' check(status in ('pending','verified','failed','expired','cancelled')),
  token_hash text not null,
  expected_domain text not null,
  destination_hint text,
  attempts integer not null default 0 check(attempts>=0),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.business_claim_verification_challenges enable row level security;
revoke all on public.business_claim_verification_challenges from public,anon,authenticated;
grant all on public.business_claim_verification_challenges to service_role;
create index if not exists idx_business_claim_verification_challenges_claim
  on public.business_claim_verification_challenges(claim_id,status,created_at desc);

create table if not exists public.business_claim_verification_events(
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.location_claims(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  actor_user_id uuid,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.business_claim_verification_events enable row level security;
revoke all on public.business_claim_verification_events from public,anon,authenticated;
grant all on public.business_claim_verification_events to service_role;
create index if not exists idx_business_claim_verification_events_claim
  on public.business_claim_verification_events(claim_id,created_at desc);

create or replace function public.claim_location_for_business(p_location_id uuid,p_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  cid uuid;
  v_location public.locations;
  v_existing_operator uuid;
  v_business_verified boolean:=false;
  v_risk integer:=60;
  v_reasons jsonb:='[]'::jsonb;
  v_previous public.location_claims;
  v_is_new boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;

  select * into v_location from public.locations where id=p_location_id and coalesce(is_active,true) for update;
  if not found then raise exception 'Location not found'; end if;

  v_existing_operator:=coalesce(v_location.business_id,v_location.claimed_business_id);
  if v_existing_operator=p_business_id then return p_location_id; end if;

  select coalesce(b.verification_status::text='verified',false)
  into v_business_verified
  from public.businesses b where b.id=p_business_id;

  if v_existing_operator is not null and v_existing_operator<>p_business_id then
    v_risk:=95;
    v_reasons:=jsonb_build_array('existing_operator_present','authority_transfer_requested');
  elsif v_business_verified then
    v_risk:=45;
    v_reasons:=jsonb_build_array('unclaimed_location','verified_business');
  else
    v_risk:=60;
    v_reasons:=jsonb_build_array('unclaimed_location','business_identity_not_yet_verified');
  end if;

  select * into v_previous from public.location_claims
  where location_id=p_location_id and business_id=p_business_id;

  if not found then
    insert into public.location_claims(
      location_id,business_id,claimed_by,status,requested_authority,verification_state,
      assurance_level,risk_score,risk_reasons,existing_operator_business_id,verified_evidence
    )
    values(
      p_location_id,p_business_id,auth.uid(),'pending',
      case when v_existing_operator is null then 'location_operator' else 'location_transfer' end,
      case when v_existing_operator is null then 'unverified' else 'review_required' end,
      'workspace_customer',v_risk,v_reasons,
      case when v_existing_operator<>p_business_id then v_existing_operator else null end,
      '[]'::jsonb
    )
    returning id into cid;
    v_is_new:=true;
  else
    update public.location_claims
    set claimed_by=auth.uid(),
        status=case
          when status='approved' then 'approved'
          when verification_state='operator_rejected' then 'disputed'
          else 'pending'
        end,
        requested_authority=case when v_existing_operator is null then 'location_operator' else 'location_transfer' end,
        verification_state=case
          when status='approved' then verification_state
          when verification_state='operator_rejected' then 'review_required'
          when v_existing_operator is null then 'unverified'
          else 'review_required'
        end,
        risk_score=case when verification_state='operator_rejected' then 100 else v_risk end,
        risk_reasons=case
          when verification_state='operator_rejected'
            then v_reasons||jsonb_build_array('previous_operator_rejection')
          else v_reasons
        end,
        existing_operator_business_id=case when v_existing_operator<>p_business_id then v_existing_operator else null end,
        disputed_at=case when verification_state='operator_rejected' then now() else disputed_at end,
        updated_at=now()
    where id=v_previous.id
    returning id into cid;
  end if;

  insert into public.business_claim_verification_events(claim_id,business_id,location_id,actor_user_id,event_type,metadata)
  values(
    cid,p_business_id,p_location_id,auth.uid(),
    case when v_is_new then 'claim_submitted' else 'claim_resubmitted' end,
    jsonb_build_object(
      'risk_score',case when v_previous.verification_state='operator_rejected' then 100 else v_risk end,
      'existing_operator_business_id',v_existing_operator
    )
  );

  if v_is_new and v_existing_operator is not null and v_existing_operator<>p_business_id then
    insert into public.notifications(user_id,type,title,body,data)
    select distinct bm.user_id,'business_claim',
      'Location authority request',
      'Another Kleenest Business requested authority over a location currently managed by your organization.',
      jsonb_build_object(
        'claim_id',cid,'location_id',p_location_id,'requesting_business_id',p_business_id,
        'action','review_business_claim'
      )
    from public.business_members bm
    where bm.business_id=v_existing_operator
      and lower(bm.role::text) in ('owner','admin','manager');
  end if;

  return cid;
end;
$$;

revoke all on function public.claim_location_for_business(uuid,uuid) from public,anon;
grant execute on function public.claim_location_for_business(uuid,uuid) to authenticated,service_role;

create or replace function public.business_search_claimable_locations_v2(
  p_business_id uuid,p_query text default null,p_limit integer default 50
)
returns table(
  id uuid,name text,address text,city text,state text,postal_code text,
  latitude double precision,longitude double precision,place_type text,phone text,website text,
  rating numeric,review_count integer,claim_status text,ownership_scope text,current_operator_present boolean,
  claim_risk_score integer,claim_verification_state text
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  return query
  select l.id,l.name,l.address,l.city,l.state,l.postal_code,l.latitude,l.longitude,l.place_type,l.phone,l.website,l.rating,l.review_count,
         coalesce(c.status,case when coalesce(l.business_id,l.claimed_business_id) is null then 'unclaimed' else 'managed_elsewhere' end)::text,
         case
           when coalesce(l.business_id,l.claimed_business_id)=p_business_id then 'managed_here'
           when coalesce(l.business_id,l.claimed_business_id) is null then 'unclaimed'
           else 'managed_elsewhere'
         end::text,
         (coalesce(l.business_id,l.claimed_business_id) is not null and coalesce(l.business_id,l.claimed_business_id)<>p_business_id),
         c.risk_score,c.verification_state
  from public.locations l
  left join lateral(
    select x.status,x.risk_score,x.verification_state
    from public.location_claims x
    where x.location_id=l.id and x.business_id=p_business_id
    order by x.updated_at desc limit 1
  ) c on true
  where coalesce(l.is_active,true)
    and (
      nullif(trim(coalesce(p_query,'')),'') is null
      or coalesce(l.name,'') ilike '%'||trim(p_query)||'%'
      or coalesce(l.address,'') ilike '%'||trim(p_query)||'%'
      or coalesce(l.city,'') ilike '%'||trim(p_query)||'%'
      or coalesce(l.state,'') ilike '%'||trim(p_query)||'%'
    )
  order by
    case when coalesce(l.business_id,l.claimed_business_id)=p_business_id then 0
         when coalesce(l.business_id,l.claimed_business_id) is null then 1 else 2 end,
    case when nullif(trim(coalesce(p_query,'')),'') is not null and lower(coalesce(l.name,''))=lower(trim(p_query)) then 0 else 1 end,
    coalesce(l.review_count,0) desc,coalesce(l.rating,0) desc,l.name
  limit greatest(1,least(coalesce(p_limit,50),100));
end;
$$;
revoke all on function public.business_search_claimable_locations_v2(uuid,text,integer) from public,anon;
grant execute on function public.business_search_claimable_locations_v2(uuid,text,integer) to authenticated,service_role;

create or replace function public.business_list_location_claims_v2(p_business_id uuid)
returns table(
  claim_id uuid,location_id uuid,location_name text,location_address text,location_city text,location_state text,
  status text,requested_authority text,verification_state text,assurance_level text,risk_score integer,risk_reasons jsonb,
  existing_operator_present boolean,verified_evidence jsonb,verification_method text,verified_at timestamptz,
  resolution_note text,created_at timestamptz,updated_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  return query
  select c.id,c.location_id,l.name,l.address,l.city,l.state,c.status,c.requested_authority,c.verification_state,c.assurance_level,
         c.risk_score,c.risk_reasons,(c.existing_operator_business_id is not null),c.verified_evidence,c.verification_method,
         c.verified_at,c.resolution_note,c.created_at,c.updated_at
  from public.location_claims c
  join public.locations l on l.id=c.location_id
  where c.business_id=p_business_id
  order by c.updated_at desc;
end;
$$;
revoke all on function public.business_list_location_claims_v2(uuid) from public,anon;
grant execute on function public.business_list_location_claims_v2(uuid) to authenticated,service_role;

create or replace function public.business_list_incoming_location_claims(p_business_id uuid)
returns table(
  claim_id uuid,location_id uuid,location_name text,location_address text,
  requesting_business_id uuid,requesting_business_name text,status text,verification_state text,
  assurance_level text,risk_score integer,risk_reasons jsonb,verified_evidence jsonb,created_at timestamptz,updated_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  return query
  select c.id,c.location_id,l.name,l.address,c.business_id,b.name,c.status,c.verification_state,c.assurance_level,
         c.risk_score,c.risk_reasons,c.verified_evidence,c.created_at,c.updated_at
  from public.location_claims c
  join public.locations l on l.id=c.location_id
  join public.businesses b on b.id=c.business_id
  where c.existing_operator_business_id=p_business_id
  order by case when c.status in ('pending','disputed') then 0 else 1 end,c.updated_at desc;
end;
$$;
revoke all on function public.business_list_incoming_location_claims(uuid) from public,anon;
grant execute on function public.business_list_incoming_location_claims(uuid) to authenticated,service_role;

create or replace function public.business_resolve_incoming_location_claim(
  p_business_id uuid,p_claim_id uuid,p_action text,p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  c public.location_claims;
  v_action text:=lower(trim(coalesce(p_action,'')));
begin
  if not public.business_admin_guard(p_business_id) then raise exception 'Business owner or admin access required'; end if;
  if v_action not in ('approve_transfer','reject','escalate') then raise exception 'Unsupported claim resolution action'; end if;

  select * into c from public.location_claims
  where id=p_claim_id and existing_operator_business_id=p_business_id
  for update;
  if not found then raise exception 'Incoming location claim not found'; end if;
  if c.status='approved' then raise exception 'Claim already approved'; end if;

  if v_action='approve_transfer' then
    update public.locations
    set business_id=c.business_id,claimed_business_id=c.business_id,updated_at=now()
    where id=c.location_id;
    update public.location_claims
    set status='approved',verification_state='operator_approved',assurance_level='location_operator_verified',
        risk_score=0,verified_at=now(),resolved_by=auth.uid(),resolution_note=nullif(trim(coalesce(p_note,'')),''),
        updated_at=now()
    where id=c.id returning * into c;
  elsif v_action='reject' then
    update public.location_claims
    set status='rejected',verification_state='operator_rejected',risk_score=100,resolved_by=auth.uid(),
        resolution_note=nullif(trim(coalesce(p_note,'')),'Location authority request rejected by current operator'),
        updated_at=now()
    where id=c.id returning * into c;
  else
    update public.location_claims
    set status='disputed',verification_state='review_required',risk_score=100,disputed_at=now(),resolved_by=auth.uid(),
        resolution_note=nullif(trim(coalesce(p_note,'')),'Current operator escalated this claim to Kleenest review'),
        updated_at=now()
    where id=c.id returning * into c;
  end if;

  insert into public.business_claim_verification_events(claim_id,business_id,location_id,actor_user_id,event_type,metadata)
  values(
    c.id,c.business_id,c.location_id,auth.uid(),'existing_operator_'||v_action,
    jsonb_build_object('existing_operator_business_id',p_business_id,'note',c.resolution_note)
  );

  insert into public.notifications(user_id,type,title,body,data)
  select distinct bm.user_id,'business_claim',
    case when v_action='approve_transfer' then 'Location authority approved'
         when v_action='reject' then 'Location authority request rejected'
         else 'Location authority request escalated' end,
    case when v_action='approve_transfer' then 'The current operator approved transfer of this location to your Business workspace.'
         when v_action='reject' then 'The current operator rejected your request. You may request Kleenest review if you believe this is incorrect.'
         else 'The location authority request is now under Kleenest review.' end,
    jsonb_build_object('claim_id',c.id,'location_id',c.location_id,'action','business_claim_update')
  from public.business_members bm
  where bm.business_id=c.business_id
    and lower(bm.role::text) in ('owner','admin','manager');

  return jsonb_build_object(
    'claim_id',c.id,'status',c.status,'verification_state',c.verification_state,'assurance_level',c.assurance_level
  );
end;
$$;
revoke all on function public.business_resolve_incoming_location_claim(uuid,uuid,text,text) from public,anon;
grant execute on function public.business_resolve_incoming_location_claim(uuid,uuid,text,text) to authenticated,service_role;

create or replace function public.admin_resolve_location_claim_v2(
  p_claim_id uuid,p_status text,p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  c public.location_claims;
  v_status text:=lower(trim(coalesce(p_status,'')));
begin
  if not public.is_platform_owner_session() then raise exception 'Platform owner access required'; end if;
  if v_status not in ('approved','rejected') then raise exception 'Status must be approved or rejected'; end if;

  select * into c from public.location_claims where id=p_claim_id for update;
  if not found then raise exception 'Location claim not found'; end if;

  if v_status='approved' then
    update public.locations
    set business_id=c.business_id,claimed_business_id=c.business_id,updated_at=now()
    where id=c.location_id;
    update public.location_claims
    set status='approved',verification_state='platform_approved',assurance_level='location_operator_verified',
        risk_score=0,verified_at=now(),resolved_by=auth.uid(),resolution_note=nullif(trim(coalesce(p_note,'')),''),
        updated_at=now()
    where id=c.id returning * into c;
  else
    update public.location_claims
    set status='rejected',verification_state='platform_rejected',risk_score=100,resolved_by=auth.uid(),
        resolution_note=nullif(trim(coalesce(p_note,'')),'Rejected by Kleenest verification review'),
        updated_at=now()
    where id=c.id returning * into c;
  end if;

  insert into public.business_claim_verification_events(claim_id,business_id,location_id,actor_user_id,event_type,metadata)
  values(
    c.id,c.business_id,c.location_id,auth.uid(),'platform_'||v_status,
    jsonb_build_object('note',c.resolution_note,'previous_operator_business_id',c.existing_operator_business_id)
  );

  return jsonb_build_object(
    'claim_id',c.id,'status',c.status,'verification_state',c.verification_state,'assurance_level',c.assurance_level
  );
end;
$$;
revoke all on function public.admin_resolve_location_claim_v2(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_resolve_location_claim_v2(uuid,text,text) to authenticated,service_role;

create or replace function public.admin_business_detail(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required'; end if;
  if p_business_id is null then raise exception 'business required'; end if;
  return jsonb_build_object(
    'business',(
      select jsonb_build_object(
        'id',b.id,'name',b.name,'business_tier',b.business_tier::text,'verification_status',b.verification_status::text,
        'email',b.email,'phone',b.phone,'website',b.website,'updated_at',b.updated_at
      ) from public.businesses b where b.id=p_business_id
    ),
    'access',public.admin_get_business_access(p_business_id),
    'members',public.admin_list_business_members(p_business_id),
    'locations',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',l.id,'name',l.name,'address',l.address,'city',l.city,'state',l.state,
          'verification_status',l.verification_status::text
        ) order by l.name
      )
      from public.locations l
      where l.business_id=p_business_id or l.claimed_business_id=p_business_id
    ),'[]'::jsonb),
    'claims',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',c.id,'location_id',c.location_id,'location_name',l.name,'location_address',l.address,
          'location_city',l.city,'location_state',l.state,'claimed_by',c.claimed_by,'status',c.status,
          'requesting_business_id',c.business_id,'existing_operator_business_id',c.existing_operator_business_id,
          'requested_authority',c.requested_authority,'verification_state',c.verification_state,
          'assurance_level',c.assurance_level,'risk_score',c.risk_score,'risk_reasons',c.risk_reasons,
          'verified_evidence',c.verified_evidence,'verification_method',c.verification_method,
          'verified_at',c.verified_at,'resolution_note',c.resolution_note,
          'created_at',c.created_at,'updated_at',c.updated_at
        ) order by c.updated_at desc
      )
      from public.location_claims c
      left join public.locations l on l.id=c.location_id
      where c.business_id=p_business_id or c.existing_operator_business_id=p_business_id
    ),'[]'::jsonb)
  );
end
$$;
