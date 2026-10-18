-- Add privacy-bounded, distinct PWA installation funnel stages to existing anonymous analytics.
-- Preserve deployed migration identities; extend both RPC allowlists and table checks.

alter table public.acquisition_attribution_events
  drop constraint if exists acquisition_attribution_events_event_name_check;
alter table public.acquisition_attribution_events
  add constraint acquisition_attribution_events_event_name_check check (event_name in (
    'landing_view','install_intent','install_success','apk_download',
    'install_guidance_view','install_prompt_accepted','install_prompt_dismissed','installed_app_launch',
    'continue_guest','signup_intent','signin_intent','open_app','share'
  ));

alter table private.guest_journey_events drop constraint if exists guest_event_names;
alter table private.guest_journey_events
  add constraint guest_event_names check (event_name in (
  'landing_view','install_intent','install_success','apk_download',
  'install_guidance_view','install_prompt_accepted','install_prompt_dismissed','installed_app_launch',
  'continue_guest',
  'signup_intent','signin_intent','open_app','share',
  'app_open','nearby_results_shown','discovery_intent_applied','place_selected',
  'navigation_started','arrival_detected','review_started','review_submit_attempt',
  'review_submit_success','review_submit_failed','review_photo_added','review_done',
  'search_failed','no_results'
 ));

create or replace function public.record_acquisition_attribution_event(
  p_session_key text,
  p_event_name text,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null,
  p_referrer_host text default null,
  p_landing_path text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session_key text:=nullif(left(trim(coalesce(p_session_key,'')),140),'');
  v_event_name text:=lower(trim(coalesce(p_event_name,'')));
  v_source text:=coalesce(nullif(left(lower(trim(coalesce(p_utm_source,''))),80),''),'direct');
  v_medium text:=nullif(left(lower(trim(coalesce(p_utm_medium,''))),80),'');
  v_campaign text:=nullif(left(trim(coalesce(p_utm_campaign,'')),120),'');
  v_content text:=nullif(left(trim(coalesce(p_utm_content,'')),120),'');
  v_term text:=nullif(left(trim(coalesce(p_utm_term,'')),120),'');
  v_referrer text:=nullif(left(lower(trim(coalesce(p_referrer_host,''))),160),'');
  v_path text:=nullif(left(trim(coalesce(p_landing_path,'')),220),'');
  v_metadata jsonb:=case when jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))='object' then coalesce(p_metadata,'{}'::jsonb) else '{}'::jsonb end;
  v_id uuid;
begin
  if v_session_key is null then raise exception 'ACQUISITION_SESSION_REQUIRED'; end if;
  if v_event_name not in(
    'landing_view','install_intent','install_success','apk_download',
    'install_guidance_view','install_prompt_accepted','install_prompt_dismissed','installed_app_launch',
    'continue_guest','signup_intent','signin_intent','open_app','share'
  ) then raise exception 'ACQUISITION_EVENT_INVALID'; end if;

  if (
    select count(*)
    from public.acquisition_attribution_events e
    where e.session_key=v_session_key
      and e.created_at>now()-interval '1 minute'
  )>=60 then
    raise exception 'ACQUISITION_RATE_LIMIT' using errcode='42901';
  end if;

  insert into public.acquisition_attribution_events(
    user_id,session_key,event_name,utm_source,utm_medium,utm_campaign,utm_content,utm_term,
    referrer_host,landing_path,metadata
  ) values(
    auth.uid(),v_session_key,v_event_name,v_source,v_medium,v_campaign,v_content,v_term,
    v_referrer,v_path,v_metadata
  ) returning id into v_id;

  return v_id;
end;
$$;

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
  'landing_view','install_intent','install_success','apk_download',
  'install_guidance_view','install_prompt_accepted','install_prompt_dismissed','installed_app_launch',
  'continue_guest',
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


-- Browser/device counts for KleenestOS, guarded by the existing owner-only RPC.
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
  'install_browser_events',(select coalesce(jsonb_agg(jsonb_build_object(
        'device_kind',device_kind,'browser_kind',browser_kind,'event_name',event_name,
        'events',events) order by events desc),'[]'::jsonb)
    from (
      select left(coalesce(nullif(e.metadata->>'device_kind',''),'unknown'),32) device_kind,
             left(coalesce(nullif(e.metadata->>'browser_kind',''),'unknown'),32) browser_kind,
             e.event_name,count(*) events
      from public.acquisition_attribution_events e
      where e.created_at>=v_since and e.event_name in (
        'install_intent','install_guidance_view','install_prompt_accepted',
        'install_prompt_dismissed','install_success','installed_app_launch'
      )
      group by 1,2,3 order by events desc limit 80
    ) browser_groups),
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
