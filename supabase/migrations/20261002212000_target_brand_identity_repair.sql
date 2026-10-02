-- Convert brand backfill from a perpetual whole-table scanner into a targeted historical repair.
-- New ingestion already maintains brand identities synchronously.

create index if not exists locations_brand_identity_repair_candidate_idx
  on public.locations (id)
  where is_active=true
    and (
      nullif(trim(brand_name),'') is not null
      or nullif(trim(source_metadata->>'brand'),'') is not null
      or nullif(trim(source_metadata->'tags'->>'brand'),'') is not null
    );

create or replace function public.backfill_location_brand_identities(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_limit integer:=greatest(10,least(coalesce(p_limit,100),250));
  v_scanned integer:=0;
  v_identified integer:=0;
begin
  with candidates as materialized (
    select
      l.id,
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
      ) as identity
    from public.locations l
    left join public.location_brand_identities i on i.location_id=l.id
    where l.is_active=true
      and i.location_id is null
      and (
        nullif(trim(l.brand_name),'') is not null
        or nullif(trim(l.source_metadata->>'brand'),'') is not null
        or nullif(trim(l.source_metadata->'tags'->>'brand'),'') is not null
      )
    order by l.id
    limit v_limit
  ),
  inserted as (
    insert into public.location_brand_identities(
      location_id,canonical_brand,source,confidence,alias_key,detected_at,updated_at
    )
    select
      c.id,
      c.identity->>'canonical_brand',
      coalesce(nullif(c.identity->>'source',''),'historical_repair'),
      coalesce(nullif(c.identity->>'confidence','')::numeric,.900),
      nullif(c.identity->>'alias_key',''),
      now(),
      now()
    from candidates c
    where nullif(c.identity->>'canonical_brand','') is not null
    on conflict(location_id) do nothing
    returning 1
  )
  select
    (select count(*) from candidates),
    (select count(*) from inserted)
  into v_scanned,v_identified;

  return jsonb_build_object(
    'scanned',v_scanned,
    'identified',v_identified,
    'locations_updated',0,
    'cycle_complete',v_scanned<v_limit,
    'repair_mode','explicit_brand_evidence_only',
    'processed_at',now()
  );
end;
$function$;

do $block$
declare v_job bigint;
begin
  select jobid into v_job
  from cron.job
  where jobname='kleenest-brand-identity-backfill';

  if v_job is not null then
    perform cron.alter_job(
      job_id=>v_job,
      schedule=>'43 * * * *',
      command=>'select public.backfill_location_brand_identities(100);'
    );
  end if;
end
$block$;
