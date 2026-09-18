-- Preserve historical badge awards while hiding obvious superseded catalog duplicates.
update public.badges
set criteria = coalesce(criteria,'{}'::jsonb) || jsonb_build_object('catalog_hidden',true,'catalog_status','legacy')
where code in ('first_checkin','first-check-in','first_review','first-review','five_star_reviewer','five-star-reviewer','week_warrior','week-warrior','week-streak','month_master','month-streak','point_collector','point-collector')
  and coalesce((criteria->>'catalog_hidden')::boolean,false)=false;

update public.badges
set criteria = coalesce(criteria,'{}'::jsonb) || jsonb_build_object('catalog_status','canonical')
where code in ('trust-first-visit','trust-regular','trust-road-warrior','review-first-hand','review-field-guide','review-community-trusted','amenity-scout','amenity-auditor','occupancy-scout','occupancy-signal-pro','quest-finisher','quest-veteran','community-connector','trusted-contributor','verified-contributor','streak-seven','streak-thirty','explorer-25','points-1000');

create or replace function public.award_helpful_review_badges(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare
  v_helpful integer:=0;
  v_awarded integer:=0;
  b record;
  v_threshold integer;
  v_reward integer;
begin
  if p_user_id is null then return 0; end if;
  select count(*)::integer into v_helpful
  from public.review_likes l
  join public.reviews r on r.id=l.review_id
  where r.user_id=p_user_id and r.status='published';

  for b in
    select * from public.badges
    where criteria->>'type'='helpful_received' or criteria ? 'helpful'
  loop
    v_threshold:=coalesce((b.criteria->>'count')::integer,(b.criteria->>'helpful')::integer,0);
    if v_helpful>=v_threshold and not exists(select 1 from public.user_badges ub where ub.user_id=p_user_id and ub.badge_id=b.id) then
      insert into public.user_badges(user_id,badge_id) values(p_user_id,b.id) on conflict do nothing;
      if found then
        v_awarded:=v_awarded+1;
        v_reward:=greatest(coalesce((b.criteria->>'reward_points')::integer,0),0);
        if v_reward>0 then
          insert into public.point_transactions(user_id,points,reason,reference_id)
          values(p_user_id,v_reward,'badge_reward',b.id)
          on conflict (user_id,reason,reference_id) where reference_id is not null do nothing;
        end if;
      end if;
    end if;
  end loop;
  return v_awarded;
end;
$$;
revoke all on function public.award_helpful_review_badges(uuid) from public,anon,authenticated;

create or replace function public.toggle_review_like(p_review_id uuid)
returns boolean
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare
  liked boolean;
  v_review_owner uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select user_id into v_review_owner from public.reviews where id=p_review_id and status='published';
  if v_review_owner is null then raise exception 'Review not found'; end if;
  if exists(select 1 from public.review_likes where user_id=auth.uid() and review_id=p_review_id) then
    delete from public.review_likes where user_id=auth.uid() and review_id=p_review_id;
    liked:=false;
  else
    insert into public.review_likes(user_id,review_id) values(auth.uid(),p_review_id);
    liked:=true;
    perform public.award_helpful_review_badges(v_review_owner);
  end if;
  return liked;
end;
$$;
revoke execute on function public.toggle_review_like(uuid) from anon;
grant execute on function public.toggle_review_like(uuid) to authenticated;

create or replace function public.get_location_occupancy_trend(p_location_id uuid,p_hours integer default 24,p_bucket_minutes integer default 120)
returns jsonb
language plpgsql
stable security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare
  v_hours integer:=least(greatest(coalesce(p_hours,24),4),72);
  v_bucket integer:=least(greatest(coalesce(p_bucket_minutes,120),30),360);
begin
  if not exists(select 1 from public.locations where id=p_location_id and is_active=true) then
    raise exception 'Canonical location not found or inactive';
  end if;
  return jsonb_build_object(
    'location_id',p_location_id,
    'window_hours',v_hours,
    'bucket_minutes',v_bucket,
    'privacy_rule','minimum_2_distinct_contributors_per_bucket',
    'buckets',(
      with raw as (
        select to_timestamp(floor(extract(epoch from observed_at)/(v_bucket*60))*(v_bucket*60)) at time zone 'UTC' bucket_start,
               user_id,occupancy_count,capacity_count,queue_count,wait_minutes,confidence,observed_at
        from public.location_occupancy_observations
        where location_id=p_location_id and observed_at>=now()-make_interval(hours=>v_hours)
      ), agg as (
        select bucket_start,count(*)::int sample_count,count(distinct user_id)::int contributor_count,
               round(avg(occupancy_count)::numeric,1) occupancy_count,
               round(avg(case when capacity_count>0 then occupancy_count::numeric/capacity_count*100 end)::numeric,1) utilization_pct,
               round(avg(queue_count)::numeric,1) queue_count,
               round(avg(wait_minutes)::numeric,1) wait_minutes,
               round(avg(confidence)::numeric,2) confidence,max(observed_at) freshest_observed_at
        from raw group by bucket_start
        having count(*)>=2 and count(distinct user_id)>=2
      )
      select coalesce(jsonb_agg(to_jsonb(agg) order by bucket_start),'[]'::jsonb) from agg
    )
  );
end;
$$;
grant execute on function public.get_location_occupancy_trend(uuid,integer,integer) to anon,authenticated;

create or replace function public.get_location_trust_conflicts(p_location_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path='public','auth','extensions','pg_temp'
as $$
begin
  if not exists(select 1 from public.locations where id=p_location_id and is_active=true) then
    raise exception 'Canonical location not found or inactive';
  end if;
  return jsonb_build_object(
    'location_id',p_location_id,
    'amenity_conflicts',(
      with recent as (
        select o.amenity_id,o.status,o.observed_quantity,o.observed_at
        from public.location_amenity_observations o
        where o.location_id=p_location_id and o.observed_at>=now()-interval '90 days'
      ), agg as (
        select a.id amenity_id,a.name,a.category,
          count(*) filter(where r.status='present')::int present_count,
          count(*) filter(where r.status='absent')::int absent_count,
          min(r.observed_quantity) filter(where r.status='present') min_quantity,
          max(r.observed_quantity) filter(where r.status='present') max_quantity,
          max(r.observed_at) freshest_observed_at
        from public.amenities a join recent r on r.amenity_id=a.id
        group by a.id,a.name,a.category
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'amenity_id',amenity_id,'name',name,'category',category,
        'present_count',present_count,'absent_count',absent_count,
        'min_quantity',min_quantity,'max_quantity',max_quantity,
        'status_conflict',(present_count>0 and absent_count>0),
        'quantity_conflict',(min_quantity is not null and max_quantity is not null and min_quantity<>max_quantity),
        'freshest_observed_at',freshest_observed_at
      ) order by name),'[]'::jsonb)
      from agg where (present_count>0 and absent_count>0) or (min_quantity is not null and max_quantity is not null and min_quantity<>max_quantity)
    ),
    'generated_at',now()
  );
end;
$$;
grant execute on function public.get_location_trust_conflicts(uuid) to anon,authenticated;
