create table if not exists public.creator_mission_assignments (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.progression_objectives_v2(id) on delete cascade,
  creator_user_id uuid null references public.profiles(id) on delete set null,
  creator_name text not null,
  creator_handle text null,
  creator_slug text not null,
  tracking_slug text not null unique,
  campaign_code text not null default 'kleenest-creators',
  default_channel text not null default 'social',
  status text not null default 'draft',
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_mission_assignment_status_check check (status in ('draft','scheduled','active','paused','ended','archived')),
  constraint creator_mission_creator_slug_check check (creator_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint creator_mission_tracking_slug_check check (tracking_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint creator_mission_assignment_identity_unique unique (objective_id, creator_slug)
);

create index if not exists creator_mission_assignments_objective_idx on public.creator_mission_assignments(objective_id);
create index if not exists creator_mission_assignments_status_idx on public.creator_mission_assignments(status);

create table if not exists public.creator_mission_attribution_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.creator_mission_assignments(id) on delete cascade,
  user_id uuid null references public.profiles(id) on delete set null,
  session_key text not null,
  event_name text not null,
  channel text not null default 'social',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint creator_mission_event_name_check check (event_name in ('landing_view','open_app','install_intent','share'))
);

create unique index if not exists creator_mission_event_session_unique
  on public.creator_mission_attribution_events(assignment_id,event_name,session_key);
create index if not exists creator_mission_events_assignment_created_idx
  on public.creator_mission_attribution_events(assignment_id,created_at desc);

alter table public.creator_mission_assignments enable row level security;
alter table public.creator_mission_attribution_events enable row level security;

revoke all on table public.creator_mission_assignments from anon, authenticated;
revoke all on table public.creator_mission_attribution_events from anon, authenticated;

create or replace function public.owner_creator_mission_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.is_platform_owner_session() then
    raise exception 'owner control-plane access required';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'assignment_id',a.id,
        'objective_id',o.id,
        'code',o.code,
        'title',o.title,
        'description',o.description,
        'status',a.status,
        'starts_at',o.starts_at,
        'ends_at',o.ends_at,
        'rules',o.rules,
        'rewards',o.rewards,
        'scope',o.scope,
        'creator_user_id',a.creator_user_id,
        'creator_name',a.creator_name,
        'creator_handle',a.creator_handle,
        'creator_slug',a.creator_slug,
        'tracking_slug',a.tracking_slug,
        'campaign_code',a.campaign_code,
        'default_channel',a.default_channel,
        'tracking_url','https://kleenest.app/creator?m='||a.tracking_slug||'&channel='||a.default_channel,
        'landing_views',(select count(*) from public.creator_mission_attribution_events e where e.assignment_id=a.id and e.event_name='landing_view'),
        'open_apps',(select count(*) from public.creator_mission_attribution_events e where e.assignment_id=a.id and e.event_name='open_app'),
        'install_intents',(select count(*) from public.creator_mission_attribution_events e where e.assignment_id=a.id and e.event_name='install_intent'),
        'shares',(select count(*) from public.creator_mission_attribution_events e where e.assignment_id=a.id and e.event_name='share'),
        'created_at',a.created_at,
        'updated_at',a.updated_at
      )
      order by a.updated_at desc,a.created_at desc
    )
    from public.creator_mission_assignments a
    join public.progression_objectives_v2 o on o.id=a.objective_id
  ),'[]'::jsonb);
end
$function$;

