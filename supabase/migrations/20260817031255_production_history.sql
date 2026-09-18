create table if not exists public.location_sources (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  source_type text not null,
  external_id text,
  source_url text,
  observed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(source_type, external_id)
);
create index if not exists location_sources_location_idx on public.location_sources(location_id);
create index if not exists location_sources_source_idx on public.location_sources(source_type, observed_at desc);

create table if not exists public.location_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  bbox jsonb,
  stats jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists location_ingestion_jobs_status_idx on public.location_ingestion_jobs(status, requested_at desc);

create table if not exists public.location_confidence (
  location_id uuid primary key references public.locations(id) on delete cascade,
  score numeric(5,2) not null default 0 check (score >= 0 and score <= 100),
  level text not null default 'unknown' check (level in ('unknown','low','moderate','high','trusted')),
  verification_count integer not null default 0,
  positive_verifications integer not null default 0,
  negative_verifications integer not null default 0,
  source_count integer not null default 0,
  review_count integer not null default 0,
  last_verified_at timestamptz,
  computed_at timestamptz not null default now(),
  factors jsonb not null default '{}'::jsonb
);

create or replace function public.kleenest_location_confidence(p_location_id uuid)
returns table(score numeric, level text, verification_count integer, source_count integer, review_count integer, factors jsonb)
language sql stable security invoker
as $$
  with l as (
    select id, verification_status, bathroom_verification_status,
      coalesce(bathroom_verification_count,0) verification_count,
      coalesce(bathroom_positive_count,0) positive_count,
      coalesce(bathroom_negative_count,0) negative_count,
      coalesce(review_count,0) review_count,
      rating, updated_at, bathroom_verified_at, source, source_dataset
    from public.locations where id=p_location_id
  ), s as (
    select count(*)::int source_count from public.location_sources where location_id=p_location_id
  ), c as (
    select l.*,s.source_count,
      least(100::numeric,
        20 +
        case when lower(coalesce(l.bathroom_verification_status,'')) in ('verified','confirmed','has_bathroom') then 35 else 0 end +
        least(20, l.positive_count * 4) - least(15, l.negative_count * 5) +
        least(10, l.review_count * 1.5) +
        least(10, s.source_count * 3) +
        case when l.updated_at > now() - interval '180 days' then 5 else 0 end
      ) score
    from l cross join s
  )
  select round(score,2),
    case when score >= 85 then 'trusted' when score >= 65 then 'high' when score >= 40 then 'moderate' when score > 0 then 'low' else 'unknown' end,
    verification_count, source_count, review_count,
    jsonb_build_object(
      'bathroom_status', bathroom_verification_status,
      'verification_positive', positive_count,
      'verification_negative', negative_count,
      'rating', rating,
      'source', source,
      'source_dataset', source_dataset,
      'updated_at', updated_at,
      'bathroom_verified_at', bathroom_verified_at
    )
  from c;
$$;

create or replace view public.location_health as
select l.id as location_id, l.name, l.place_type, l.city, l.state,
  coalesce(c.score,0)::numeric(5,2) as confidence_score,
  coalesce(c.level,'unknown') as confidence_level,
  coalesce(l.bathroom_verification_count,0) as verification_count,
  coalesce(l.bathroom_positive_count,0) as positive_verifications,
  coalesce(l.bathroom_negative_count,0) as negative_verifications,
  coalesce(l.review_count,0) as review_count,
  l.rating, l.updated_at, l.source, l.source_dataset
from public.locations l
left join public.location_confidence c on c.location_id=l.id;

alter table public.location_sources enable row level security;
alter table public.location_ingestion_jobs enable row level security;
alter table public.location_confidence enable row level security;

drop policy if exists location_sources_public_read on public.location_sources;
create policy location_sources_public_read on public.location_sources for select using (true);
drop policy if exists location_ingestion_admin_read on public.location_ingestion_jobs;
create policy location_ingestion_admin_read on public.location_ingestion_jobs for select using (auth.uid() is not null and exists (select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.is_admin,false)));
drop policy if exists location_confidence_public_read on public.location_confidence;
create policy location_confidence_public_read on public.location_confidence for select using (true);

revoke all on function public.list_program_locations(uuid) from public, anon;
revoke all on function public.list_my_demo_programs() from public, anon;
revoke all on function public.list_my_partner_memberships() from public, anon;
grant execute on function public.list_program_locations(uuid) to authenticated, service_role;
grant execute on function public.list_my_demo_programs() to authenticated, service_role;
grant execute on function public.list_my_partner_memberships() to authenticated, service_role;
grant execute on function public.kleenest_location_confidence(uuid) to anon, authenticated, service_role;
