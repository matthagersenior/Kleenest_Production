-- Creator-specific STL social campaign missions.
-- Missions are seeded as DRAFT only. The platform owner must explicitly activate them in KleenestOS.

create table if not exists public.creator_mission_attribution_events(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  creator_slug text not null,
  mission_code text not null,
  tracking_slug text not null,
  event_name text not null check(event_name in('landing_view','open_app','install_intent','share')),
  channel text not null default 'social',
  session_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creator_mission_attribution_created_idx
  on public.creator_mission_attribution_events(created_at desc);
create index if not exists creator_mission_attribution_creator_idx
  on public.creator_mission_attribution_events(creator_slug,mission_code,created_at desc);
create index if not exists creator_mission_attribution_tracking_idx
  on public.creator_mission_attribution_events(tracking_slug,event_name,created_at desc);

alter table public.creator_mission_attribution_events enable row level security;
revoke all on table public.creator_mission_attribution_events from public,anon,authenticated;

insert into public.progression_objectives_v2(kind,code,title,description,status,starts_at,ends_at,rules,rewards,scope)
values
('mission','creator-alexis-family-outing','The Parent Panic Test',
 'Use Kleenest during a real family outing, find a family-appropriate restroom, confirm useful details, navigate there, and leave one legitimate freshness update.',
 'draft',null,null,
 '{"action":"verify_location","target":1,"mechanic":"creator_mission","tracking_slug":"alexis-family-outing","creator_slug":"alexis-zotos"}'::jsonb,
 '{"xp":175}'::jsonb,
 '{"audience":"consumer","campaign_code":"kleenest-stl-creators-2026","creator_mission":true,"creator_name":"Alexis Zotos","creator_handle":"@alexiszotos","creator_slug":"alexis-zotos","tracking_slug":"alexis-family-outing","owner_activation_required":true}'::jsonb),
('mission','creator-steph-park-scout','STL Park Scout Challenge',
 'Visit three parks and improve the restroom information families need before leaving home.',
 'draft',null,null,
 '{"action":"verify_location","target":3,"mechanic":"creator_mission","tracking_slug":"steph-park-scout","creator_slug":"steph-hampton"}'::jsonb,
 '{"xp":350}'::jsonb,
 '{"audience":"consumer","campaign_code":"kleenest-stl-creators-2026","creator_mission":true,"creator_name":"Steph Hampton","creator_handle":"@explorestlparks","creator_slug":"steph-hampton","tracking_slug":"steph-park-scout","owner_activation_required":true}'::jsonb),
('mission','creator-sara-road-trip','Road Trip Without Guessing',
 'Plan restroom stops on a real family road trip, use the plan on the road, and refresh the network after the stops.',
 'draft',null,null,
 '{"action":"reverify_stale","target":2,"mechanic":"creator_mission","tracking_slug":"sara-road-trip","creator_slug":"sara-midwest-nomad"}'::jsonb,
 '{"xp":300}'::jsonb,
 '{"audience":"consumer","campaign_code":"kleenest-stl-creators-2026","creator_mission":true,"creator_name":"Sara / Midwest Nomad Family","creator_handle":"@midwestnomadfamily","creator_slug":"sara-midwest-nomad","tracking_slug":"sara-road-trip","owner_activation_required":true}'::jsonb),
('mission','creator-abbey-neighborhood-scout','Neighborhood Bathroom Scout',
 'Choose one STL neighborhood and improve three places families actually use.',
 'draft',null,null,
 '{"action":"helpful_contribution","target":3,"mechanic":"creator_mission","tracking_slug":"abbey-neighborhood-scout","creator_slug":"abbey-normal"}'::jsonb,
 '{"xp":325}'::jsonb,
 '{"audience":"consumer","campaign_code":"kleenest-stl-creators-2026","creator_mission":true,"creator_name":"Abbey / The Abbey Normal Blog","creator_handle":"@theabbeynormalblog","creator_slug":"abbey-normal","tracking_slug":"abbey-neighborhood-scout","owner_activation_required":true}'::jsonb),
('mission','creator-mikayla-weekend-ready','STL Night-Out Backup Plan',
 'Make restroom planning part of a real STL night-out checklist and test the plan during the outing.',
 'draft',null,null,
 '{"action":"discover_gps","target":2,"mechanic":"creator_mission","tracking_slug":"mikayla-weekend-ready","creator_slug":"mikayla-isabelle"}'::jsonb,
 '{"xp":200}'::jsonb,
 '{"audience":"consumer","campaign_code":"kleenest-stl-creators-2026","creator_mission":true,"creator_name":"Mikayla Isabelle","creator_handle":"@mikayla.isabelle","creator_slug":"mikayla-isabelle","tracking_slug":"mikayla-weekend-ready","owner_activation_required":true}'::jsonb),
('mission','creator-braden-kleenest-stop','The Kleenest Stop',
 'Feature a local business and show how restroom quality fits the customer experience without turning the piece into a cleanliness takedown.',
 'draft',null,null,
 '{"action":"substantive_review","target":1,"mechanic":"creator_mission","tracking_slug":"braden-kleenest-stop","creator_slug":"braden-tewolde"}'::jsonb,
 '{"xp":225}'::jsonb,
 '{"audience":"consumer","campaign_code":"kleenest-stl-creators-2026","creator_mission":true,"creator_name":"Braden Tewolde","creator_handle":"@BradENSTL","creator_slug":"braden-tewolde","tracking_slug":"braden-kleenest-stop","owner_activation_required":true}'::jsonb),
('campaign','creator-stl-bucket-list-weekend-map','The Kleenest STL Weekend Map',
 'Create an editorial-style event guide that makes Kleenest useful before people leave home.',
 'draft',null,null,
 '{"action":"helpful_contribution","target":3,"mechanic":"creator_mission","tracking_slug":"stl-bucket-list-weekend-map","creator_slug":"stl-bucket-list"}'::jsonb,
 '{"xp":350}'::jsonb,
 '{"audience":"consumer","campaign_code":"kleenest-stl-creators-2026","creator_mission":true,"creator_name":"STL Bucket List","creator_handle":"@stlbucketlist","creator_slug":"stl-bucket-list","tracking_slug":"stl-bucket-list-weekend-map","owner_activation_required":true}'::jsonb),
('mission','creator-amy-real-stl-day','One Real STL Day',
 'Work Kleenest naturally into a normal STL day instead of building the entire day around the app.',
 'draft',null,null,
 '{"action":"verify_location","target":1,"mechanic":"creator_mission","tracking_slug":"amy-real-stl-day","creator_slug":"amy-funderburk"}'::jsonb,
 '{"xp":175}'::jsonb,
 '{"audience":"consumer","campaign_code":"kleenest-stl-creators-2026","creator_mission":true,"creator_name":"Amy Funderburk","creator_handle":"@amyfunderburk","creator_slug":"amy-funderburk","tracking_slug":"amy-real-stl-day","owner_activation_required":true}'::jsonb),
('mission','creator-kelly-road-trip-prep','Family Road-Trip Prep',
 'Add restroom planning to the same practical pre-drive checklist as fuel, snacks, chargers, and car-seat setup.',
 'draft',null,null,
 '{"action":"discover_gps","target":2,"mechanic":"creator_mission","tracking_slug":"kelly-road-trip-prep","creator_slug":"kelly-stumpe"}'::jsonb,
 '{"xp":225}'::jsonb,
 '{"audience":"consumer","campaign_code":"kleenest-stl-creators-2026","creator_mission":true,"creator_name":"Kelly Stumpe / The Car Mom","creator_handle":"@the_car_mom","creator_slug":"kelly-stumpe","tracking_slug":"kelly-road-trip-prep","owner_activation_required":true}'::jsonb)
on conflict(code) do update set
  title=excluded.title,
  description=excluded.description,
  rules=excluded.rules,
  rewards=excluded.rewards,
  scope=excluded.scope;

create or replace function public.record_creator_mission_attribution(
  p_tracking_slug text,
  p_event_name text,
  p_channel text default 'social',
  p_session_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tracking_slug text:=lower(trim(coalesce(p_tracking_slug,'')));
  v_event_name text:=lower(trim(coalesce(p_event_name,'')));
  v_channel text:=left(lower(trim(coalesce(p_channel,'social'))),40);
  v_session_key text:=nullif(left(trim(coalesce(p_session_key,'')),120),'');
  v_metadata jsonb:=case when jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))='object' then coalesce(p_metadata,'{}'::jsonb) else '{}'::jsonb end;
  v_creator_slug text;
  v_mission_code text;
  v_id uuid;
