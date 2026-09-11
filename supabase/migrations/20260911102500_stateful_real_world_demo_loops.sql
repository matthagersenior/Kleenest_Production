-- Stateful guided real-world demo loops for Growth, Fleet and Enterprise.
-- Demo sessions are isolated to demo workspaces and persist per signed-in user.

create table if not exists public.real_world_demo_loop_sessions(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null,
  scenario text not null check(scenario in('growth','fleet','enterprise')),
  current_step integer not null default 0 check(current_step>=0),
  completed boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,user_id,scenario)
);

create table if not exists public.real_world_demo_loop_events(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.real_world_demo_loop_sessions(id) on delete cascade,
  step_number integer not null check(step_number>0),
  step_id text not null,
  phase text not null,
  title text not null,
  evidence jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  unique(session_id,step_number)
);

alter table public.real_world_demo_loop_sessions enable row level security;
alter table public.real_world_demo_loop_events enable row level security;
revoke all on table public.real_world_demo_loop_sessions from public,anon,authenticated;
revoke all on table public.real_world_demo_loop_events from public,anon,authenticated;
grant select,insert,update,delete on table public.real_world_demo_loop_sessions to service_role;
grant select,insert,update,delete on table public.real_world_demo_loop_events to service_role;

create or replace function public.real_world_demo_loop_steps(p_scenario text)
returns jsonb
language sql
immutable
set search_path=''
as $$
select case lower(coalesce(p_scenario,''))
when 'growth' then jsonb_build_array(
  jsonb_build_object(
    'id','growth_trigger','phase','trigger','title','Give the customer a reason to visit',
    'what_happens','The business launches a morning offer and active Growth campaign around a real operated location.',
    'why_it_matters','The loop starts with an intentional demand signal, not with analytics after the fact.',
    'surface','/growth','evidence_keys',jsonb_build_array('promotions','campaigns')
  ),
  jsonb_build_object(
    'id','growth_observe','phase','observe','title','A real visit enters the attribution loop',
    'what_happens','The customer arrives and scans the location QR. Kleenest records attributable visit activity.',
    'why_it_matters','The business can connect a physical visit to a specific location and program instead of counting anonymous impressions.',
    'surface','/qr-studio','evidence_keys',jsonb_build_array('qr_assets','qr_scans')
  ),
  jsonb_build_object(
    'id','growth_act','phase','act','title','Turn verified traffic into engagement',
    'what_happens','The same visit can redeem the offer and feed a repeat-visit contest or community event.',
    'why_it_matters','One verified visit becomes a reusable engagement signal rather than a one-time transaction.',
    'surface','/growth','evidence_keys',jsonb_build_array('qr_redemptions','contests','events')
  ),
  jsonb_build_object(
    'id','growth_verify','phase','verify','title','Verify what actually converted',
    'what_happens','QR scans and redemptions provide proof that the campaign produced attributable behavior.',
    'why_it_matters','The operator can separate real participation from views, clicks or estimated foot traffic.',
    'surface','/analytics','evidence_keys',jsonb_build_array('qr_scans','qr_redemptions')
  ),
  jsonb_build_object(
    'id','growth_measure','phase','measure','title','Measure the program as an operating result',
    'what_happens','The operator reviews campaign, visit and engagement evidence together and identifies what is working.',
    'why_it_matters','Growth decisions are based on observed conversion and repeat behavior, not intuition alone.',
    'surface','/analytics','evidence_keys',jsonb_build_array('campaigns','qr_scans','qr_redemptions','contests')
  ),
  jsonb_build_object(
    'id','growth_complete','phase','complete','title','Close the loop with the next action',
    'what_happens','Business Intelligence turns the measured result into the next offer, campaign or trust action.',
    'why_it_matters','The end of one campaign becomes the trigger for the next iteration: attract → verify → measure → improve.',
    'surface','/intelligence','evidence_keys',jsonb_build_array('locations','promotions','campaigns','qr_scans','qr_redemptions')
  )
)
when 'fleet' then jsonb_build_array(
  jsonb_build_object(
    'id','fleet_trigger','phase','trigger','title','A service mission needs to be completed',
    'what_happens','A vehicle, driver and scheduled route establish the operating assignment.',
    'why_it_matters','The loop begins with a real responsibility: who is going where, with which asset, and why.',
    'surface','/assets','evidence_keys',jsonb_build_array('vehicles','drivers','routes')
  ),
  jsonb_build_object(
    'id','fleet_observe','phase','observe','title','Build the route around real stop context',
    'what_happens','Dispatch orders route stops and monitors the Kleenest location network around the mission.',
    'why_it_matters','Routing and amenity context are part of the same operational picture instead of separate apps and spreadsheets.',
    'surface','/planner','evidence_keys',jsonb_build_array('route_stops','monitored_locations')
  ),
  jsonb_build_object(
    'id','fleet_act','phase','act','title','Dispatch the mission',
    'what_happens','The planned route becomes an active assignment with driver and vehicle responsibility.',
    'why_it_matters','A plan only creates value when it becomes a controlled, observable field operation.',
    'surface','/dispatch','evidence_keys',jsonb_build_array('active_routes','routes')
  ),
  jsonb_build_object(
    'id','fleet_verify','phase','verify','title','Verify execution at the stop',
    'what_happens','Arrival, service, completion, departure and geofence evidence prove what happened at each stop.',
    'why_it_matters','Dispatch gains service proof and timing evidence rather than relying on a driver saying the stop is done.',
    'surface','/execution','evidence_keys',jsonb_build_array('route_stops','monitored_locations')
  ),
  jsonb_build_object(
    'id','fleet_recover','phase','act','title','An exception forces a decision',
    'what_happens','A restroom-access detour creates a live route exception. Dispatch sees the warning and nearby network context.',
    'why_it_matters','The product demonstrates the hard part of fleet operations: adapting without losing route visibility.',
    'surface','/operations','evidence_keys',jsonb_build_array('open_alerts','monitored_locations')
  ),
  jsonb_build_object(
    'id','fleet_measure','phase','measure','title','Measure the recovery and route performance',
    'what_happens','Route timing, exception and operational signals become measurable performance evidence.',
    'why_it_matters','The organization can compare routes, assets and recurring exception patterns instead of treating each incident as isolated.',
    'surface','/insights','evidence_keys',jsonb_build_array('routes','active_routes','open_alerts')
  ),
  jsonb_build_object(
    'id','fleet_complete','phase','complete','title','Feed the result back into the next dispatch',
    'what_happens','The learned route, stop and exception evidence informs the next plan, monitored locations and preventive action.',
    'why_it_matters','The loop closes: plan → dispatch → execute → recover → learn → plan better.',
    'surface','/insights','evidence_keys',jsonb_build_array('vehicles','drivers','routes','route_stops','open_alerts','monitored_locations')
  )
)
when 'enterprise' then jsonb_build_array(
  jsonb_build_object(
    'id','enterprise_trigger','phase','trigger','title','A portfolio-level operating signal appears',
    'what_happens','Enterprise sees multiple locations, partner businesses and live operating context as one managed portfolio.',
    'why_it_matters','The loop starts above a single location: the operator must decide where attention and resources matter most.',
    'surface','/enterprise-locations','evidence_keys',jsonb_build_array('locations','network_members')
  ),
  jsonb_build_object(
    'id','enterprise_observe','phase','observe','title','Identify the issue and its operating impact',
    'what_happens','A remediation case, preventive work and open alert expose a concrete service-quality risk.',
    'why_it_matters','Enterprise can connect trust/quality evidence to an actionable operating problem.',
    'surface','/operations','evidence_keys',jsonb_build_array('remediation_cases','preventive_work_orders','open_alerts')
  ),
  jsonb_build_object(
    'id','enterprise_act','phase','act','title','Coordinate the response across the network',
    'what_happens','Routes, teams and partner-network controls provide the mechanism to act across organizations and locations.',
    'why_it_matters','Enterprise value comes from coordinated execution, not merely aggregated reporting.',
    'surface','/enterprise','evidence_keys',jsonb_build_array('routes','active_routes','network_members')
  ),
  jsonb_build_object(
    'id','enterprise_verify','phase','verify','title','Verify partner and campaign outcomes',
    'what_happens','Partner campaign outcomes and network metrics show whether the coordinated response produced observable results.',
    'why_it_matters','Shared programs need evidence that can be attributed across partners, not just internal activity counts.',
    'surface','/enterprise','evidence_keys',jsonb_build_array('active_campaigns','campaign_outcomes','network_metric_days')
  ),
  jsonb_build_object(
    'id','enterprise_measure','phase','measure','title','Allocate resources using portfolio evidence',
    'what_happens','Enterprise Economy connects allocations, benchmark signals and program outcomes to resource decisions.',
    'why_it_matters','Capital and operational effort can move toward the locations and partners where the evidence justifies it.',
    'surface','/enterprise-economy','evidence_keys',jsonb_build_array('allocations','campaign_outcomes','network_metric_days')
  ),
  jsonb_build_object(
    'id','enterprise_complete','phase','complete','title','Close the portfolio feedback loop',
    'what_happens','Portfolio analytics compare the resulting evidence and create the next operating priority.',
    'why_it_matters','The loop closes: detect → coordinate → verify → allocate → measure → reprioritize.',
    'surface','/analytics','evidence_keys',jsonb_build_array('locations','network_members','allocations','campaign_outcomes','remediation_cases','preventive_work_orders')
  )
)
else '[]'::jsonb
end;
$$;

