create table if not exists public.consumer_feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null
    check (event_name in ('tell_kleenest_open','pulse_response','feedback_detail_opened','feedback_submitted')),
  route text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists consumer_feedback_events_created_idx
  on public.consumer_feedback_events(created_at desc);
create index if not exists consumer_feedback_events_user_created_idx
  on public.consumer_feedback_events(user_id,created_at desc);
create index if not exists consumer_feedback_events_name_created_idx
  on public.consumer_feedback_events(event_name,created_at desc);

alter table public.consumer_feedback_events enable row level security;
revoke all on table public.consumer_feedback_events from public,anon,authenticated;

create or replace function public.record_consumer_feedback_event(
  p_event_name text,
  p_route text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event text := lower(trim(coalesce(p_event_name,'')));
  v_route text := nullif(left(trim(coalesce(p_route,'')),500),'');
  v_metadata jsonb := case
    when jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))='object' then coalesce(p_metadata,'{}'::jsonb)
    else '{}'::jsonb
  end;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'CONSUMER_FEEDBACK_AUTH_REQUIRED' using errcode='42501';
  end if;

  if v_event not in ('tell_kleenest_open','pulse_response','feedback_detail_opened','feedback_submitted') then
    raise exception 'CONSUMER_FEEDBACK_EVENT_INVALID';
  end if;

  if (
    select count(*)
    from public.consumer_feedback_events e
    where e.user_id=v_uid
      and e.created_at > now()-interval '1 minute'
  ) >= 30 then
    raise exception 'CONSUMER_FEEDBACK_RATE_LIMIT' using errcode='42901';
  end if;

  insert into public.consumer_feedback_events(user_id,event_name,route,metadata)
  values(v_uid,v_event,v_route,v_metadata)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_consumer_feedback_event(text,text,jsonb) from public,anon;
grant execute on function public.record_consumer_feedback_event(text,text,jsonb) to authenticated;

create or replace function public.owner_consumer_feedback_summary(
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1,least(coalesce(p_days,30),366));
  v_since timestamptz := now()-(greatest(1,least(coalesce(p_days,30),366))||' days')::interval;
  v_opens bigint;
  v_open_users bigint;
  v_responses bigint;
  v_response_users bigint;
  v_detail_users bigint;
  v_submissions bigint;
  v_submit_users bigint;
begin
  if not public.is_platform_owner_session() then
    raise exception 'Platform owner access required' using errcode='42501';
  end if;

  select
    count(*) filter (where event_name='tell_kleenest_open'),
    count(distinct user_id) filter (where event_name='tell_kleenest_open'),
    count(*) filter (where event_name='pulse_response'),
    count(distinct user_id) filter (where event_name='pulse_response'),
    count(distinct user_id) filter (where event_name='feedback_detail_opened'),
    count(*) filter (where event_name='feedback_submitted'),
    count(distinct user_id) filter (where event_name='feedback_submitted')
  into
    v_opens,v_open_users,v_responses,v_response_users,v_detail_users,v_submissions,v_submit_users
  from public.consumer_feedback_events
  where created_at>=v_since;

  return jsonb_build_object(
    'days',v_days,
    'since',v_since,
    'opens',v_opens,
    'unique_openers',v_open_users,
    'pulse_responses',v_responses,
    'unique_responders',v_response_users,
    'unique_detail_openers',v_detail_users,
    'submissions',v_submissions,
    'unique_submitters',v_submit_users,
    'open_to_pulse_rate',case when v_open_users>0 then round(v_response_users::numeric/v_open_users::numeric,4) else 0 end,
    'open_to_submit_rate',case when v_open_users>0 then round(v_submit_users::numeric/v_open_users::numeric,4) else 0 end,
    'metric_note','Feedback participation is tracked separately from MAU so survey clicks do not inflate product activity.'
  );
end;
$$;

revoke all on function public.owner_consumer_feedback_summary(integer) from public,anon;
grant execute on function public.owner_consumer_feedback_summary(integer) to authenticated,service_role;