begin
  if v_tracking_slug='' then raise exception 'CREATOR_TRACKING_SLUG_REQUIRED'; end if;
  if v_event_name not in('landing_view','open_app','install_intent','share') then raise exception 'CREATOR_TRACKING_EVENT_INVALID'; end if;

  select o.scope->>'creator_slug',o.code
    into v_creator_slug,v_mission_code
  from public.progression_objectives_v2 o
  where o.scope->>'campaign_code'='kleenest-stl-creators-2026'
    and o.scope->>'tracking_slug'=v_tracking_slug
  limit 1;

  if v_mission_code is null then raise exception 'CREATOR_TRACKING_MISSION_NOT_FOUND'; end if;

  if v_session_key is not null and (
    select count(*)
    from public.creator_mission_attribution_events e
    where e.session_key=v_session_key and e.created_at>now()-interval '1 minute'
  )>=20 then
    raise exception 'CREATOR_TRACKING_RATE_LIMIT' using errcode='42901';
  end if;

  insert into public.creator_mission_attribution_events(
    user_id,creator_slug,mission_code,tracking_slug,event_name,channel,session_key,metadata
  ) values(
    auth.uid(),v_creator_slug,v_mission_code,v_tracking_slug,v_event_name,
    coalesce(nullif(v_channel,''),'social'),v_session_key,v_metadata
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_creator_mission_attribution(text,text,text,text,jsonb) from public;
grant execute on function public.record_creator_mission_attribution(text,text,text,text,jsonb) to anon,authenticated,service_role;

create or replace function public.owner_creator_mission_attribution_summary(p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_days integer:=greatest(1,least(coalesce(p_days,90),366));
  v_since timestamptz:=now()-make_interval(days=>greatest(1,least(coalesce(p_days,90),366)));
  v_result jsonb;
begin
  if not public.is_platform_owner_session() then
    raise exception 'Platform owner access required' using errcode='42501';
  end if;

  with mission_rows as(
    select
      o.code mission_code,
      o.title,
      o.status,
      o.scope->>'creator_name' creator_name,
      o.scope->>'creator_handle' creator_handle,
      o.scope->>'creator_slug' creator_slug,
      o.scope->>'tracking_slug' tracking_slug
    from public.progression_objectives_v2 o
    where o.scope->>'campaign_code'='kleenest-stl-creators-2026'
  ),
  counts as(
    select
      e.mission_code,
      count(*) filter(where e.event_name='landing_view') landing_views,
      count(*) filter(where e.event_name='open_app') open_app,
      count(*) filter(where e.event_name='install_intent') install_intents,
      count(distinct e.session_key) filter(where e.session_key is not null) unique_sessions
    from public.creator_mission_attribution_events e
    where e.created_at>=v_since
    group by e.mission_code
  )
  select jsonb_build_object(
    'days',v_days,
    'since',v_since,
    'missions',coalesce(jsonb_agg(jsonb_build_object(
      'mission_code',m.mission_code,
      'title',m.title,
      'status',m.status,
      'creator_name',m.creator_name,
      'creator_handle',m.creator_handle,
      'creator_slug',m.creator_slug,
      'tracking_slug',m.tracking_slug,
      'landing_views',coalesce(c.landing_views,0),
      'open_app',coalesce(c.open_app,0),
      'install_intents',coalesce(c.install_intents,0),
      'unique_sessions',coalesce(c.unique_sessions,0)
    ) order by m.creator_name),'[]'::jsonb)
  )
  into v_result
  from mission_rows m
  left join counts c on c.mission_code=m.mission_code;

  return coalesce(v_result,jsonb_build_object('days',v_days,'since',v_since,'missions','[]'::jsonb));
end;
$$;

revoke all on function public.owner_creator_mission_attribution_summary(integer) from public,anon;
grant execute on function public.owner_creator_mission_attribution_summary(integer) to authenticated,service_role;