create or replace function public.owner_creator_mission_upsert(
  p_assignment_id uuid,
  p_objective_id uuid,
  p_code text,
  p_title text,
  p_description text,
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_action text,
  p_target integer,
  p_xp_reward integer,
  p_audience text,
  p_steps jsonb,
  p_cta text,
  p_creator_user_id uuid,
  p_creator_name text,
  p_creator_handle text,
  p_creator_slug text,
  p_tracking_slug text,
  p_campaign_code text,
  p_default_channel text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_objective_id uuid:=p_objective_id;
  v_assignment_id uuid:=p_assignment_id;
  v_before jsonb;
  v_after jsonb;
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_creator_slug text:=lower(trim(coalesce(p_creator_slug,'')));
  v_tracking_slug text:=lower(trim(coalesce(p_tracking_slug,'')));
begin
  if v_actor is null or not public.is_platform_owner_session() then
    raise exception 'owner control-plane access required';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'reason required'; end if;
  if v_status not in ('draft','scheduled','active','paused','ended','archived') then raise exception 'unsupported creator mission status'; end if;
  if nullif(trim(coalesce(p_code,'')),'') is null or nullif(trim(coalesce(p_title,'')),'') is null then raise exception 'code and title required'; end if;
  if nullif(trim(coalesce(p_creator_name,'')),'') is null then raise exception 'creator name required'; end if;
  if v_creator_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'creator slug must contain lowercase letters, numbers and hyphens'; end if;
  if v_tracking_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'tracking slug must contain lowercase letters, numbers and hyphens'; end if;
  if p_target is null or p_target < 1 then raise exception 'target must be at least 1'; end if;
  if p_xp_reward is null or p_xp_reward < 0 or p_xp_reward > 10000 then raise exception 'xp reward out of range'; end if;
  if jsonb_typeof(coalesce(p_steps,'[]'::jsonb)) <> 'array' then raise exception 'steps must be a JSON array'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then raise exception 'end must follow start'; end if;

  if v_assignment_id is not null then
    select jsonb_build_object('assignment',to_jsonb(a),'objective',to_jsonb(o))
      into v_before
    from public.creator_mission_assignments a
    join public.progression_objectives_v2 o on o.id=a.objective_id
    where a.id=v_assignment_id
    for update of a,o;
    if v_before is null then raise exception 'creator mission assignment not found'; end if;
    if v_objective_id is null then
      select objective_id into v_objective_id from public.creator_mission_assignments where id=v_assignment_id;
    end if;
  end if;

  if v_objective_id is null then
    insert into public.progression_objectives_v2(kind,code,title,description,status,starts_at,ends_at,rules,rewards,scope)
    values(
      'mission',trim(p_code),trim(p_title),coalesce(p_description,''),v_status,p_starts_at,p_ends_at,
      jsonb_build_object('action',trim(p_action),'target',p_target,'steps',coalesce(p_steps,'[]'::jsonb),'cta',coalesce(p_cta,'')),
      jsonb_build_object('xp',p_xp_reward),
      jsonb_build_object('audience',coalesce(nullif(trim(p_audience),''),'consumer'),'creator_campaign',coalesce(nullif(trim(p_campaign_code),''),'kleenest-creators'))
    )
    returning id into v_objective_id;
  else
    update public.progression_objectives_v2
      set kind='mission',
          code=trim(p_code),
          title=trim(p_title),
          description=coalesce(p_description,''),
          status=v_status,
          starts_at=p_starts_at,
          ends_at=p_ends_at,
          rules=jsonb_build_object('action',trim(p_action),'target',p_target,'steps',coalesce(p_steps,'[]'::jsonb),'cta',coalesce(p_cta,'')),
          rewards=jsonb_build_object('xp',p_xp_reward),
          scope=jsonb_build_object('audience',coalesce(nullif(trim(p_audience),''),'consumer'),'creator_campaign',coalesce(nullif(trim(p_campaign_code),''),'kleenest-creators'))
      where id=v_objective_id and kind='mission';
    if not found then raise exception 'mission objective not found'; end if;
  end if;

  if v_assignment_id is null then
    insert into public.creator_mission_assignments(
      objective_id,creator_user_id,creator_name,creator_handle,creator_slug,tracking_slug,campaign_code,default_channel,status,created_by
    )
    values(
      v_objective_id,p_creator_user_id,trim(p_creator_name),nullif(trim(coalesce(p_creator_handle,'')),''),
      v_creator_slug,v_tracking_slug,coalesce(nullif(trim(p_campaign_code),''),'kleenest-creators'),
      coalesce(nullif(lower(trim(p_default_channel)),''),'social'),v_status,v_actor
    )
    returning id into v_assignment_id;
  else
    update public.creator_mission_assignments
      set objective_id=v_objective_id,
          creator_user_id=p_creator_user_id,
          creator_name=trim(p_creator_name),
          creator_handle=nullif(trim(coalesce(p_creator_handle,'')),''),
          creator_slug=v_creator_slug,
          tracking_slug=v_tracking_slug,
          campaign_code=coalesce(nullif(trim(p_campaign_code),''),'kleenest-creators'),
          default_channel=coalesce(nullif(lower(trim(p_default_channel)),''),'social'),
          status=v_status,
          updated_at=now()
      where id=v_assignment_id;
  end if;

  select jsonb_build_object('assignment',to_jsonb(a),'objective',to_jsonb(o),
    'tracking_url','https://kleenest.app/creator?m='||a.tracking_slug||'&channel='||a.default_channel)
    into v_after
  from public.creator_mission_assignments a
  join public.progression_objectives_v2 o on o.id=a.objective_id
  where a.id=v_assignment_id;

  insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason)
  values(v_actor,coalesce(p_creator_user_id,v_actor),v_before,v_after,'Creator mission: '||trim(p_reason));

  return v_after;
