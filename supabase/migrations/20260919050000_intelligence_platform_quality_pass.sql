-- Intelligence platform quality pass.
-- Additive convergence layer: existing reviews/check-ins/evidence/progression/routes remain authoritative.

create table if not exists public.location_intelligence_revision (
  location_id uuid primary key references public.locations(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  changed_dimensions text[] not null default '{}'::text[],
  source_type text,
  source_id uuid,
  changed_at timestamptz not null default now()
);
create index if not exists location_intelligence_revision_changed_idx
  on public.location_intelligence_revision(changed_at desc);
alter table public.location_intelligence_revision enable row level security;
revoke all on table public.location_intelligence_revision from public,anon,authenticated;
grant select,insert,update,delete on table public.location_intelligence_revision to service_role;

create table if not exists public.intelligence_change_outbox (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  revision bigint not null,
  changed_dimensions text[] not null,
  source_type text not null,
  source_id uuid,
  public_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists intelligence_change_outbox_pending_idx
  on public.intelligence_change_outbox(created_at)
  where processed_at is null;
create index if not exists intelligence_change_outbox_location_idx
  on public.intelligence_change_outbox(location_id,revision desc);
alter table public.intelligence_change_outbox enable row level security;
revoke all on table public.intelligence_change_outbox from public,anon,authenticated;
grant select,insert,update,delete on table public.intelligence_change_outbox to service_role;

create or replace function public.record_intelligence_change(
  p_location_id uuid,
  p_dimensions text[],
  p_source_type text,
  p_source_id uuid default null,
  p_snapshot jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_revision bigint;
  v_dimensions text[];
  v_snapshot jsonb;
begin
  if not exists(select 1 from public.locations l where l.id=p_location_id) then
    return 0;
  end if;
  select coalesce(array_agg(distinct lower(trim(x))) filter(where nullif(trim(x),'') is not null),'{}'::text[])
  into v_dimensions
  from unnest(coalesce(p_dimensions,'{}'::text[])) x;
  if cardinality(v_dimensions)=0 then v_dimensions:=array['evidence']::text[]; end if;

  insert into public.location_intelligence_revision(location_id,revision,changed_dimensions,source_type,source_id,changed_at)
  values(p_location_id,1,v_dimensions,nullif(trim(coalesce(p_source_type,'')),''),p_source_id,now())
  on conflict(location_id) do update set
    revision=public.location_intelligence_revision.revision+1,
    changed_dimensions=excluded.changed_dimensions,
    source_type=excluded.source_type,
    source_id=excluded.source_id,
    changed_at=now()
  returning revision into v_revision;

  if p_snapshot is not null then
    v_snapshot:=p_snapshot;
  elsif exists(select 1 from public.locations l where l.id=p_location_id and l.is_active is distinct from false) then
    v_snapshot:=jsonb_build_object(
      'contract_version',1,
      'location_id',p_location_id,
      'revision',v_revision,
      'proof',public.location_proof_card(p_location_id)
    );
  else
    v_snapshot:=jsonb_build_object(
      'contract_version',1,
      'location_id',p_location_id,
      'revision',v_revision,
      'inactive',true
    );
  end if;

  insert into public.intelligence_change_outbox(
    location_id,revision,changed_dimensions,source_type,source_id,public_snapshot
  ) values(
    p_location_id,v_revision,v_dimensions,coalesce(nullif(trim(p_source_type),''),'system'),p_source_id,v_snapshot
  );
  return v_revision;
end;
$function$;
revoke all on function public.record_intelligence_change(uuid,text[],text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_intelligence_change(uuid,text[],text,uuid,jsonb) to service_role;

create or replace function public.flush_intelligence_change_outbox(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  r public.intelligence_change_outbox;
  p record;
  v_events integer:=0;
  v_rows integer:=0;
begin
  for r in
    select *
    from public.intelligence_change_outbox
    where processed_at is null
    order by created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,100),500))
  loop
    v_rows:=v_rows+1;
    for p in
      select pp.id
      from public.platform_partners pp
      where pp.status='active'
        and public.platform_partner_product_enabled(pp.id,'place_details')
        and exists(
          select 1 from public.platform_webhook_endpoints ep
          where ep.partner_id=pp.id and ep.active
            and ('*'=any(ep.event_types) or 'intelligence.changed'=any(ep.event_types))
        )
    loop
      begin
        perform public.enqueue_platform_webhook_event(
          p.id,
          'intelligence.changed',
          jsonb_build_object(
            'contractVersion',1,
            'locationId',r.location_id,
            'revision',r.revision,
            'changedDimensions',to_jsonb(r.changed_dimensions),
            'sourceType',r.source_type,
            'sourceId',r.source_id,
            'snapshot',r.public_snapshot,
            'changedAt',r.created_at
          )
        );
        v_events:=v_events+1;
      exception when others then
        -- Keep the row pending for the next bounded flush instead of blocking source evidence writes.
        null;
      end;
    end loop;
    update public.intelligence_change_outbox
    set processed_at=now()
    where id=r.id;
  end loop;
  return jsonb_build_object('processed',v_rows,'webhook_events',v_events,'processed_at',now());
end;
$function$;
revoke all on function public.flush_intelligence_change_outbox(integer) from public,anon,authenticated;
grant execute on function public.flush_intelligence_change_outbox(integer) to service_role;

create or replace function public._intelligence_evidence_change_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_dimensions text[];
begin
  v_dimensions:=case
    when new.evidence_kind='device_signal' then array['freshness','availability','device_evidence']::text[]
    when new.evidence_kind ilike '%amenit%' then array['amenities','fit','evidence']::text[]
    when new.evidence_kind ilike '%access%' then array['access','availability','evidence']::text[]
    when new.evidence_kind ilike '%service%' then array['freshness','service','availability']::text[]
    else array['freshness','confidence','evidence']::text[]
  end;
  perform public.record_intelligence_change(new.location_id,v_dimensions,new.source_type,new.source_id,null);
  return new;
end;
$function$;

drop trigger if exists trg_kleenest_evidence_intelligence_change on public.kleenest_evidence_events;
create trigger trg_kleenest_evidence_intelligence_change
after insert on public.kleenest_evidence_events
for each row execute function public._intelligence_evidence_change_trigger();

create or replace function public._intelligence_amenity_change_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_location uuid;
begin
  v_location:=case when tg_op='DELETE' then old.location_id else new.location_id end;
  perform public.record_intelligence_change(v_location,array['amenities','fit']::text[],'location_amenities',null,null);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists trg_location_amenities_intelligence_change on public.location_amenities;
create trigger trg_location_amenities_intelligence_change
after insert or update or delete on public.location_amenities
for each row execute function public._intelligence_amenity_change_trigger();

-- Smart-device telemetry becomes provenance-labelled evidence. It does not alter the
-- independent human confirmation count used by location_kleenest_now.
create or replace function public._converge_smart_device_to_intelligence_evidence()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_location uuid;
  v_partner uuid;
  v_confidence numeric:=.55;
begin
  select d.location_id,c.platform_partner_id
  into v_location,v_partner
  from public.smart_devices d
  join public.smart_device_connectors c on c.id=d.connector_id
  where d.id=new.device_id;

  if v_location is null then return new; end if;
  v_confidence:=case
    when new.severity='critical' then .80
    when new.severity='warning' then .72
    when new.severity='notice' then .65
    else .55 end;

  insert into public.kleenest_evidence_events(
    location_id,business_id,actor_user_id,source_type,source_id,evidence_kind,
    provenance,observed_at,confidence,payload
  ) values(
    v_location,new.business_id,null,'smart_device_events',new.id,'device_signal',
    'partner',new.observed_at,v_confidence,
    jsonb_build_object(
      'device_id',new.device_id,
      'connector_id',new.connector_id,
      'partner_id',v_partner,
      'event_type',new.event_type,
      'severity',new.severity,
      'metric',new.metric,
      'value_numeric',new.value_numeric,
      'value_text',new.value_text,
      'unit',new.unit,
      'signal_payload',new.payload,
      'independent_human_confirmation',false
    )
  ) on conflict do nothing;
  return new;
end;
$function$;

drop trigger if exists trg_smart_device_intelligence_evidence on public.smart_device_events;
create trigger trg_smart_device_intelligence_evidence
after insert on public.smart_device_events
for each row execute function public._converge_smart_device_to_intelligence_evidence();

create or replace function public.location_intelligence_bundle(
  p_location_id uuid,
  p_sections text[] default array['now','passport','access','fit','proof','explanation']::text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_sections text[]:=coalesce(p_sections,array['now','passport','access','fit','proof','explanation']::text[]);
  v_revision bigint:=0;
begin
  if not exists(select 1 from public.locations l where l.id=p_location_id and l.is_active is distinct from false) then
    raise exception 'Location not found';
  end if;
  select coalesce(r.revision,0) into v_revision
  from public.location_intelligence_revision r where r.location_id=p_location_id;
  return jsonb_build_object(
    'contract_version',1,
    'location_id',p_location_id,
    'revision',coalesce(v_revision,0),
    'now',case when 'now'=any(v_sections) then public.location_kleenest_now(p_location_id) else null end,
    'passport',case when 'passport'=any(v_sections) then public.location_facility_passport(p_location_id) else null end,
    'access',case when 'access'=any(v_sections) then public.kleenest_verified_access(p_location_id) else null end,
    'fit',case when 'fit'=any(v_sections) then public.location_bathroom_fit(p_location_id) else null end,
    'proof',case when 'proof'=any(v_sections) then public.location_proof_card(p_location_id) else null end,
    'explanation',case when 'explanation'=any(v_sections) then public.location_intelligence_explanation(p_location_id) else null end,
    'generated_at',now()
  );
end;
$function$;
revoke all on function public.location_intelligence_bundle(uuid,text[]) from public;
grant execute on function public.location_intelligence_bundle(uuid,text[]) to anon,authenticated;

create or replace function public.location_intelligence_batch(
  p_location_ids uuid[],
  p_sections text[] default array['now','proof']::text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_id uuid;
  v_rows jsonb:='[]'::jsonb;
begin
  if cardinality(coalesce(p_location_ids,'{}'::uuid[]))>100 then
    raise exception 'At most 100 locations can be requested per batch';
  end if;
  foreach v_id in array coalesce(p_location_ids,'{}'::uuid[])
  loop
    if exists(select 1 from public.locations l where l.id=v_id and l.is_active is distinct from false) then
      v_rows:=v_rows||jsonb_build_array(public.location_intelligence_bundle(v_id,p_sections));
    end if;
  end loop;
  return v_rows;
end;
$function$;
revoke all on function public.location_intelligence_batch(uuid[],text[]) from public;
grant execute on function public.location_intelligence_batch(uuid[],text[]) to anon,authenticated;

create or replace function public.business_intelligence_bundle(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_locations jsonb;
  v_revision bigint:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id)
     and not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role::text='analyst')
  then raise exception 'Business access required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'name',l.name,'address',l.address,'city',l.city,'state',l.state,
    'claimed_business_id',l.claimed_business_id,'business_id',l.business_id
  ) order by l.name),'[]'::jsonb),
  coalesce(max(r.revision),0)
  into v_locations,v_revision
  from public.locations l
  left join public.location_intelligence_revision r on r.location_id=l.id
  where coalesce(l.claimed_business_id,l.business_id)=p_business_id
    or exists(select 1 from public.location_claims c where c.location_id=l.id and c.business_id=p_business_id and c.status='approved');

  return jsonb_build_object(
    'contract_version',1,
    'business_id',p_business_id,
    'revision',v_revision,
    'locations',v_locations,
    'recovery',public.business_trust_recovery(p_business_id,40),
    'fix_first',public.business_fix_first_queue(p_business_id,20),
    'benchmarks',public.business_local_freshness_benchmark(p_business_id),
    'generated_at',now()
  );
