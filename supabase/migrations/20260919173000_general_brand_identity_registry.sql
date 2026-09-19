-- General brand identity authority for automatic discovery.
-- Lock-light by design: provider brands are preserved by canonical ingestion, while a sidecar
-- registry learns aliases and incrementally backfills recognized commercial identities.

create table if not exists public.brand_identity_aliases (
  alias_key text primary key,
  alias_text text not null,
  canonical_brand text not null,
  source text not null check (source in ('manual','provider','existing','frequency')),
  confidence numeric(4,3) not null default .900 check (confidence >= 0 and confidence <= 1),
  evidence_count bigint not null default 0 check (evidence_count >= 0),
  city_count integer not null default 0 check (city_count >= 0),
  state_count integer not null default 0 check (state_count >= 0),
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_brand_identity_aliases_canonical
  on public.brand_identity_aliases ((lower(canonical_brand))) where active;
alter table public.brand_identity_aliases enable row level security;
revoke all on table public.brand_identity_aliases from public,anon,authenticated;
grant select,insert,update,delete on table public.brand_identity_aliases to service_role;

create table if not exists public.location_brand_identities (
  location_id uuid primary key references public.locations(id) on delete cascade,
  canonical_brand text not null,
  source text not null,
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  alias_key text,
  detected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_location_brand_identities_brand
  on public.location_brand_identities ((lower(canonical_brand)));
alter table public.location_brand_identities enable row level security;
revoke all on table public.location_brand_identities from public,anon,authenticated;
grant select,insert,update,delete on table public.location_brand_identities to service_role;

create table if not exists public.brand_identity_backfill_state (
  singleton boolean primary key default true check (singleton),
  last_location_id uuid,
  updated_at timestamptz not null default now()
);
insert into public.brand_identity_backfill_state(singleton,last_location_id)
values(true,null) on conflict(singleton) do nothing;
alter table public.brand_identity_backfill_state enable row level security;
revoke all on table public.brand_identity_backfill_state from public,anon,authenticated;
grant select,insert,update,delete on table public.brand_identity_backfill_state to service_role;

create or replace function public.normalize_brand_key(p_value text)
returns text
language plpgsql
immutable
set search_path=''
as $function$
declare v text:=lower(trim(coalesce(p_value,'')));
begin
  if v='' then return null; end if;
  v:=regexp_replace(v,'[[:space:]]*(#|store[[:space:]]*#?|location[[:space:]]*#?)[[:space:]]*[0-9]+[[:space:]]*$','','i');
  v:=regexp_replace(v,'[^a-z0-9]+',' ','g');
  v:=regexp_replace(v,'[[:space:]]+',' ','g');
  return nullif(trim(v),'');
end;
$function$;

create or replace function public.brand_display_base(p_value text)
returns text
language plpgsql
immutable
set search_path=''
as $function$
declare v text:=trim(coalesce(p_value,''));
begin
  if v='' then return null; end if;
  v:=regexp_replace(v,'[[:space:]]*(#|store[[:space:]]*#?|location[[:space:]]*#?)[[:space:]]*[0-9]+[[:space:]]*$','','i');
  return nullif(trim(v),'');
end;
$function$;

create or replace function public.resolve_location_brand_identity(
  p_brand text,
  p_name text,
  p_operator text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_key text;
  v_row public.brand_identity_aliases;
  v_known text;
begin
  -- Explicit source/provider brand metadata wins, including brands Kleenest has never seen.
  if nullif(trim(coalesce(p_brand,'')),'') is not null then
    v_key:=public.normalize_brand_key(p_brand);
    select * into v_row from public.brand_identity_aliases where alias_key=v_key and active;
    if found then
      return jsonb_build_object(
        'canonical_brand',v_row.canonical_brand,
        'source',case when v_row.source='manual' then 'provider_manual_alias' else 'provider_alias' end,
        'confidence',greatest(v_row.confidence,.980),
        'alias_key',v_key
      );
    end if;
    return jsonb_build_object(
      'canonical_brand',trim(p_brand),'source','provider_brand','confidence',.990,'alias_key',v_key
    );
  end if;

  -- Operator/name inference only auto-applies high-confidence learned aliases.
  if nullif(trim(coalesce(p_operator,'')),'') is not null then
    v_key:=public.normalize_brand_key(p_operator);
    select * into v_row
    from public.brand_identity_aliases
    where alias_key=v_key and active and (source<>'frequency' or confidence>=.930);
    if found then
      return jsonb_build_object(
        'canonical_brand',v_row.canonical_brand,'source','operator_alias',
        'confidence',least(v_row.confidence,.950),'alias_key',v_key
      );
    end if;
  end if;

  if nullif(trim(coalesce(p_name,'')),'') is not null then
    v_key:=public.normalize_brand_key(p_name);
    select * into v_row
    from public.brand_identity_aliases
    where alias_key=v_key and active and (source<>'frequency' or confidence>=.930);
    if found then
      return jsonb_build_object(
        'canonical_brand',v_row.canonical_brand,
        'source',case when v_row.source='frequency' then 'learned_name_alias' else 'name_alias' end,
        'confidence',v_row.confidence,'alias_key',v_key
      );
    end if;
  end if;

  -- Compatibility fallback for the already-shipped deterministic recognizer.
  v_known:=public.normalize_ingestion_brand(null,p_name,p_operator);
  if v_known is not null then
    return jsonb_build_object(
      'canonical_brand',v_known,'source','known_pattern','confidence',.960,
      'alias_key',public.normalize_brand_key(v_known)
    );
  end if;

  return jsonb_build_object('canonical_brand',null,'source',null,'confidence',null,'alias_key',null);
end;
$function$;

create or replace function public.refresh_brand_identity_registry()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_existing bigint:=0;
  v_provider bigint:=0;
  v_frequency bigint:=0;
begin
  -- First-class brands already preserved by canonical ingestion seed the registry.
  insert into public.brand_identity_aliases(
    alias_key,alias_text,canonical_brand,source,confidence,evidence_count,city_count,state_count,first_seen_at,last_seen_at,updated_at
  )
  select
    public.normalize_brand_key(l.brand_name),min(l.brand_name),min(l.brand_name),'existing',.980,
    count(*),count(distinct coalesce(l.city,'')),count(distinct coalesce(l.state,'')),
    min(coalesce(l.created_at,now())),max(coalesce(l.updated_at,l.created_at,now())),now()
  from public.locations l
  where nullif(trim(l.brand_name),'') is not null
    and public.normalize_brand_key(l.brand_name) is not null
  group by public.normalize_brand_key(l.brand_name)
  on conflict(alias_key) do update set
    alias_text=case when excluded.confidence>public.brand_identity_aliases.confidence then excluded.alias_text else public.brand_identity_aliases.alias_text end,
    canonical_brand=case when excluded.confidence>public.brand_identity_aliases.confidence then excluded.canonical_brand else public.brand_identity_aliases.canonical_brand end,
    source=case when excluded.confidence>public.brand_identity_aliases.confidence then excluded.source else public.brand_identity_aliases.source end,
    confidence=greatest(public.brand_identity_aliases.confidence,excluded.confidence),
    evidence_count=greatest(public.brand_identity_aliases.evidence_count,excluded.evidence_count),
    city_count=greatest(public.brand_identity_aliases.city_count,excluded.city_count),
    state_count=greatest(public.brand_identity_aliases.state_count,excluded.state_count),
    last_seen_at=greatest(public.brand_identity_aliases.last_seen_at,excluded.last_seen_at),
    updated_at=now();
  get diagnostics v_existing=row_count;

  -- Generic source/provider metadata: no brand-specific code release is required.
  insert into public.brand_identity_aliases(
    alias_key,alias_text,canonical_brand,source,confidence,evidence_count,city_count,state_count,first_seen_at,last_seen_at,updated_at
  )
  select
    public.normalize_brand_key(x.brand),min(x.brand),min(x.brand),'provider',.990,
    count(*),count(distinct coalesce(x.city,'')),count(distinct coalesce(x.state,'')),
    min(coalesce(x.created_at,now())),max(coalesce(x.updated_at,x.created_at,now())),now()
  from (
    select
      coalesce(nullif(trim(l.source_metadata->>'brand'),''),nullif(trim(l.source_metadata->'tags'->>'brand'),'')) brand,
      l.city,l.state,l.created_at,l.updated_at
    from public.locations l
  ) x
  where x.brand is not null and public.normalize_brand_key(x.brand) is not null
  group by public.normalize_brand_key(x.brand)
  on conflict(alias_key) do update set
    alias_text=case when excluded.confidence>=public.brand_identity_aliases.confidence then excluded.alias_text else public.brand_identity_aliases.alias_text end,
    canonical_brand=case when excluded.confidence>=public.brand_identity_aliases.confidence then excluded.canonical_brand else public.brand_identity_aliases.canonical_brand end,
    source=case when excluded.confidence>=public.brand_identity_aliases.confidence then excluded.source else public.brand_identity_aliases.source end,
    confidence=greatest(public.brand_identity_aliases.confidence,excluded.confidence),
    evidence_count=greatest(public.brand_identity_aliases.evidence_count,excluded.evidence_count),
    city_count=greatest(public.brand_identity_aliases.city_count,excluded.city_count),
    state_count=greatest(public.brand_identity_aliases.state_count,excluded.state_count),
    last_seen_at=greatest(public.brand_identity_aliases.last_seen_at,excluded.last_seen_at),
    updated_at=now();
  get diagnostics v_provider=row_count;

  -- Repeated commercial identities become learned candidates. Only confidence >= .930
  -- is auto-applied, preventing generic names from being incorrectly merged as brands.
  insert into public.brand_identity_aliases(
    alias_key,alias_text,canonical_brand,source,confidence,evidence_count,city_count,state_count,first_seen_at,last_seen_at,updated_at
  )
  select
    g.alias_key,g.display_name,
    coalesce(public.normalize_ingestion_brand(null,g.display_name,null),g.display_name),
    'frequency',
    case when g.evidence_count>=200 then .950 when g.evidence_count>=50 then .930 when g.state_count>=2 then .910 else .880 end,
    g.evidence_count,g.city_count,g.state_count,g.first_seen_at,g.last_seen_at,now()
  from (
    select
      public.normalize_brand_key(l.name) alias_key,
      min(public.brand_display_base(l.name)) display_name,
      count(*) evidence_count,
      count(distinct coalesce(l.city,'')) city_count,
      count(distinct coalesce(l.state,'')) state_count,
      min(coalesce(l.created_at,now())) first_seen_at,
      max(coalesce(l.updated_at,l.created_at,now())) last_seen_at
    from public.locations l
    where l.is_active is distinct from false
      and l.place_type in ('restaurant','cafe','gas_station','shopping','retail','lodging','service','business','health')
      and nullif(trim(l.name),'') is not null
      and lower(trim(l.name)) not like 'unnamed %'
      and lower(trim(l.name)) !~ '^(public restroom|restroom|toilet|toilets|memorial park|city park|community park|public park|public library|library|rest area|parking|parking lot|playground|picnic area|trailhead|cemetery|city hall|courthouse|post office|fire station|police station|hospital|clinic|school|high school|middle school|elementary school|church)$'
      and public.normalize_brand_key(l.name) is not null
    group by public.normalize_brand_key(l.name)
    having count(*)>=8
       and count(distinct coalesce(l.city,''))>=3
       and (count(distinct coalesce(l.state,''))>=2 or count(*)>=25)
  ) g
  where length(g.alias_key)>=2
  on conflict(alias_key) do update set
    evidence_count=greatest(public.brand_identity_aliases.evidence_count,excluded.evidence_count),
    city_count=greatest(public.brand_identity_aliases.city_count,excluded.city_count),
    state_count=greatest(public.brand_identity_aliases.state_count,excluded.state_count),
    last_seen_at=greatest(public.brand_identity_aliases.last_seen_at,excluded.last_seen_at),
    updated_at=now();
  get diagnostics v_frequency=row_count;

  -- Canonical family/product variants; aliases remain data, not application code.
  insert into public.brand_identity_aliases(alias_key,alias_text,canonical_brand,source,confidence,evidence_count,updated_at)
  values
    (public.normalize_brand_key('Casey''s General Store'),'Casey''s General Store','Casey''s','manual',.999,0,now()),
    (public.normalize_brand_key('CVS Pharmacy'),'CVS Pharmacy','CVS','manual',.999,0,now()),
    (public.normalize_brand_key('Walmart Pharmacy'),'Walmart Pharmacy','Walmart','manual',.999,0,now()),
    (public.normalize_brand_key('Walmart Supercenter'),'Walmart Supercenter','Walmart','manual',.999,0,now()),
    (public.normalize_brand_key('DQ Grill & Chill'),'DQ Grill & Chill','Dairy Queen','manual',.999,0,now()),
    (public.normalize_brand_key('Hy-Vee Pharmacy'),'Hy-Vee Pharmacy','Hy-Vee','manual',.999,0,now()),
    (public.normalize_brand_key('Hy-Vee Gas'),'Hy-Vee Gas','Hy-Vee','manual',.999,0,now()),
    (public.normalize_brand_key('The Home Depot'),'The Home Depot','Home Depot','manual',.999,0,now()),
    (public.normalize_brand_key('Tesla Supercharger'),'Tesla Supercharger','Tesla','manual',.999,0,now())
  on conflict(alias_key) do update set
    alias_text=excluded.alias_text,canonical_brand=excluded.canonical_brand,source='manual',
    confidence=.999,active=true,updated_at=now();

  return jsonb_build_object(
    'existing_alias_rows',v_existing,'provider_alias_rows',v_provider,'frequency_alias_rows',v_frequency,
    'registry_size',(select count(*) from public.brand_identity_aliases where active),'refreshed_at',now()
  );
end;
$function$;

create or replace function public.backfill_location_brand_identities(p_limit integer default 5000)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_limit integer:=greatest(100,least(coalesce(p_limit,5000),10000));
  v_cursor uuid;
  v_batch_max uuid;
  v_batch_count integer:=0;
  v_identity_rows integer:=0;
  v_location_updates integer:=0;
begin
  select last_location_id into v_cursor
  from public.brand_identity_backfill_state where singleton=true for update;

  select max(id),count(*) into v_batch_max,v_batch_count
  from (
    select l.id
    from public.locations l
    where v_cursor is null or l.id>v_cursor
    order by l.id
    limit v_limit
  ) batch;

  if v_batch_count=0 then
    update public.brand_identity_backfill_state set last_location_id=null,updated_at=now() where singleton=true;
    return jsonb_build_object('scanned',0,'identified',0,'locations_updated',0,'cycle_complete',true,'processed_at',now());
  end if;

  insert into public.location_brand_identities(location_id,canonical_brand,source,confidence,alias_key,detected_at,updated_at)
  select
    l.id,
    identity->>'canonical_brand',
    identity->>'source',
    (identity->>'confidence')::numeric,
    nullif(identity->>'alias_key',''),
    now(),now()
  from public.locations l
  cross join lateral public.resolve_location_brand_identity(
    coalesce(
      nullif(trim(l.source_metadata->>'brand'),''),
      nullif(trim(l.source_metadata->'tags'->>'brand'),''),
      nullif(trim(l.brand_name),'')
    ),
    l.name,
    coalesce(
      nullif(trim(l.source_metadata->>'operator'),''),
      nullif(trim(l.source_metadata->'tags'->>'operator'),''),
      nullif(trim(l.operator_name),'')
    )
  ) identity
  where (v_cursor is null or l.id>v_cursor) and l.id<=v_batch_max
    and nullif(identity->>'canonical_brand','') is not null
  on conflict(location_id) do update set
    canonical_brand=excluded.canonical_brand,
    source=excluded.source,
    confidence=excluded.confidence,
    alias_key=excluded.alias_key,
    updated_at=now();
  get diagnostics v_identity_rows=row_count;

  update public.locations l
  set brand_name=i.canonical_brand,updated_at=now()
  from public.location_brand_identities i
  where i.location_id=l.id
    and (v_cursor is null or l.id>v_cursor) and l.id<=v_batch_max
    and l.brand_name is distinct from i.canonical_brand;
  get diagnostics v_location_updates=row_count;

  update public.brand_identity_backfill_state
  set last_location_id=case when v_batch_count<v_limit then null else v_batch_max end,updated_at=now()
  where singleton=true;

  return jsonb_build_object(
    'scanned',v_batch_count,'identified',v_identity_rows,'locations_updated',v_location_updates,
    'cycle_complete',v_batch_count<v_limit,'last_location_id',case when v_batch_count<v_limit then null else v_batch_max end,
    'processed_at',now()
  );
end;
$function$;

revoke all on function public.normalize_brand_key(text) from public;
revoke all on function public.brand_display_base(text) from public;
revoke all on function public.resolve_location_brand_identity(text,text,text) from public;
revoke all on function public.refresh_brand_identity_registry() from public;
revoke all on function public.backfill_location_brand_identities(integer) from public;
grant execute on function public.normalize_brand_key(text) to service_role;
grant execute on function public.brand_display_base(text) to service_role;
grant execute on function public.resolve_location_brand_identity(text,text,text) to service_role;
grant execute on function public.refresh_brand_identity_registry() to service_role;
grant execute on function public.backfill_location_brand_identities(integer) to service_role;

-- Seed the learned registry from current canonical data; location backfill is intentionally
-- incremental so active ingestion is never blocked by a large table rewrite.
select public.refresh_brand_identity_registry();

do $schedule$
begin
  begin
    if exists(select 1 from cron.job where jobname='kleenest-brand-registry-refresh') then
      perform cron.unschedule('kleenest-brand-registry-refresh');
    end if;
    if exists(select 1 from cron.job where jobname='kleenest-brand-identity-backfill') then
      perform cron.unschedule('kleenest-brand-identity-backfill');
    end if;
    perform cron.schedule('kleenest-brand-registry-refresh','17 3 * * *','select public.refresh_brand_identity_registry();');
    perform cron.schedule('kleenest-brand-identity-backfill','*/5 * * * *','select public.backfill_location_brand_identities(5000);');
  exception when others then
    null;
  end;
end;
$schedule$;
