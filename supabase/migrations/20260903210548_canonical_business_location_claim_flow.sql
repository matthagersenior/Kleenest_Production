create or replace function public.business_list_locations(p_business_id uuid)
returns setof public.locations
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;
  return query
    select l.*
    from public.locations l
    where l.business_id = p_business_id
       or l.claimed_business_id = p_business_id
       or exists (
         select 1 from public.location_claims c
         where c.location_id=l.id and c.business_id=p_business_id and c.status='approved'
       )
    order by l.created_at asc;
end;
$function$;

grant execute on function public.business_list_locations(uuid) to authenticated, service_role;

create or replace function public.business_search_claimable_locations(
  p_business_id uuid,
  p_query text default null,
  p_limit integer default 50
)
returns table(
  id uuid,
  name text,
  address text,
  city text,
  state text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  place_type text,
  phone text,
  website text,
  rating numeric,
  review_count integer,
  claim_status text
)
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;

  return query
  select l.id,l.name,l.address,l.city,l.state,l.postal_code,l.latitude,l.longitude,
         l.place_type,l.phone,l.website,l.rating,l.review_count,
         coalesce((select c.status from public.location_claims c where c.location_id=l.id and c.business_id=p_business_id order by c.updated_at desc limit 1),'unclaimed')::text
  from public.locations l
  where coalesce(l.is_active,true)
    and (l.business_id is null or l.business_id=p_business_id)
    and (l.claimed_business_id is null or l.claimed_business_id=p_business_id)
    and (
      nullif(trim(coalesce(p_query,'')),'') is null
      or coalesce(l.name,'') ilike '%'||trim(p_query)||'%'
      or coalesce(l.address,'') ilike '%'||trim(p_query)||'%'
      or coalesce(l.city,'') ilike '%'||trim(p_query)||'%'
      or coalesce(l.state,'') ilike '%'||trim(p_query)||'%'
    )
  order by
    case when nullif(trim(coalesce(p_query,'')),'') is not null and lower(coalesce(l.name,''))=lower(trim(p_query)) then 0 else 1 end,
    coalesce(l.review_count,0) desc,
    coalesce(l.rating,0) desc,
    l.name
  limit greatest(1,least(coalesce(p_limit,50),100));
end;
$function$;

grant execute on function public.business_search_claimable_locations(uuid,text,integer) to authenticated, service_role;

create or replace function public.business_list_location_claims(p_business_id uuid)
returns table(claim_id uuid, location_id uuid, location_name text, status text, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;
  return query
  select c.id,c.location_id,l.name,c.status,c.created_at,c.updated_at
  from public.location_claims c
  join public.locations l on l.id=c.location_id
  where c.business_id=p_business_id
  order by c.updated_at desc;
end;
$function$;

grant execute on function public.business_list_location_claims(uuid) to authenticated, service_role;

create or replace function public.claim_location_for_business(p_location_id uuid, p_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare cid uuid; v_location public.locations;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  select * into v_location from public.locations where id=p_location_id for update;
  if not found then raise exception 'Location not found'; end if;
  if v_location.business_id is not null and v_location.business_id<>p_business_id then raise exception 'Location is already managed by another business'; end if;
  if v_location.claimed_business_id is not null and v_location.claimed_business_id<>p_business_id then raise exception 'Location is already claimed by another business'; end if;
  if v_location.business_id=p_business_id or v_location.claimed_business_id=p_business_id then return p_location_id; end if;

  insert into public.location_claims(location_id,business_id,claimed_by,status)
  values(p_location_id,p_business_id,auth.uid(),'pending')
  on conflict(location_id,business_id) do update
    set status=case when public.location_claims.status='approved' then 'approved' else 'pending' end,
        claimed_by=excluded.claimed_by,
        updated_at=now()
  returning id into cid;
  return cid;
end;
$function$;

grant execute on function public.claim_location_for_business(uuid,uuid) to authenticated, service_role;

create or replace function public.admin_resolve_location_claim(p_claim_id uuid, p_status text)
returns public.location_claims
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare c public.location_claims;
begin
  if not public.is_platform_owner_session() then raise exception 'Platform owner access required'; end if;
  if lower(coalesce(p_status,'')) not in ('approved','rejected') then raise exception 'Status must be approved or rejected'; end if;
  select * into c from public.location_claims where id=p_claim_id for update;
  if not found then raise exception 'Location claim not found'; end if;
  update public.location_claims set status=lower(p_status),updated_at=now() where id=p_claim_id returning * into c;
  if c.status='approved' then
    update public.locations
    set business_id=c.business_id, claimed_business_id=c.business_id, updated_at=now()
    where id=c.location_id
      and (business_id is null or business_id=c.business_id)
      and (claimed_business_id is null or claimed_business_id=c.business_id);
    if not found then raise exception 'Location is managed by another business'; end if;
  end if;
  return c;
end;
$function$;

revoke all on function public.admin_resolve_location_claim(uuid,text) from public;
grant execute on function public.admin_resolve_location_claim(uuid,text) to authenticated, service_role;
