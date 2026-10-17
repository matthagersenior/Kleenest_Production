
-- Guest journey analytics: anonymous session accountability without device fingerprinting.
create table if not exists private.guest_journey_events (
 id bigint generated always as identity primary key,
 session_id text not null,
 visitor_key text not null,
 event_name text not null,
 location_id uuid,
 context jsonb not null default '{}'::jsonb,
 occurred_at timestamptz not null default now(),
 constraint guest_event_names check (event_name in (
  'landing_view','install_intent','install_success','apk_download','continue_guest',
  'signup_intent','signin_intent','open_app','share',
  'app_open','nearby_results_shown','discovery_intent_applied','place_selected',
  'navigation_started','arrival_detected','review_started','review_submit_attempt',
  'review_submit_success','review_submit_failed','review_photo_added','review_done',
  'search_failed','no_results'
 )),
 constraint guest_event_session check (session_id ~ '^[a-zA-Z0-9-]{20,80}$'),
 constraint guest_event_visitor check (visitor_key ~ '^[a-zA-Z0-9-]{18,140}$')
);
create index if not exists guest_journey_events_occurred_idx on private.guest_journey_events(occurred_at desc);
create index if not exists guest_journey_events_session_idx on private.guest_journey_events(session_id,occurred_at desc);
create index if not exists guest_journey_events_visitor_idx on private.guest_journey_events(visitor_key,occurred_at desc);

create table if not exists private.guest_journey_conversions (
 visitor_key text primary key,
 user_id uuid not null,
 converted_at timestamptz not null default now()
);
create index if not exists guest_journey_conversions_time_idx on private.guest_journey_conversions(converted_at);
create table if not exists private.guest_journey_housekeeping (
 singleton boolean primary key default true check(singleton),
 last_pruned_at timestamptz not null default now()
);
insert into private.guest_journey_housekeeping(singleton) values (true) on conflict do nothing;

