create or replace function public.my_week_in_review(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_days integer := least(greatest(coalesce(p_days,7),1),30);
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  with visit_rows as (
    select
      v.id as visit_id,
      v.location_id,
      l.name as location_name,
      v.occurred_at as visited_at,
      v.last_seen_at,
      v.departed_at,
      v.verification_expires_at,
      ci.id as check_in_id,
      ci.checked_in_at,
      ci.verification_method,
      coalesce(ci.metadata->>'progression_eligible','false')='true' as progression_eligible,
      r.id as review_id,
      r.created_at as reviewed_at
    from public.location_visits v
    join public.locations l on l.id=v.location_id
    left join lateral (
      select c.id,c.checked_in_at,c.verification_method,c.metadata
      from public.check_ins c
      where c.user_id=v_uid
        and c.location_id=v.location_id
        and (
          c.metadata->>'presence_visit_id'=v.id::text
          or c.checked_in_at between v.occurred_at-interval '15 minutes'
            and coalesce(v.departed_at,v.last_seen_at,v.occurred_at)+interval '15 minutes'
        )
      order by
        case when c.metadata->>'presence_visit_id'=v.id::text then 0 else 1 end,
        c.checked_in_at desc
      limit 1
    ) ci on true
    left join lateral (
      select review.id,review.created_at
      from public.reviews review
      where review.user_id=v_uid
        and review.location_id=v.location_id
        and review.check_in_id=ci.id
      order by review.created_at desc
      limit 1
    ) r on true
    where v.user_id=v_uid
      and v.occurred_at>=now()-make_interval(days=>v_days)
  ), states as (
    select *,
      check_in_id is not null as verified,
      check_in_id is not null and progression_eligible and review_id is null as review_ready,
      check_in_id is null and review_id is null and verification_expires_at>=now() as verification_available
    from visit_rows
  )
  select jsonb_build_object(
    'period_days',v_days,
    'started_at',now()-make_interval(days=>v_days),
    'visit_count',count(*),
    'place_count',count(distinct location_id),
    'verified_visit_count',count(*) filter(where verified),
    'reviewed_count',count(*) filter(where review_id is not null),
    'review_ready_count',count(*) filter(where review_ready),
    'verification_available_count',count(*) filter(where verification_available),
    'visits',coalesce(jsonb_agg(jsonb_build_object(
      'visit_id',visit_id,
      'location_id',location_id,
      'location_name',location_name,
      'visited_at',visited_at,
      'last_seen_at',last_seen_at,
      'departed_at',departed_at,
      'verification_expires_at',verification_expires_at,
      'check_in_id',check_in_id,
      'checked_in_at',checked_in_at,
      'verification_method',verification_method,
      'review_id',review_id,
      'reviewed_at',reviewed_at,
      'verified',verified,
      'review_ready',review_ready,
      'verification_available',verification_available
    ) order by visited_at desc),'[]'::jsonb)
  ) into v_result
  from states;

  return coalesce(v_result,jsonb_build_object(
    'period_days',v_days,'visit_count',0,'place_count',0,'verified_visit_count',0,
    'reviewed_count',0,'review_ready_count',0,'verification_available_count',0,'visits','[]'::jsonb
  ));
end;
$function$;

revoke all on function public.my_week_in_review(integer) from public,anon;
grant execute on function public.my_week_in_review(integer) to authenticated,service_role;

create or replace function internal.notify_location_departure_review_prompt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_visit record;
  v_location_alerts boolean := true;
  v_check_in_id uuid;
  v_checked_in_at timestamptz;
  v_title text := 'You were here — review it?';
  v_body text;
begin
  select
    v.id,
    v.location_id,
    v.occurred_at,
    v.last_seen_at,
    v.departed_at,
    v.verification_expires_at,
    l.name as location_name
  into v_visit
  from public.location_visits v
  join public.locations l on l.id=v.location_id
  where v.user_id=new.user_id
    and v.location_id=new.location_id
    and v.occurred_at<=new.left_at+interval '2 minutes'
  order by v.occurred_at desc
  limit 1;
  if not found then return new; end if;

  select coalesce(np.location_alerts,true)
  into v_location_alerts
  from (select 1) seed
  left join public.notification_preferences np on np.user_id=new.user_id;
  if not coalesce(v_location_alerts,true) then return new; end if;

  if exists(
    select 1 from public.notifications n
    where n.user_id=new.user_id
      and n.type='visit_review_prompt'
      and n.data->>'presence_visit_id'=v_visit.id::text
  ) then return new; end if;

  select c.id,c.checked_in_at
  into v_check_in_id,v_checked_in_at
  from public.check_ins c
  where c.user_id=new.user_id
    and c.location_id=new.location_id
    and coalesce(c.metadata->>'progression_eligible','false')='true'
    and (
      c.metadata->>'presence_visit_id'=v_visit.id::text
      or c.checked_in_at between v_visit.occurred_at-interval '15 minutes'
        and coalesce(v_visit.departed_at,v_visit.last_seen_at,v_visit.occurred_at)+interval '15 minutes'
    )
    and not exists(
      select 1 from public.reviews r
      where r.user_id=new.user_id
        and r.location_id=new.location_id
        and r.check_in_id=c.id
    )
  order by
    case when c.metadata->>'presence_visit_id'=v_visit.id::text then 0 else 1 end,
    c.checked_in_at desc
  limit 1;

  if v_check_in_id is not null then
    v_body:=format('Your visit to %s is verified. Add what you saw while it is still fresh.',v_visit.location_name);
  elsif v_visit.verification_expires_at is not null and v_visit.verification_expires_at>=now() then
    v_body:=format('You were recently at %s. Open it while your on-site presence can still verify the visit, then leave a review.',v_visit.location_name);
  else
    return new;
  end if;

  insert into public.notifications(user_id,type,title,body,data)
  values(
    new.user_id,
    'visit_review_prompt',
    v_title,
    v_body,
    jsonb_build_object(
      'type','visit_review_prompt',
      'location_id',new.location_id,
      'presence_visit_id',v_visit.id,
      'check_in_id',v_check_in_id,
      'checked_in_at',v_checked_in_at,
      'verification_expires_at',v_visit.verification_expires_at,
      'review_state',case when v_check_in_id is not null then 'verified' else 'verification_available' end,
      'destination','/location/'||new.location_id::text,
      'web_destination','/location/'||new.location_id::text
    )
  );
  return new;
end;
$function$;

revoke all on function internal.notify_location_departure_review_prompt() from public,anon,authenticated;

drop trigger if exists location_departures_review_prompt on public.location_departures;
create trigger location_departures_review_prompt
after insert on public.location_departures
for each row execute function internal.notify_location_departure_review_prompt();

create or replace function internal.enqueue_week_in_review_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_inserted integer := 0;
begin
  with candidate_users as (
    select distinct v.user_id
    from public.location_visits v
    where v.occurred_at>=now()-interval '7 days'
  ), summaries as (
    select
      u.user_id,
      to_char(timezone('UTC',now()),'IYYY-IW') as week_key,
      (select count(*) from public.location_visits v where v.user_id=u.user_id and v.occurred_at>=now()-interval '7 days')::integer as visit_count,
      (select count(distinct v.location_id) from public.location_visits v where v.user_id=u.user_id and v.occurred_at>=now()-interval '7 days')::integer as place_count,
      (select count(*) from public.check_ins c where c.user_id=u.user_id and c.checked_in_at>=now()-interval '7 days')::integer as verified_visit_count,
      (select count(*) from public.reviews r where r.user_id=u.user_id and r.created_at>=now()-interval '7 days')::integer as review_count,
      (select count(*)
       from public.check_ins c
       where c.user_id=u.user_id
         and c.checked_in_at>=now()-interval '7 days'
         and coalesce(c.metadata->>'progression_eligible','false')='true'
         and not exists(select 1 from public.reviews r where r.user_id=u.user_id and r.location_id=c.location_id and r.check_in_id=c.id)
      )::integer as review_ready_count
    from candidate_users u
  )
  insert into public.notifications(user_id,type,title,body,data)
  select
    s.user_id,
    'weekly_review_digest',
    'Your week in Kleenest',
    format(
      'Your week: %s place%s · %s verified visit%s · %s review%s.%s',
      s.place_count,case when s.place_count=1 then '' else 's' end,
      s.verified_visit_count,case when s.verified_visit_count=1 then '' else 's' end,
      s.review_count,case when s.review_count=1 then '' else 's' end,
      case when s.review_ready_count>0
        then format(' %s verified visit%s still %s a review.',s.review_ready_count,case when s.review_ready_count=1 then '' else 's' end,case when s.review_ready_count=1 then 'needs' else 'need' end)
        else ' You are caught up.' end
    ),
    jsonb_build_object(
      'type','weekly_review_digest',
      'week_key',s.week_key,
      'period_days',7,
      'visit_count',s.visit_count,
      'place_count',s.place_count,
      'verified_visit_count',s.verified_visit_count,
      'review_count',s.review_count,
      'review_ready_count',s.review_ready_count,
      'destination','/week-in-review',
      'web_destination','/week-in-review'
    )
  from summaries s
  left join public.notification_preferences np on np.user_id=s.user_id
  where coalesce(np.location_alerts,true)
    and not exists(
      select 1 from public.notifications n
      where n.user_id=s.user_id
        and n.type='weekly_review_digest'
        and n.data->>'week_key'=s.week_key
    );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

revoke all on function internal.enqueue_week_in_review_notifications() from public,anon,authenticated;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='consumer-week-in-review' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
end $$;

select cron.schedule(
  'consumer-week-in-review',
  '0 15 * * 1',
  $cron$
    select internal.enqueue_week_in_review_notifications();
  $cron$
);
