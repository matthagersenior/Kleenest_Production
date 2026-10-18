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
