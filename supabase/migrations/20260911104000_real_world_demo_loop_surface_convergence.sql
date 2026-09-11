-- Complete the guided-loop surface coverage required by the original real-world demo contract.
-- Growth adds location truth + verified feedback; Fleet adds live signal observation.

create or replace function public.real_world_demo_loop_steps(p_scenario text)
returns jsonb
language sql
immutable
set search_path=''
as $$
select case lower(coalesce(p_scenario,''))
when 'growth' then jsonb_build_array(
  jsonb_build_object(
    'id','growth_context','phase','observe','title','Establish the location truth customers will experience',
    'what_happens','The operator confirms the actual location and restroom/amenity context before spending money to drive traffic.',
    'why_it_matters','Growth starts with a trustworthy destination. Promotion without accurate location truth creates the wrong feedback loop.',
    'surface','/locations','evidence_keys',jsonb_build_array('locations')
  ),
  jsonb_build_object(
    'id','growth_trigger','phase','trigger','title','Give the customer a reason to visit',
    'what_happens','The business launches a morning offer and active Growth campaign around the operated location.',
    'why_it_matters','The demand signal is intentional and measurable instead of generic advertising activity.',
    'surface','/growth','evidence_keys',jsonb_build_array('promotions','campaigns')
  ),
  jsonb_build_object(
    'id','growth_observe','phase','observe','title','A real visit enters the attribution loop',
    'what_happens','The customer arrives and scans the location QR. Kleenest records attributable visit activity.',
    'why_it_matters','The business can connect a physical visit to a specific location and program instead of counting anonymous impressions.',
    'surface','/qr-studio','evidence_keys',jsonb_build_array('qr_assets','qr_scans')
  ),
  jsonb_build_object(
    'id','growth_verify','phase','verify','title','Verified feedback turns the visit into trust evidence',
    'what_happens','The visit can produce verified feedback and a Business reply tied back to the real location experience.',
    'why_it_matters','Attribution answers who acted; verified feedback explains why the experience should be repeated or repaired.',
    'surface','/reviews','evidence_keys',jsonb_build_array('qr_scans','qr_redemptions')
  ),
  jsonb_build_object(
    'id','growth_act','phase','act','title','Turn verified traffic into repeat engagement',
    'what_happens','The same visit can redeem the offer and feed a repeat-visit contest or community event.',
    'why_it_matters','One verified visit becomes a reusable engagement signal rather than a one-time transaction.',
    'surface','/growth','evidence_keys',jsonb_build_array('qr_redemptions','contests','events')
  ),
  jsonb_build_object(
    'id','growth_measure','phase','measure','title','Measure attributable conversion and repeat behavior',
    'what_happens','The operator reviews campaign, scan, redemption and engagement evidence together.',
    'why_it_matters','Growth decisions are based on observed conversion and repeat behavior, not intuition alone.',
    'surface','/analytics','evidence_keys',jsonb_build_array('campaigns','qr_scans','qr_redemptions','contests')
  ),
  jsonb_build_object(
    'id','growth_complete','phase','complete','title','Close the loop with the next action',
    'what_happens','Business Intelligence turns the measured result into the next offer, campaign, trust or location action.',
    'why_it_matters','The end of one campaign becomes the trigger for the next iteration: establish truth → attract → verify → measure → improve.',
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
    'id','fleet_plan','phase','observe','title','Build the route around real stop context',
    'what_happens','Dispatch orders route stops and uses canonical or ad-hoc locations to define the mission.',
    'why_it_matters','The route becomes a concrete operational plan rather than a loose list of destinations.',
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
    'id','fleet_signals','phase','observe','title','Watch the live context around the route',
    'what_happens','Monitored locations, geofences and network signals show what is changing around the active mission.',
    'why_it_matters','The exception loop starts with detection. Dispatch needs context before it can make a recovery decision.',
    'surface','/signals','evidence_keys',jsonb_build_array('monitored_locations','active_routes')
  ),
  jsonb_build_object(
    'id','fleet_recover','phase','act','title','An exception forces a recovery decision',
    'what_happens','A restroom-access detour creates a live route exception. Dispatch works the warning without losing route visibility.',
    'why_it_matters','The product demonstrates the hard part of fleet operations: adapting while preserving accountability.',
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
    'why_it_matters','The loop closes: plan → dispatch → execute → observe → recover → learn → plan better.',
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