end;
$function$;
revoke all on function public.business_intelligence_bundle(uuid) from public;
grant execute on function public.business_intelligence_bundle(uuid) to authenticated;

create or replace function public.owner_intelligence_health()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_backlog bigint:=0;
  v_oldest numeric:=0;
begin
  if not public.is_platform_owner_session() then raise exception 'Platform owner access required'; end if;
  select count(*),
    coalesce(extract(epoch from (now()-min(created_at))),0)
  into v_backlog,v_oldest
  from public.intelligence_change_outbox
  where processed_at is null;

  return jsonb_build_object(
    'contract_version',1,
    'revision_rows',(select count(*) from public.location_intelligence_revision),
    'latest_revision',coalesce((select max(revision) from public.location_intelligence_revision),0),
    'latest_change_at',(select max(changed_at) from public.location_intelligence_revision),
    'outbox_backlog',v_backlog,
    'oldest_outbox_age_seconds',round(coalesce(v_oldest,0)::numeric,1),
    'changes_24h',(select count(*) from public.intelligence_change_outbox where created_at>=now()-interval '24 hours'),
    'device_evidence_24h',(select count(*) from public.kleenest_evidence_events where evidence_kind='device_signal' and observed_at>=now()-interval '24 hours'),
    'generated_at',now()
  );
