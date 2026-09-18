alter table public.restroom_observations add column if not exists photo_id uuid references public.location_photos(id) on delete set null;

create or replace function public.submit_restroom_observation_with_photo(
  p_location_id uuid,
  p_check_in_id uuid,
  p_observation_type text,
  p_cleanliness_pct numeric default null,
  p_note text default null,
  p_photo_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
  v_observation_id uuid;
  v_photo_location uuid;
  v_photo_user uuid;
begin
  if v_user is null then raise exception 'Sign in to contribute an observation.'; end if;
  if p_photo_id is not null then
    select lp.location_id, lp.user_id into v_photo_location, v_photo_user
    from public.location_photos lp where lp.id = p_photo_id;
    if v_photo_location is null or v_photo_user <> v_user or v_photo_location <> p_location_id then
      raise exception 'Photo evidence does not belong to this user and canonical location.';
    end if;
  end if;

  v_result := public.submit_restroom_observation(p_location_id, p_check_in_id, p_observation_type, p_cleanliness_pct, p_note);
  v_observation_id := nullif(v_result->>'observation_id','')::uuid;

  if p_photo_id is not null and v_observation_id is not null then
    update public.restroom_observations
    set photo_id = p_photo_id
    where id = v_observation_id and user_id = v_user;
    v_result := v_result || jsonb_build_object('photo_id', p_photo_id);
  end if;
  return v_result;
end;
$$;

revoke all on function public.submit_restroom_observation_with_photo(uuid,uuid,text,numeric,text,uuid) from public, anon;
grant execute on function public.submit_restroom_observation_with_photo(uuid,uuid,text,numeric,text,uuid) to authenticated, service_role;

create index if not exists restroom_observations_photo_id_idx on public.restroom_observations(photo_id) where photo_id is not null;