create or replace function public.record_guest_journey_event(
 p_session_id text, p_visitor_key text, p_event_name text,
 p_location_id uuid default null, p_context jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path='' as $function$
declare
 v_name text := lower(trim(coalesce(p_event_name,'')));
 v_context jsonb := case when jsonb_typeof(p_context)='object' then p_context else '{}'::jsonb end;
 v_uid uuid:= auth.uid();
begin
 -- Never treat a registered account as a guest.
 if v_uid is not null and exists (
  select 1 from auth.users u where u.id=v_uid and not coalesce(u.is_anonymous,false)
 ) then return; end if;
 if p_session_id is null or p_session_id !~ '^[a-zA-Z0-9-]{20,80}$'
    or p_visitor_key is null or p_visitor_key !~ '^[a-zA-Z0-9-]{18,140}$'
 then raise exception 'GUEST_JOURNEY_ID_INVALID'; end if;
 if v_name not in (
  'landing_view','install_intent','install_success','apk_download','continue_guest',
  'signup_intent','signin_intent','open_app','share',
  'app_open','nearby_results_shown','discovery_intent_applied','place_selected',
  'navigation_started','arrival_detected','review_started','review_submit_attempt',
  'review_submit_success','review_submit_failed','review_photo_added','review_done',
  'search_failed','no_results'
 ) then raise exception 'GUEST_JOURNEY_EVENT_INVALID'; end if;
 -- Bound misbehaving clients and limit personally sensitive telemetry.
 if (select count(*) from private.guest_journey_events
      where session_id=p_session_id and occurred_at>now()-interval '1 minute')>=90
 then return; end if;
 insert into private.guest_journey_events(session_id,visitor_key,event_name,location_id,context)
 values(p_session_id,p_visitor_key,v_name,p_location_id,
  jsonb_strip_nulls(jsonb_build_object(
   'surface', nullif(left(coalesce(v_context->>'surface',''),32),''),
   'source',nullif(left(coalesce(v_context->>'source',''),50),''),
   'method',nullif(left(coalesce(v_context->>'method',''),32),''),
   'device_kind',nullif(left(coalesce(v_context->>'device_kind',''),24),''),
   'browser_kind',nullif(left(coalesce(v_context->>'browser_kind',''),24),''),
   'result_count',case when v_context->>'resultCount' ~ '^[0-9]{1,7}$'
       then least((v_context->>'resultCount')::integer,100000) else null end,
   'search_present',case when v_context ? 'search' then
    (v_context->>'search' not in ('','false','null')) else null end
  ))
 );
 -- Self-maintenance once per day when events arrive; no new cron/Resend traffic.
 update private.guest_journey_housekeeping set last_pruned_at=now()
 where singleton=true and last_pruned_at<now()-interval '1 day';
 if found then
  delete from private.guest_journey_events where occurred_at<now()-interval '30 days';
  delete from private.guest_journey_conversions where converted_at<now()-interval '30 days';
 end if;
end $function$;

create or replace function public.link_guest_journey_registration(p_visitor_key text)
returns boolean language plpgsql security definer set search_path='' as $function$
declare v_user uuid:=auth.uid();v_created timestamptz;
begin
 if v_user is null or p_visitor_key is null or p_visitor_key !~ '^[a-zA-Z0-9-]{18,140}$' then return false;end if;
 select created_at into v_created from auth.users
 where id=v_user and not coalesce(is_anonymous,false) and deleted_at is null;
 if v_created is null or v_created<now()-interval '7 days' then return false; end if;
 if not exists (
  select 1 from private.guest_journey_events e
  where e.visitor_key=p_visitor_key and e.occurred_at<=v_created and e.occurred_at>=v_created-interval '7 days'
 ) then return false;end if;
 insert into private.guest_journey_conversions(visitor_key,user_id)
 values(p_visitor_key,v_user) on conflict(visitor_key) do nothing;
 return true;
end $function$;

create or replace function private.owner_guest_journey_snapshot(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_days integer:=case when p_days=30 then 30 else 7 end;
 v_since timestamptz:=now() - make_interval(days=>case when p_days=30 then 30 else 7 end);
begin
 if auth.uid() is null or not public.is_platform_owner_session()
 then raise exception 'platform owner access required';end if;
 return jsonb_build_object(
  'updated_at',now(),'days',v_days,
  'tracked_events',(select count(*) from private.guest_journey_events where occurred_at>=v_since),
  'tracked_sessions',(select count(distinct session_id) from private.guest_journey_events where occurred_at>=v_since),
  'approximate_visitors',(select count(distinct visitor_key) from private.guest_journey_events where occurred_at>=v_since),
  'engaged_sessions',(select count(distinct session_id) from private.guest_journey_events where occurred_at>=v_since and event_name in ('place_selected','navigation_started','review_started')),
  'navigation_sessions',(select count(distinct session_id) from private.guest_journey_events where occurred_at>=v_since and event_name='navigation_started'),
  'zero_result_sessions',(select count(distinct session_id) from private.guest_journey_events where occurred_at>=v_since and (event_name='no_results' or (event_name='nearby_results_shown' and context->>'result_count'='0'))),
  'returning_visitors',(select count(*) from (
     select visitor_key from private.guest_journey_events
     where occurred_at>=v_since group by visitor_key having count(distinct session_id)>1
   ) visitors),
  'registrations_linked',(select count(*) from private.guest_journey_conversions where converted_at>=v_since),
  'historical_guest_sessions',(select count(*) from private.user_tally_guest_activity where last_seen_at>=v_since),
  'acquisition_events',(select coalesce(jsonb_agg(jsonb_build_object('event_name',event_name,'events',events) order by events desc),'[]'::jsonb)
     from(select event_name,count(*) events from public.acquisition_attribution_events
      where created_at>=v_since group by event_name) a),
  'events_by_type',(select coalesce(jsonb_agg(jsonb_build_object('event_name',event_name,'events',events) order by events desc),'[]'::jsonb)
     from(select event_name,count(*) events from private.guest_journey_events
      where occurred_at>=v_since group by event_name) a),
  'recent_sessions',(select coalesce(jsonb_agg(jsonb_build_object(
      'session_id',session_id,'visitor_label',left(md5(visitor_key),10),
      'started_at',started_at,'last_seen_at',last_seen_at,
      'event_count',event_count,'last_action',last_action
     ) order by last_seen_at desc),'[]'::jsonb)
   from (select e.session_id,min(e.occurred_at) started_at,max(e.occurred_at) last_seen_at,
         count(*) event_count,(array_agg(e.event_name order by e.occurred_at desc))[1] last_action,
         (array_agg(e.visitor_key order by e.occurred_at desc))[1] visitor_key
         from private.guest_journey_events e where e.occurred_at>=v_since
         group by e.session_id order by last_seen_at desc limit 30) recent)
 );
end $function$;
create or replace function public.owner_guest_journey_snapshot(p_days integer default 7)
returns jsonb language sql stable set search_path='' as $function$
select private.owner_guest_journey_snapshot(p_days);
$function$;

create or replace function private.owner_guest_journey_session(p_session_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
begin
 if auth.uid() is null or not public.is_platform_owner_session()
 then raise exception 'platform owner access required';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'event_name',e.event_name,'occurred_at',e.occurred_at,
   'location_name',l.name,'context',e.context
 ) order by e.occurred_at desc)
 from (select * from private.guest_journey_events where session_id=p_session_id order by occurred_at desc limit 100)e
 left join public.locations l on l.id=e.location_id),'[]'::jsonb);
end $function$;
create or replace function public.owner_guest_journey_session(p_session_id text)
returns jsonb language sql stable set search_path='' as $function$
select private.owner_guest_journey_session(p_session_id);
$function$;

revoke all on function public.record_guest_journey_event(text,text,text,uuid,jsonb) from public;
revoke all on function public.link_guest_journey_registration(text) from public;
revoke all on function public.owner_guest_journey_snapshot(integer) from public;
revoke all on function public.owner_guest_journey_session(text) from public;
grant execute on function public.record_guest_journey_event(text,text,text,uuid,jsonb) to anon,authenticated;
grant execute on function public.link_guest_journey_registration(text) to authenticated;
grant execute on function public.owner_guest_journey_snapshot(integer) to authenticated;
grant execute on function public.owner_guest_journey_session(text) to authenticated;