end;
$function$;
revoke all on function public.owner_intelligence_health() from public;
grant execute on function public.owner_intelligence_health() to authenticated;

create or replace function public.owner_intelligence_bundle()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not public.is_platform_owner_session() then raise exception 'Platform owner access required'; end if;
  return jsonb_build_object(
    'contract_version',1,
    'overview',public.owner_intelligence_overview(),
    'policy',public.owner_get_intelligence_policy(),
    'product_truth',public.owner_product_truth(),
    'health',public.owner_intelligence_health(),
    'locations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',l.id,'name',l.name,'city',l.city,'state',l.state,'updated_at',l.updated_at,
        'revision',coalesce(r.revision,0)
      ) order by l.updated_at desc nulls last)
      from (
        select * from public.locations order by updated_at desc nulls last limit 30
      ) l left join public.location_intelligence_revision r on r.location_id=l.id
    ),'[]'::jsonb),
    'generated_at',now()
  );
end;
$function$;
revoke all on function public.owner_intelligence_bundle() from public;
grant execute on function public.owner_intelligence_bundle() to authenticated;

-- Public-safe platform projection helpers used by REST/SDK/MCP.
create or replace function public.platform_place_intelligence(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'contractVersion',1,
    'locationId',p_location_id,
    'revision',coalesce((select revision from public.location_intelligence_revision where location_id=p_location_id),0),
    'now',public.location_kleenest_now(p_location_id),
    'explanation',public.location_intelligence_explanation(p_location_id),
    'generatedAt',now()
  );