create or replace function public.real_world_demo_loop_state(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  b public.businesses;
  v_scenario text;
  v_snapshot jsonb;
  v_steps jsonb;
  v_total integer;
  v_session public.real_world_demo_loop_sessions;
  v_events jsonb;
  v_completed_steps integer:=0;
  v_progress numeric:=0;
  v_loop_title text;
  v_loop_summary text;
  v_completion_summary text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into b from public.businesses where id=p_business_id and is_demo_test=true;
  if b.id is null then raise exception 'Real-world demos are restricted to demo workspaces'; end if;

  if lower(b.business_tier::text)='fleet' then
    if not public.business_fleet_authorized(p_business_id) then raise exception 'Fleet access required'; end if;
    v_scenario:='fleet';
    v_snapshot:=public.fleet_real_world_demo_snapshot(p_business_id);
    v_loop_title:='Recover a field-service route without losing operational proof';
    v_loop_summary:='Follow one mission from assignment through dispatch, stop execution, exception recovery and the evidence that improves the next route.';
    v_completion_summary:='The route result becomes planning intelligence for the next mission.';
  elsif lower(b.business_tier::text)='enterprise' then
    if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
    v_scenario:='enterprise';
    v_snapshot:=public.business_real_world_demo_snapshot(p_business_id);
    v_loop_title:='Turn a portfolio signal into a measurable network response';
    v_loop_summary:='Follow a service-quality issue from portfolio visibility through coordinated action, partner outcomes, allocation and the next priority.';
    v_completion_summary:='The measured portfolio outcome becomes the next Enterprise operating priority.';
  elsif lower(b.business_tier::text)='growth' then
    if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
    v_scenario:='growth';
    v_snapshot:=public.business_real_world_demo_snapshot(p_business_id);
    v_loop_title:='Turn a verified visit into measurable repeat traffic';
    v_loop_summary:='Follow a customer from the reason to visit through QR attribution, engagement, measurement and the next Growth action.';
    v_completion_summary:='The measured conversion becomes the trigger for the next campaign iteration.';
  else
    raise exception 'This demo workspace does not have a Growth, Fleet or Enterprise loop';
  end if;

  v_steps:=public.real_world_demo_loop_steps(v_scenario);
  v_total:=jsonb_array_length(v_steps);

  select * into v_session
  from public.real_world_demo_loop_sessions
  where business_id=p_business_id and user_id=auth.uid() and scenario=v_scenario;

  if v_session.id is not null then
    if v_session.completed then
      v_completed_steps:=v_total;
    else
      v_completed_steps:=greatest(v_session.current_step-1,0);
    end if;
    if v_total>0 then v_progress:=round((100.0*v_completed_steps/v_total)::numeric,0); end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'step_number',e.step_number,
    'step_id',e.step_id,
    'phase',e.phase,
    'title',e.title,
    'evidence',e.evidence,
    'completed_at',e.completed_at
  ) order by e.step_number),'[]'::jsonb)
  into v_events
  from public.real_world_demo_loop_events e
  where v_session.id is not null and e.session_id=v_session.id;

  return jsonb_build_object(
    'business_id',p_business_id,
    'workspace',b.name,
    'scenario',v_scenario,
    'headline',v_snapshot->>'headline',
    'loop_title',v_loop_title,
    'loop_summary',v_loop_summary,
    'completion_summary',v_completion_summary,
    'passed',coalesce((v_snapshot->>'passed')::boolean,false),
    'evidence',coalesce(v_snapshot->'evidence','{}'::jsonb),
    'steps',v_steps,
    'events',coalesce(v_events,'[]'::jsonb),
    'started',v_session.id is not null and v_session.current_step>0,
    'completed',coalesce(v_session.completed,false),
    'current_step',coalesce(v_session.current_step,0),
    'completed_steps',v_completed_steps,
    'total_steps',v_total,
    'progress_pct',v_progress,
    'started_at',v_session.started_at,
    'completed_at',v_session.completed_at
  );