end
$function$;

create or replace function public.owner_creator_mission_set_status(
  p_assignment_id uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_objective_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if v_actor is null or not public.is_platform_owner_session() then raise exception 'owner control-plane access required'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'reason required'; end if;
  if v_status not in ('draft','scheduled','active','paused','ended','archived') then raise exception 'unsupported creator mission status'; end if;

  select a.objective_id,jsonb_build_object('assignment',to_jsonb(a),'objective',to_jsonb(o))
    into v_objective_id,v_before
  from public.creator_mission_assignments a
  join public.progression_objectives_v2 o on o.id=a.objective_id
  where a.id=p_assignment_id
  for update of a,o;
  if v_objective_id is null then raise exception 'creator mission assignment not found'; end if;

  update public.creator_mission_assignments set status=v_status,updated_at=now() where id=p_assignment_id;
  update public.progression_objectives_v2 set status=v_status where id=v_objective_id;

  select jsonb_build_object('assignment',to_jsonb(a),'objective',to_jsonb(o),
    'tracking_url','https://kleenest.app/creator?m='||a.tracking_slug||'&channel='||a.default_channel)
    into v_after
  from public.creator_mission_assignments a
  join public.progression_objectives_v2 o on o.id=a.objective_id
  where a.id=p_assignment_id;

  insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason)
  values(v_actor,v_actor,v_before,v_after,'Creator mission status: '||trim(p_reason));

  return v_after;
end
$function$;

create or replace function public.owner_creator_mission_delete(
  p_assignment_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_objective_id uuid;
  v_before jsonb;
begin
  if v_actor is null or not public.is_platform_owner_session() then raise exception 'owner control-plane access required'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'reason required'; end if;

  select a.objective_id,jsonb_build_object('assignment',to_jsonb(a),'objective',to_jsonb(o))
    into v_objective_id,v_before
  from public.creator_mission_assignments a
  join public.progression_objectives_v2 o on o.id=a.objective_id
  where a.id=p_assignment_id
  for update of a,o;
  if v_objective_id is null then return false; end if;
  if exists(select 1 from public.creator_mission_attribution_events e where e.assignment_id=p_assignment_id)
     or exists(select 1 from public.user_objective_progress_v2 p where p.objective_id=v_objective_id) then
    raise exception 'creator mission has history; archive it instead of deleting';
  end if;

  delete from public.creator_mission_assignments where id=p_assignment_id;
  delete from public.progression_objectives_v2 where id=v_objective_id;

  insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason)
  values(v_actor,v_actor,v_before,jsonb_build_object('deleted',true,'assignment_id',p_assignment_id),'Creator mission delete: '||trim(p_reason));
  return true;
end
$function$;

