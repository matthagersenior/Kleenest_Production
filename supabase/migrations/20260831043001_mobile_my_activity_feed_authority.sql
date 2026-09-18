create or replace function public.my_activity_feed(p_limit integer default 40)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit,40),1),100);
  v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  with events as (
    select 'checkin'::text as kind, ci.id as event_id, ci.location_id, ci.checked_in_at as created_at,
      jsonb_build_object('verification_method',ci.verification_method,'distance_meters',ci.distance_meters,'points_awarded',ci.points_awarded,'verified',true) as payload
    from public.check_ins ci where ci.user_id=v_user
    union all
    select 'review'::text, r.id, r.location_id, r.created_at,
      jsonb_build_object('stars',r.stars,'cleanliness_pct',r.cleanliness_pct,'comment',r.comment,'status',r.status::text,'verified',r.check_in_id is not null,'check_in_id',r.check_in_id)
    from public.reviews r where r.user_id=v_user
    union all
    select 'social'::text, sa.id, sa.location_id, sa.created_at,
      jsonb_build_object('activity_type',sa.activity_type,'metadata',coalesce(sa.metadata,'{}'::jsonb),'actor_user_id',sa.actor_user_id,'user_id',sa.user_id)
    from public.social_activity sa where sa.user_id=v_user or sa.actor_user_id=v_user
  ), limited as (
    select e.* from events e order by e.created_at desc limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.kind||':'||l.event_id::text,
    'kind',l.kind,
    'event_id',l.event_id,
    'location_id',l.location_id,
    'location_name',loc.name,
    'created_at',l.created_at,
    'payload',l.payload
  ) order by l.created_at desc),'[]'::jsonb)
  into v_result
  from limited l left join public.locations loc on loc.id=l.location_id;

  return v_result;
end;
$$;

revoke all on function public.my_activity_feed(integer) from public, anon;
grant execute on function public.my_activity_feed(integer) to authenticated;
revoke select, references, trigger on table public.social_activity from anon;
