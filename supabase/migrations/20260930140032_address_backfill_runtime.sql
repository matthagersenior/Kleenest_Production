-- Prioritize address enrichment around recently active discovery areas and schedule a small,
-- rate-limited worker so user-visible canonical locations gain usable street addresses.

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'kleenest_address_backfill_worker_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'kleenest_address_backfill_worker_secret',
      'Worker secret for canonical location address enrichment'
    );
  end if;
end
$$;

create or replace function public.authorize_address_backfill_worker(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, vault
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'kleenest_address_backfill_worker_secret'
      and decrypted_secret = coalesce(p_secret, '')
  );
$$;

revoke all on function public.authorize_address_backfill_worker(text) from public, anon, authenticated;
grant execute on function public.authorize_address_backfill_worker(text) to service_role;

create or replace function public.address_backfill_candidates(p_limit integer default 12)
returns table (
  id uuid,
  latitude double precision,
  longitude double precision,
  address text,
  city text,
  state text,
  postal_code text,
  country text
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  with center as (
    select
      e.latitude,
      e.longitude,
      greatest(
        5000.0,
        least(25000.0, coalesce(e.radius_km, 1.609) * 1000.0 + 3000.0)
      ) as radius_m
    from public.location_discovery_events e
    where e.created_at >= now() - interval '30 days'
      and e.latitude is not null
      and e.longitude is not null
    order by e.created_at desc
    limit 1
  )
  select
    l.id,
    l.latitude,
    l.longitude,
    l.address,
    l.city,
    l.state,
    l.postal_code,
    l.country
  from center c
  join public.locations l
    on l.geom is not null
   and st_dwithin(
     l.geom,
     st_setsrid(st_makepoint(c.longitude, c.latitude), 4326)::geography,
     c.radius_m
   )
  left join public.location_address_backfills b
    on b.location_id = l.id
  where l.latitude is not null
    and l.longitude is not null
    and (
      nullif(trim(coalesce(l.address, '')), '') is null
      or nullif(trim(coalesce(l.city, '')), '') is null
      or nullif(trim(coalesce(l.state, '')), '') is null
      or nullif(trim(coalesce(l.postal_code, '')), '') is null
      or l.address ~ '^[A-Z]{2},\s*[0-9]{5}(?:-[0-9]{4})?,\s*[A-Z]{2}$'
      or l.address ~ '^[A-Z]{2}$'
    )
    and (
      b.fetched_at is null
      or b.fetched_at < now() - interval '30 days'
    )
  order by
    case
      when nullif(trim(coalesce(l.address, '')), '') is null then 0
      when l.address ~ '^[A-Z]{2},\s*[0-9]{5}(?:-[0-9]{4})?,\s*[A-Z]{2}$' then 1
      when nullif(trim(coalesce(l.city, '')), '') is null then 2
      else 3
    end,
    l.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 12), 25));
$$;

revoke all on function public.address_backfill_candidates(integer) from public, anon, authenticated;
grant execute on function public.address_backfill_candidates(integer) to service_role;

do $$
begin
  perform cron.unschedule('kleenest-address-backfill');
exception when others then
  null;
end
$$;

select cron.schedule(
  'kleenest-address-backfill',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/backfill-location-addresses',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-kleenest-worker-secret',
        (select decrypted_secret
           from vault.decrypted_secrets
          where name = 'kleenest_address_backfill_worker_secret'
          limit 1)
      ),
      body := '{"limit":12,"source":"cron"}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);