create or replace function public.get_creator_mission_landing(p_tracking_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_slug text:=lower(trim(coalesce(p_tracking_slug,'')));
  v_result jsonb;
begin
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then return null; end if;
  select jsonb_build_object(
    'assignment_id',a.id,
    'objective_id',o.id,
    'creator_name',a.creator_name,
    'creator_handle',a.creator_handle,
    'creator_slug',a.creator_slug,
    'tracking_slug',a.tracking_slug,
    'campaign_code',a.campaign_code,
    'title',o.title,
    'summary',o.description,
    'steps',coalesce(o.rules->'steps','[]'::jsonb),
    'cta',coalesce(o.rules->>'cta','Open Kleenest'),
    'primary_action',o.rules->>'action',
    'target',coalesce((o.rules->>'target')::integer,1),
    'xp_reward',coalesce((o.rewards->>'xp')::integer,0),
    'audience',coalesce(o.scope->>'audience','consumer')
  )
  into v_result
  from public.creator_mission_assignments a
  join public.progression_objectives_v2 o on o.id=a.objective_id
  where a.tracking_slug=v_slug
    and a.status='active'
    and o.status='active'
    and (o.starts_at is null or o.starts_at<=now())
    and (o.ends_at is null or o.ends_at>now())
  limit 1;
  return v_result;
end
$function$;

create or replace function public.record_creator_mission_attribution(
  p_tracking_slug text,
  p_event_name text,
  p_channel text,
  p_session_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment_id uuid;
  v_event_name text:=lower(trim(coalesce(p_event_name,'')));
  v_channel text:=lower(trim(coalesce(p_channel,'social')));
  v_session_key text:=trim(coalesce(p_session_key,''));
  v_user_id uuid:=auth.uid();
  v_id uuid;
begin
  if v_event_name not in ('landing_view','open_app','install_intent','share') then raise exception 'unsupported attribution event'; end if;
  if length(v_session_key)<8 or length(v_session_key)>160 then raise exception 'invalid attribution session'; end if;
  if octet_length(coalesce(p_metadata,'{}'::jsonb)::text)>8192 then raise exception 'metadata too large'; end if;

  select a.id into v_assignment_id
  from public.creator_mission_assignments a
  join public.progression_objectives_v2 o on o.id=a.objective_id
  where a.tracking_slug=lower(trim(coalesce(p_tracking_slug,'')))
    and a.status='active'
    and o.status='active'
    and (o.starts_at is null or o.starts_at<=now())
    and (o.ends_at is null or o.ends_at>now())
  limit 1;

  if v_assignment_id is null then raise exception 'creator mission not active'; end if;

  insert into public.creator_mission_attribution_events(assignment_id,user_id,session_key,event_name,channel,metadata)
  values(v_assignment_id,v_user_id,v_session_key,v_event_name,coalesce(nullif(v_channel,''),'social'),coalesce(p_metadata,'{}'::jsonb))
  on conflict (assignment_id,event_name,session_key) do update
    set user_id=coalesce(excluded.user_id,public.creator_mission_attribution_events.user_id),
        channel=excluded.channel,
        metadata=public.creator_mission_attribution_events.metadata||excluded.metadata
  returning id into v_id;

  return jsonb_build_object('event_id',v_id,'assignment_id',v_assignment_id,'event_name',v_event_name);
end
$function$;

revoke execute on function public.owner_creator_mission_list() from public, anon;
revoke execute on function public.owner_creator_mission_upsert(uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,integer,integer,text,jsonb,text,uuid,text,text,text,text,text,text,text) from public, anon;
revoke execute on function public.owner_creator_mission_set_status(uuid,text,text) from public, anon;
revoke execute on function public.owner_creator_mission_delete(uuid,text) from public, anon;
grant execute on function public.owner_creator_mission_list() to authenticated;
grant execute on function public.owner_creator_mission_upsert(uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,integer,integer,text,jsonb,text,uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.owner_creator_mission_set_status(uuid,text,text) to authenticated;
grant execute on function public.owner_creator_mission_delete(uuid,text) to authenticated;

revoke execute on function public.get_creator_mission_landing(text) from public;
grant execute on function public.get_creator_mission_landing(text) to anon, authenticated;
revoke execute on function public.record_creator_mission_attribution(text,text,text,text,jsonb) from public;
grant execute on function public.record_creator_mission_attribution(text,text,text,text,jsonb) to anon, authenticated;

with seed(creator_name,creator_handle,creator_slug,mission_code,tracking_slug,title,summary,steps,action,target,xp,cta) as (
  values
  ('Alexis Zotos','@alexiszotos','alexis-zotos','creator-alexis-family-outing','alexis-family-outing','The Parent Panic Test','Use Kleenest during a real family outing, find a family-appropriate restroom, confirm useful details, navigate there, and leave one legitimate freshness update.',
   '["Start a normal family outing around Forest Park, the Zoo, or another STL family destination.","When restroom planning becomes relevant, open Kleenest and compare nearby options.","Check family-relevant details such as changing table, accessibility, freshness, and distance.","Navigate to the selected stop and complete one legitimate verification or update.","Show the audience what changed because of the contribution."]'::jsonb,'verify_location',1,175,'Save Kleenest before your next family outing.'),
  ('Steph Hampton','@explorestlparks','steph-hampton','creator-steph-park-scout','steph-park-scout','STL Park Scout Challenge','Visit three parks and improve the restroom information families need before leaving home.',
   '["Choose three STL-area parks that fit your normal content.","Open Kleenest at each park and inspect current restroom details.","Confirm or update one legitimate restroom fact at each stop.","Call out missing family or accessibility details when they matter.","Finish with a before/after recap of how the three park records improved."]'::jsonb,'verify_location',3,350,'Scout one park near you and make its information fresher.'),
  ('Sara / Midwest Nomad Family','@midwestnomadfamily','sara-midwest-nomad','creator-sara-road-trip','sara-road-trip','Road Trip Without Guessing','Plan restroom stops on a real family road trip, use the plan on the road, and refresh the network after the stops.',
   '["Choose a real family drive already on your calendar.","Before departure, use Kleenest to identify at least two plausible restroom stops.","Show the route plan before you leave.","Use at least one planned stop when it naturally fits the trip.","Submit legitimate updates after the stop so the next traveler gets fresher information."]'::jsonb,'reverify_stale',2,300,'Plan your next road-trip stops in Kleenest.'),
  ('Abbey / The Abbey Normal Blog','@theabbeynormalblog','abbey-normal','creator-abbey-neighborhood-scout','abbey-neighborhood-scout','Neighborhood Bathroom Scout','Choose one STL neighborhood and improve three places families actually use.',
   '["Pick one STL neighborhood you already explore with your family.","Choose three real destinations in that neighborhood.","Check each location in Kleenest and identify what is useful, stale, or missing.","Add or confirm legitimate evidence at each location.","End with a neighborhood map recap and invite followers to repeat the mission where they live."]'::jsonb,'helpful_contribution',3,325,'Update three places in your own neighborhood.'),
  ('Mikayla Isabelle','@mikayla.isabelle','mikayla-isabelle','creator-mikayla-weekend-ready','mikayla-weekend-ready','STL Night-Out Backup Plan','Make restroom planning part of a real STL night-out checklist and test the plan during the outing.',
   '["Pick a real event, date night, festival, or evening out.","Before leaving, open Kleenest and compare restroom options near the destination.","Save or remember two backup options and show why each is useful.","During the outing, use Kleenest if a restroom stop becomes relevant.","Afterward, contribute one legitimate update if you learned something new."]'::jsonb,'discover_gps',2,200,'Before you go out, know two possible stops.'),
  ('Braden Tewolde','@BradENSTL','braden-tewolde','creator-braden-kleenest-stop','braden-kleenest-stop','The Kleenest Stop','Feature a local business and show how restroom quality fits the customer experience without turning the piece into a cleanliness takedown.',
   '["Choose a local business that fits your normal food or STL coverage.","Show the business in Kleenest and explain what a customer can learn before visiting.","If appropriate, make one legitimate restroom evidence contribution.","With operator permission, briefly show or discuss the claim/manage-location value for businesses.","Close on the idea that restroom quality is part of the customer experience."]'::jsonb,'substantive_review',1,225,'Find a Kleenest Stop — and businesses can claim their location.'),
  ('STL Bucket List','@stlbucketlist','stl-bucket-list','creator-stl-bucket-list-weekend-map','stl-bucket-list-weekend-map','The Kleenest STL Weekend Map','Create an editorial-style event guide that makes Kleenest useful before people leave home.',
   '["Choose one high-traffic STL weekend, event, or district.","Build a short list of useful restroom options around the activity area.","Explain which details matter before visitors leave home.","Refresh at least three legitimate location details where possible.","Publish the guide as a reusable STL utility rather than a generic app promotion."]'::jsonb,'helpful_contribution',3,350,'Open the STL map before heading out this weekend.'),
  ('Amy Funderburk','@amyfunderburk','amy-funderburk','creator-amy-real-stl-day','amy-real-stl-day','One Real STL Day','Work Kleenest naturally into a normal STL day instead of building the entire day around the app.',
   '["Film a real day with errands, food, family activity, or local stops.","Introduce Kleenest only when restroom planning naturally becomes relevant.","Show one real product decision: nearby options, amenities, freshness, or directions.","Use the selected stop if it fits the day.","Leave one legitimate update and show that the network improves after normal use."]'::jsonb,'verify_location',1,175,'Keep Kleenest on your phone for the moment you actually need it.'),
  ('Kelly Stumpe / The Car Mom','@the_car_mom','kelly-stumpe','creator-kelly-road-trip-prep','kelly-road-trip-prep','Family Road-Trip Prep','Add restroom planning to the same practical pre-drive checklist as fuel, snacks, chargers, and car-seat setup.',
   '["Use a real family drive or road-trip preparation segment.","Add restroom planning to the pre-drive checklist.","Use Kleenest to identify family-appropriate stops along the route.","Show at least one useful filter or detail that changes the stop decision.","After a stop, leave one legitimate update when possible."]'::jsonb,'discover_gps',2,225,'Add restroom planning to your road-trip checklist.')
),
upserted as (
  insert into public.progression_objectives_v2(kind,code,title,description,status,rules,rewards,scope)
  select 'mission',mission_code,title,summary,'draft',
         jsonb_build_object('action',action,'target',target,'steps',steps,'cta',cta),
         jsonb_build_object('xp',xp),
         jsonb_build_object('audience','consumer','creator_campaign','kleenest-stl-creators-2026')
  from seed
  on conflict (code) do update set
    kind='mission',
    title=excluded.title,
    description=excluded.description,
    status=case when public.progression_objectives_v2.status in ('active','scheduled','paused','ended','archived') then public.progression_objectives_v2.status else 'draft' end,
    rules=excluded.rules,
    rewards=excluded.rewards,
    scope=excluded.scope
  returning id,code,status
)
insert into public.creator_mission_assignments(objective_id,creator_name,creator_handle,creator_slug,tracking_slug,campaign_code,default_channel,status)
select o.id,s.creator_name,s.creator_handle,s.creator_slug,s.tracking_slug,'kleenest-stl-creators-2026','social','draft'
from seed s
join public.progression_objectives_v2 o on o.code=s.mission_code
on conflict (tracking_slug) do update set
  objective_id=excluded.objective_id,
  creator_name=excluded.creator_name,
  creator_handle=excluded.creator_handle,
  creator_slug=excluded.creator_slug,
  campaign_code=excluded.campaign_code,
  default_channel=excluded.default_channel,
  status=case when public.creator_mission_assignments.status in ('active','scheduled','paused','ended','archived') then public.creator_mission_assignments.status else 'draft' end,
  updated_at=now();
