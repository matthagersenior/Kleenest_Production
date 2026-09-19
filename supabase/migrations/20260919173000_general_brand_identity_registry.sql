-- General brand identity authority for automatic discovery.
-- Explicit provider brand metadata always wins; repeated commercial names teach the registry
-- so recognizable chains do not require a code release to become first-class brand data.

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
  on public.brand_identity_aliases ((lower(canonical_brand)))
  where active;

alter table public.brand_identity_aliases enable row level security;
revoke all on table public.brand_identity_aliases from public,anon,authenticated;
grant select,insert,update,delete on table public.brand_identity_aliases to service_role;

alter table public.locations add column if not exists brand_identity_source text;
alter table public.locations add column if not exists brand_confidence numeric(4,3);
create index if not exists idx_locations_brand_identity_source
  on public.locations (brand_identity_source)
  where brand_identity_source is not null;

create or replace function public.normalize_brand_key(p_value text)
returns text
language plpgsql
immutable
set search_path=''
as $function$
declare
  v text:=lower(trim(coalesce(p_value,'')));
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
declare
  v text:=trim(coalesce(p_value,''));
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
  -- Provider-supplied brand identity is authoritative even if Kleenest has never seen it before.
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
      'canonical_brand',trim(p_brand),
      'source','provider_brand',
      'confidence',.990,
      'alias_key',v_key
    );
  end if;

  -- Operator names are only treated as brands when already recognized by the registry.
  if nullif(trim(coalesce(p_operator,'')),'') is not null then
    v_key:=public.normalize_brand_key(p_operator);
    select * into v_row
    from public.brand_identity_aliases
    where alias_key=v_key and active
      and (source<>'frequency' or confidence>=.930);
    if found then
      return jsonb_build_object(
        'canonical_brand',v_row.canonical_brand,
        'source','operator_alias',
        'confidence',least(v_row.confidence,.950),
        'alias_key',v_key
      );
    end if;
  end if;

  -- Name recognition uses the learned registry. normalize_brand_key removes common store-number suffixes.
  if nullif(trim(coalesce(p_name,'')),'') is not null then
    v_key:=public.normalize_brand_key(p_name);
    select * into v_row
    from public.brand_identity_aliases
    where alias_key=v_key and active
      and (source<>'frequency' or confidence>=.930);
    if found then
      return jsonb_build_object(
        'canonical_brand',v_row.canonical_brand,
        'source',case when v_row.source='frequency' then 'learned_name_alias' else 'name_alias' end,
        'confidence',v_row.confidence,
        'alias_key',v_key
      );
    end if;
  end if;

  -- Preserve the small deterministic legacy recognizer as a final compatibility fallback.
  v_known:=public.normalize_ingestion_brand(null,p_name,p_operator);
  if v_known is not null then
    return jsonb_build_object(
      'canonical_brand',v_known,
      'source','known_pattern',
      'confidence',.960,
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
  v_provider bigint:=0;
  v_existing bigint:=0;
  v_frequency bigint:=0;
  v_backfilled bigint:=0;
begin
  -- Existing canonical brand data is strong evidence and seeds exact aliases.
  insert into public.brand_identity_aliases(
    alias_key,alias_text,canonical_brand,source,confidence,evidence_count,city_count,state_count,first_seen_at,last_seen_at,updated_at
  )
  select
    public.normalize_brand_key(l.brand_name),
    min(l.brand_name),
    min(l.brand_name),
    'existing',
    .980,
    count(*),
    count(distinct coalesce(l.city,'')),
    count(distinct coalesce(l.state,'')),
    min(coalesce(l.created_at,now())),
    max(coalesce(l.updated_at,l.created_at,now())),
    now()
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

  -- Any explicit provider brand is accepted generically; no hard-coded chain list is required.
  insert into public.brand_identity_aliases(
    alias_key,alias_text,canonical_brand,source,confidence,evidence_count,city_count,state_count,first_seen_at,last_seen_at,updated_at
  )
  select
    public.normalize_brand_key(x.brand),
    min(x.brand),
    min(x.brand),
    'provider',
    .990,
    count(*),
    count(distinct coalesce(x.city,'')),
    count(distinct coalesce(x.state,'')),
    min(coalesce(x.created_at,now())),
    max(coalesce(x.updated_at,x.created_at,now())),
    now()
  from (
    select
      coalesce(
        nullif(trim(l.source_metadata->>'brand'),''),
        nullif(trim(l.source_metadata->'tags'->>'brand'),'')
      ) brand,
      l.city,l.state,l.created_at,l.updated_at
    from public.locations l
  ) x
  where x.brand is not null
    and public.normalize_brand_key(x.brand) is not null
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

  -- Learn recognizable chains from repeated commercial names across multiple places.
  -- Generic civic/place labels are explicitly excluded to avoid inventing brands.
  insert into public.brand_identity_aliases(
    alias_key,alias_text,canonical_brand,source,confidence,evidence_count,city_count,state_count,first_seen_at,last_seen_at,updated_at
  )
  select
    g.alias_key,
    g.display_name,
    coalesce(public.normalize_ingestion_brand(null,g.display_name,null),g.display_name),
    'frequency',
    case
      when g.evidence_count>=200 then .950
      when g.evidence_count>=50 then .930
      when g.state_count>=2 then .910
      else .880
    end,
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

  -- Canonicalize a few common family/product variants; the registry remains extensible and data-driven.
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
    alias_text=excluded.alias_text,
    canonical_brand=excluded.canonical_brand,
    source='manual',
    confidence=.999,
    active=true,
    updated_at=now();

  -- Backfill any location that can now be resolved by explicit metadata/operator/name aliases.
  with resolved as (
    select l.id,
           public.resolve_location_brand_identity(
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
    from public.locations l
    where l.is_active is distinct from false
  )
  update public.locations l
  set
    brand_name=nullif(r.identity->>'canonical_brand',''),
    brand_identity_source=nullif(r.identity->>'source',''),
    brand_confidence=nullif(r.identity->>'confidence','')::numeric,
    updated_at=case
      when l.brand_name is distinct from nullif(r.identity->>'canonical_brand','')
        or l.brand_identity_source is distinct from nullif(r.identity->>'source','')
        or l.brand_confidence is distinct from nullif(r.identity->>'confidence','')::numeric
      then now() else l.updated_at end
  from resolved r
  where l.id=r.id
    and nullif(r.identity->>'canonical_brand','') is not null
    and (
      l.brand_name is distinct from nullif(r.identity->>'canonical_brand','')
      or l.brand_identity_source is distinct from nullif(r.identity->>'source','')
      or l.brand_confidence is distinct from nullif(r.identity->>'confidence','')::numeric
    );
  get diagnostics v_backfilled=row_count;

  return jsonb_build_object(
    'provider_alias_rows',v_provider,
    'existing_alias_rows',v_existing,
    'frequency_alias_rows',v_frequency,
    'locations_backfilled',v_backfilled,
    'registry_size',(select count(*) from public.brand_identity_aliases where active),
    'refreshed_at',now()
  );
end;
$function$;

create or replace function public._resolve_location_brand_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_identity jsonb;
  v_explicit_brand text;
  v_operator text;
begin
  v_explicit_brand:=coalesce(
    nullif(trim(new.source_metadata->>'brand'),''),
    nullif(trim(new.source_metadata->'tags'->>'brand'),''),
    nullif(trim(new.brand_name),'')
  );
  v_operator:=coalesce(
    nullif(trim(new.source_metadata->>'operator'),''),
    nullif(trim(new.source_metadata->'tags'->>'operator'),''),
    nullif(trim(new.operator_name),'')
  );

  v_identity:=public.resolve_location_brand_identity(v_explicit_brand,new.name,v_operator);
  if nullif(v_identity->>'canonical_brand','') is not null then
    new.brand_name:=v_identity->>'canonical_brand';
    new.brand_identity_source:=v_identity->>'source';
    new.brand_confidence:=(v_identity->>'confidence')::numeric;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_locations_resolve_brand_identity on public.locations;
create trigger trg_locations_resolve_brand_identity
before insert or update of name,brand_name,operator_name,source_metadata
on public.locations
for each row execute function public._resolve_location_brand_trigger();

create or replace function public._learn_provider_brand_alias_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_brand text;
  v_key text;
begin
  v_brand:=coalesce(
    nullif(trim(new.source_metadata->>'brand'),''),
    nullif(trim(new.source_metadata->'tags'->>'brand'),'')
  );
  if v_brand is null then return new; end if;
  v_key:=public.normalize_brand_key(v_brand);
  if v_key is null then return new; end if;

  insert into public.brand_identity_aliases(
    alias_key,alias_text,canonical_brand,source,confidence,evidence_count,city_count,state_count,first_seen_at,last_seen_at,updated_at
  ) values(
    v_key,v_brand,coalesce(nullif(trim(new.brand_name),''),v_brand),'provider',.990,1,
    case when nullif(trim(new.city),'') is null then 0 else 1 end,
    case when nullif(trim(new.state),'') is null then 0 else 1 end,
    coalesce(new.created_at,now()),coalesce(new.updated_at,new.created_at,now()),now()
  )
  on conflict(alias_key) do update set
    alias_text=case when public.brand_identity_aliases.confidence<=excluded.confidence then excluded.alias_text else public.brand_identity_aliases.alias_text end,
    canonical_brand=case when public.brand_identity_aliases.confidence<=excluded.confidence then excluded.canonical_brand else public.brand_identity_aliases.canonical_brand end,
    source=case when public.brand_identity_aliases.confidence<=excluded.confidence then 'provider' else public.brand_identity_aliases.source end,
    confidence=greatest(public.brand_identity_aliases.confidence,.990),
    evidence_count=public.brand_identity_aliases.evidence_count+1,
    last_seen_at=greatest(public.brand_identity_aliases.last_seen_at,excluded.last_seen_at),
    updated_at=now();
  return new;
end;
$function$;

drop trigger if exists trg_locations_learn_provider_brand on public.locations;
create trigger trg_locations_learn_provider_brand
after insert or update of source_metadata,brand_name
on public.locations
for each row execute function public._learn_provider_brand_alias_trigger();

revoke all on function public.normalize_brand_key(text) from public;
revoke all on function public.brand_display_base(text) from public;
revoke all on function public.resolve_location_brand_identity(text,text,text) from public;
revoke all on function public.refresh_brand_identity_registry() from public;
grant execute on function public.normalize_brand_key(text) to service_role;
grant execute on function public.brand_display_base(text) to service_role;
grant execute on function public.resolve_location_brand_identity(text,text,text) to service_role;
grant execute on function public.refresh_brand_identity_registry() to service_role;

-- Seed and backfill now; future ingestion is handled synchronously by triggers.
select public.refresh_brand_identity_registry();

-- Refresh learned repeat-name aliases daily so a newly encountered regional/national chain
-- becomes recognizable automatically once enough independent locations establish the pattern.
do $schedule$
begin
  begin
    if exists(select 1 from cron.job where jobname='kleenest-brand-registry-refresh') then
      perform cron.unschedule('kleenest-brand-registry-refresh');
    end if;
    perform cron.schedule(
      'kleenest-brand-registry-refresh',
      '17 3 * * *',
      'select public.refresh_brand_identity_registry();'
    );
  exception when others then
    null;
  end;
end;
$schedule$;
