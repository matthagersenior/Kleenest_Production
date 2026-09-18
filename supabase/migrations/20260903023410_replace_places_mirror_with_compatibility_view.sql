do $$
declare
  v_restroom_def text;
  v_snapshot_def text;
begin
  select pg_get_viewdef('public.restroom_intelligence'::regclass, true) into v_restroom_def;
  select pg_get_viewdef('public.location_intelligence_snapshot'::regclass, true) into v_snapshot_def;

  create table public.place_compat_overrides (
    location_id uuid primary key references public.locations(id) on delete cascade,
    place_id uuid not null unique,
    slug text unique,
    created_at timestamptz not null
  );

  insert into public.place_compat_overrides(location_id, place_id, slug, created_at)
  select location_id, id, slug, created_at
  from public.places
  where id is distinct from location_id or slug is not null;

  drop trigger if exists locations_sync_places on public.locations;

  alter table public.places rename to places_legacy_storage;

  execute $view$
    create view public.places
    with (security_invoker = true)
    as
    select
      coalesce(o.place_id, l.id) as id,
      l.name,
      o.slug,
      public.map_location_category(l.place_type) as category,
      l.description,
      l.address,
      l.city,
      l.state,
      l.postal_code,
      l.latitude,
      l.longitude,
      coalesce(l.rating, 0::numeric) as rating,
      coalesce(l.review_count, 0) as review_count,
      l.is_active,
      (l.verification_status::text = 'verified') as is_verified,
      coalesce(o.created_at, l.created_at) as created_at,
      l.updated_at,
      l.id as location_id
    from public.locations l
    left join public.place_compat_overrides o on o.location_id = l.id
  $view$;

  grant select on public.places to anon, authenticated, service_role;

  execute 'create or replace view public.restroom_intelligence as ' || v_restroom_def;
  execute 'create or replace view public.location_intelligence_snapshot as ' || v_snapshot_def;

  drop table public.places_legacy_storage;
  drop function if exists public.sync_location_to_place();
end $$;

comment on view public.places is 'Compatibility projection over canonical public.locations. Legacy place IDs/slugs are preserved in public.place_compat_overrides; no full duplicate place storage is maintained.';
