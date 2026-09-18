insert into public.progression_actions(code,label,points,enabled)
values ('amenity_inventory','Document restroom amenities',5,true)
on conflict (code) do update set label=excluded.label,points=excluded.points,enabled=true;

create or replace function public.award_review_amenity_progression(p_review_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_location_id uuid;
  v_check_in_id uuid;
  v_eligible boolean := false;
  v_observations integer := 0;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_review_id is null then raise exception 'REVIEW_REQUIRED'; end if;

  select r.location_id,
         r.check_in_id,
         coalesce((c.metadata->>'progression_eligible')::boolean,false)
    into v_location_id,v_check_in_id,v_eligible
  from public.reviews r
  join public.check_ins c
    on c.id=r.check_in_id
   and c.user_id=v_uid
   and c.location_id=r.location_id
  where r.id=p_review_id
    and r.user_id=v_uid
    and r.status='published';

  if v_location_id is null or v_check_in_id is null then
    raise exception 'REVIEW_NOT_ELIGIBLE_FOR_AMENITY_PROGRESSION';
  end if;
  if not v_eligible then raise exception 'CHECK_IN_NOT_PROGRESSION_ELIGIBLE'; end if;

  select count(*)::integer into v_observations
  from public.review_amenity_feedback f
  where f.review_id=p_review_id
    and f.location_id=v_location_id;

  if v_observations < 1 then raise exception 'AMENITY_INVENTORY_REQUIRED'; end if;

  v_result := public.record_progression_action('amenity_inventory',p_review_id);
  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'review_id',p_review_id,
    'location_id',v_location_id,
    'check_in_id',v_check_in_id,
    'amenity_observations',v_observations
  );
end;
$function$;

revoke all on function public.award_review_amenity_progression(uuid) from public, anon;
grant execute on function public.award_review_amenity_progression(uuid) to authenticated;