end;
$$;

create or replace function public.real_world_demo_loop_start(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_state jsonb;
  v_scenario text;
begin
  v_state:=public.real_world_demo_loop_state(p_business_id);
  v_scenario:=v_state->>'scenario';

  insert into public.real_world_demo_loop_sessions(
    business_id,user_id,scenario,current_step,completed,started_at,completed_at,updated_at
  )
  values(p_business_id,auth.uid(),v_scenario,1,false,now(),null,now())
  on conflict(business_id,user_id,scenario) do update set
    current_step=case
      when public.real_world_demo_loop_sessions.completed then public.real_world_demo_loop_sessions.current_step
      when public.real_world_demo_loop_sessions.current_step<=0 then 1
      else public.real_world_demo_loop_sessions.current_step
    end,
    started_at=coalesce(public.real_world_demo_loop_sessions.started_at,now()),
    updated_at=now();

  return public.real_world_demo_loop_state(p_business_id);
end;
$$;

create or replace function public.real_world_demo_loop_advance(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_state jsonb;
  v_scenario text;
  v_steps jsonb;
  v_total integer;
  v_session public.real_world_demo_loop_sessions;
  v_step jsonb;
  v_snapshot jsonb;
begin
  v_state:=public.real_world_demo_loop_state(p_business_id);
  v_scenario:=v_state->>'scenario';
  v_steps:=v_state->'steps';
  v_total:=coalesce((v_state->>'total_steps')::integer,0);

  select * into v_session
  from public.real_world_demo_loop_sessions
  where business_id=p_business_id and user_id=auth.uid() and scenario=v_scenario
  for update;

  if v_session.id is null or v_session.current_step<=0 then
    raise exception 'Start the demo before completing a step';
  end if;
  if v_session.completed then
    return v_state;
  end if;

  select value into v_step
  from jsonb_array_elements(v_steps) with ordinality t(value,ord)
  where ord=v_session.current_step;

  if v_step is null then raise exception 'Demo step is unavailable'; end if;

  if v_scenario='fleet' then
    v_snapshot:=public.fleet_real_world_demo_snapshot(p_business_id);
  else
    v_snapshot:=public.business_real_world_demo_snapshot(p_business_id);
  end if;

  insert into public.real_world_demo_loop_events(
    session_id,step_number,step_id,phase,title,evidence,completed_at
  )
  values(
    v_session.id,
    v_session.current_step,
    v_step->>'id',
    v_step->>'phase',
    v_step->>'title',
    coalesce(v_snapshot->'evidence','{}'::jsonb),
    now()
  )
  on conflict(session_id,step_number) do update set
    step_id=excluded.step_id,
    phase=excluded.phase,
    title=excluded.title,
    evidence=excluded.evidence,
    completed_at=excluded.completed_at;

  if v_session.current_step>=v_total then
    update public.real_world_demo_loop_sessions
    set completed=true,completed_at=now(),updated_at=now()
    where id=v_session.id;
  else
    update public.real_world_demo_loop_sessions
    set current_step=current_step+1,updated_at=now()
    where id=v_session.id;
  end if;

  return public.real_world_demo_loop_state(p_business_id);
end;
$$;

create or replace function public.real_world_demo_loop_reset(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_state jsonb;
  v_scenario text;
  v_session uuid;
begin
  v_state:=public.real_world_demo_loop_state(p_business_id);
  v_scenario:=v_state->>'scenario';

  select id into v_session
  from public.real_world_demo_loop_sessions
  where business_id=p_business_id and user_id=auth.uid() and scenario=v_scenario;

  if v_session is not null then
    delete from public.real_world_demo_loop_events where session_id=v_session;
    delete from public.real_world_demo_loop_sessions where id=v_session;
  end if;

  return public.real_world_demo_loop_state(p_business_id);
end;
$$;

revoke all on function public.real_world_demo_loop_steps(text) from public,anon;
revoke all on function public.real_world_demo_loop_state(uuid) from public,anon;
revoke all on function public.real_world_demo_loop_start(uuid) from public,anon;
revoke all on function public.real_world_demo_loop_advance(uuid) from public,anon;
revoke all on function public.real_world_demo_loop_reset(uuid) from public,anon;

grant execute on function public.real_world_demo_loop_steps(text) to authenticated,service_role;
grant execute on function public.real_world_demo_loop_state(uuid) to authenticated,service_role;
grant execute on function public.real_world_demo_loop_start(uuid) to authenticated,service_role;
grant execute on function public.real_world_demo_loop_advance(uuid) to authenticated,service_role;
grant execute on function public.real_world_demo_loop_reset(uuid) to authenticated,service_role;

comment on function public.real_world_demo_loop_state(uuid) is
  'Returns the persistent guided real-world demo loop for a Growth, Fleet or Enterprise demo workspace.';
comment on function public.real_world_demo_loop_advance(uuid) is
  'Completes the current guided demo step, captures live evidence, and advances the loop.';
