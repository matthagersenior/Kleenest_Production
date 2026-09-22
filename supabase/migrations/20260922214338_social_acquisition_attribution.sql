-- First-party social/profile/QR acquisition attribution for the public Installation Center.
-- Stores coarse campaign metadata only: no IP address, precise location, full referrer URL, or raw user agent.

create table if not exists public.acquisition_attribution_events(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_key text not null,
  event_name text not null check(event_name in(
    'landing_view','install_intent','install_success','apk_download',
    'continue_guest','signup_intent','signin_intent','open_app','share'
  )),
  utm_source text not null default 'direct',
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer_host text,
  landing_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists acquisition_attribution_created_idx
  on public.acquisition_attribution_events(created_at desc);
create index if not exists acquisition_attribution_source_idx
  on public.acquisition_attribution_events(utm_source,utm_medium,created_at desc);
create index if not exists acquisition_attribution_campaign_idx
  on public.acquisition_attribution_events(utm_campaign,utm_content,created_at desc);
create index if not exists acquisition_attribution_session_idx
  on public.acquisition_attribution_events(session_key,created_at desc);

alter table public.acquisition_attribution_events enable row level security;
revoke all on table public.acquisition_attribution_events from public,anon,authenticated;

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

revoke all on function public.record_acquisition_attribution_event(text,text,text,text,text,text,text,text,text,jsonb) from public;
grant execute on function public.record_acquisition_attribution_event(text,text,text,text,text,text,text,text,text,jsonb) to anon,authenticated,service_role;

create or replace function public.owner_acquisition_attribution_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_days integer:=greatest(1,least(coalesce(p_days,30),366));
  v_since timestamptz:=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),366)));
  v_result jsonb;
begin
  if not public.is_platform_owner_session() then
    raise exception 'Platform owner access required' using errcode='42501';
  end if;

  with filtered as(
    select *
    from public.acquisition_attribution_events
    where created_at>=v_since
  ),
  totals as(
    select
      count(*) filter(where event_name='landing_view') landing_views,
      count(distinct session_key) filter(where event_name='landing_view') unique_visitors,
      count(*) filter(where event_name='install_intent') install_intents,
      count(*) filter(where event_name='install_success') install_successes,
      count(*) filter(where event_name='apk_download') apk_downloads,
      count(*) filter(where event_name='continue_guest') guest_entries,
      count(*) filter(where event_name='signup_intent') signup_intents,
      count(*) filter(where event_name='signin_intent') signin_intents,
      count(*) filter(where event_name='open_app') open_app,
      count(*) filter(where event_name='share') shares
    from filtered
  ),
  source_rows as(
    select
      utm_source,
      coalesce(utm_medium,'') utm_medium,
      count(*) filter(where event_name='landing_view') landing_views,
      count(distinct session_key) filter(where event_name='landing_view') unique_visitors,
      count(*) filter(where event_name='install_intent') install_intents,
      count(*) filter(where event_name='install_success') install_successes,
      count(*) filter(where event_name='apk_download') apk_downloads,
      count(*) filter(where event_name='continue_guest') guest_entries,
      count(*) filter(where event_name='signup_intent') signup_intents,
      max(created_at) last_event_at
    from filtered
    group by utm_source,coalesce(utm_medium,'')
  ),
  content_rows as(
    select
      utm_source,
      coalesce(utm_campaign,'') utm_campaign,
      coalesce(utm_content,'') utm_content,
      count(*) filter(where event_name='landing_view') landing_views,
      count(distinct session_key) filter(where event_name='landing_view') unique_visitors,
      count(*) filter(where event_name='install_intent') install_intents,
      count(*) filter(where event_name='install_success') install_successes,
      count(*) filter(where event_name='apk_download') apk_downloads,
      max(created_at) last_event_at
    from filtered
    where utm_campaign is not null or utm_content is not null
    group by utm_source,coalesce(utm_campaign,''),coalesce(utm_content,'')
  )
  select jsonb_build_object(
    'days',v_days,
    'since',v_since,
    'totals',(select jsonb_build_object(
      'landing_views',landing_views,
      'unique_visitors',unique_visitors,
      'install_intents',install_intents,
      'install_successes',install_successes,
      'apk_downloads',apk_downloads,
      'guest_entries',guest_entries,
      'signup_intents',signup_intents,
      'signin_intents',signin_intents,
      'open_app',open_app,
      'shares',shares,
      'install_intent_rate',case when landing_views>0 then round((100.0*install_intents/landing_views)::numeric,1) else null end
    ) from totals),
    'by_source',coalesce((select jsonb_agg(jsonb_build_object(
      'utm_source',s.utm_source,
      'utm_medium',nullif(s.utm_medium,''),
      'landing_views',s.landing_views,
      'unique_visitors',s.unique_visitors,
      'install_intents',s.install_intents,
      'install_successes',s.install_successes,
      'apk_downloads',s.apk_downloads,
      'guest_entries',s.guest_entries,
      'signup_intents',s.signup_intents,
      'install_intent_rate',case when s.landing_views>0 then round((100.0*s.install_intents/s.landing_views)::numeric,1) else null end,
      'last_event_at',s.last_event_at
    ) order by s.landing_views desc,s.utm_source) from source_rows s),'[]'::jsonb),
    'by_content',coalesce((select jsonb_agg(jsonb_build_object(
      'utm_source',c.utm_source,
      'utm_campaign',nullif(c.utm_campaign,''),
      'utm_content',nullif(c.utm_content,''),
      'landing_views',c.landing_views,
      'unique_visitors',c.unique_visitors,
      'install_intents',c.install_intents,
      'install_successes',c.install_successes,
      'apk_downloads',c.apk_downloads,
      'install_intent_rate',case when c.landing_views>0 then round((100.0*c.install_intents/c.landing_views)::numeric,1) else null end,
      'last_event_at',c.last_event_at
    ) order by c.landing_views desc,c.utm_source,c.utm_content) from content_rows c),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.owner_acquisition_attribution_summary(integer) from public;
grant execute on function public.owner_acquisition_attribution_summary(integer) to authenticated,service_role;
