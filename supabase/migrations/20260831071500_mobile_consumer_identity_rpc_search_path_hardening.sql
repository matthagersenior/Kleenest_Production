create or replace function public.consumer_evidence_loop_health(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if p_user_id is null then raise exception 'authenticated profile required'; end if;
  if current_user <> 'service_role' and (auth.uid() is null or p_user_id is distinct from auth.uid()) then raise exception 'User identity mismatch'; end if;
  select pg_catalog.jsonb_build_object(
    'check_ins',coalesce((select count(*) from public.check_ins where user_id=p_user_id),0),
    'observations',coalesce((select count(*) from public.location_quality_observations where user_id=p_user_id),0)+coalesce((select count(*) from public.location_amenity_observations where user_id=p_user_id),0),
    'reviews',coalesce((select count(*) from public.reviews where user_id=p_user_id),0),
    'reputation',(select pg_catalog.to_jsonb(r) from public.contributor_reputation r where r.user_id=p_user_id limit 1),
    'loop_complete',exists(select 1 from public.check_ins c where c.user_id=p_user_id) and exists(select 1 from public.reviews r where r.user_id=p_user_id)
  ) into result;
  return result;
end;
$$;

create or replace function public.family_has_premium_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and p_user_id=auth.uid() and exists(
    select 1 from public.family_members fm
    join public.family_accounts fa on fa.id=fm.group_id
    where fm.user_id=p_user_id and fa.plan_code='family'
      and (select count(*) from public.family_members x where x.group_id=fm.group_id)<=5
  );
$$;

create or replace function public.record_favorite_route_event(p_location_id uuid, p_user_id uuid default null, p_from_lat numeric default null, p_from_lng numeric default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_user_id is not null and p_user_id is distinct from v_user then raise exception 'User identity mismatch'; end if;
  insert into public.location_route_events(location_id,user_id,source,from_lat,from_lng)
  values(p_location_id,v_user,'favorite',p_from_lat,p_from_lng)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.record_feature_access(p_feature_code text, p_outcome text, p_tier_code text default null, p_destination text default null, p_metadata jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists(select 1 from public.feature_catalog where feature_code=p_feature_code and enabled) then raise exception 'unknown or disabled feature'; end if;
  if p_outcome not in ('allowed','locked','denied') then raise exception 'invalid feature access outcome'; end if;
  insert into public.feature_access_events(user_id,feature_code,outcome,tier_code,destination,metadata)
  values(auth.uid(),p_feature_code,p_outcome,p_tier_code,p_destination,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.consumer_evidence_loop_health(uuid) from public, anon;
grant execute on function public.consumer_evidence_loop_health(uuid) to authenticated, service_role;
revoke all on function public.family_has_premium_access(uuid) from public, anon;
grant execute on function public.family_has_premium_access(uuid) to authenticated, service_role;
revoke all on function public.record_favorite_route_event(uuid,uuid,numeric,numeric) from public, anon;
grant execute on function public.record_favorite_route_event(uuid,uuid,numeric,numeric) to authenticated, service_role;
revoke all on function public.record_feature_access(text,text,text,text,jsonb) from public, anon;
grant execute on function public.record_feature_access(text,text,text,text,jsonb) to authenticated, service_role;