$function$;
revoke all on function public.platform_place_intelligence(uuid) from public,anon,authenticated;
grant execute on function public.platform_place_intelligence(uuid) to service_role;

create or replace function public.platform_place_proof(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'contractVersion',1,
    'locationId',p_location_id,
    'revision',coalesce((select revision from public.location_intelligence_revision where location_id=p_location_id),0),
    'proof',public.location_proof_card(p_location_id),
    'generatedAt',now()
  );
$function$;
revoke all on function public.platform_place_proof(uuid) from public,anon,authenticated;
grant execute on function public.platform_place_proof(uuid) to service_role;

create or replace function public.platform_verified_access(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'contractVersion',1,
    'locationId',p_location_id,
    'revision',coalesce((select revision from public.location_intelligence_revision where location_id=p_location_id),0),
    'access',public.kleenest_verified_access(p_location_id),
    'generatedAt',now()
  );
$function$;
revoke all on function public.platform_verified_access(uuid) from public,anon,authenticated;
grant execute on function public.platform_verified_access(uuid) to service_role;

-- Keep the intelligence outbox decoupled from source writes. Best-effort scheduling uses the
-- same pg_cron authority already used by platform webhook/device workers.
do $schedule$
begin
  begin
    if exists(select 1 from cron.job where jobname='kleenest-intelligence-outbox') then
      perform cron.unschedule('kleenest-intelligence-outbox');
    end if;
    perform cron.schedule(
      'kleenest-intelligence-outbox',
      '* * * * *',
      'select public.flush_intelligence_change_outbox(200);'
    );
  exception when others then
    null;
  end;
end;
$schedule$;
