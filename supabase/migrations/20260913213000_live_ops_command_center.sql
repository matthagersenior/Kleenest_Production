-- Live Ops command center: correlate existing canonical operational sources without
-- creating a parallel incident ledger. Actions continue through remediation,
-- preventive-work, smart-device and Fleet authorities.

create or replace function public.business_live_ops_command_center(
  p_business_id uuid,
  p_window_minutes integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_window integer:=greatest(15,least(coalesce(p_window_minutes,60),1440));
  v_since timestamptz:=now()-make_interval(mins=>greatest(15,least(coalesce(p_window_minutes,60),1440)));
  v_previous_since timestamptz:=now()-make_interval(mins=>greatest(15,least(coalesce(p_window_minutes,60),1440))*2);
  v_attention jsonb:='[]'::jsonb;
  v_verification jsonb:='[]'::jsonb;
  v_activity jsonb:='[]'::jsonb;
  v_changes jsonb:='[]'::jsonb;
  v_motifs jsonb:='[]'::jsonb;
  v_device jsonb:='{}'::jsonb;
  v_fleet jsonb:='{}'::jsonb;
  v_service jsonb:='{}'::jsonb;
  v_summary jsonb:='{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required' using errcode='42501';
  end if;

  with queue as (
    select
      'remediation'::text source_kind,c.id source_id,c.location_id,l.name location_name,
      ('Remediate '||coalesce(a.name,'restroom issue'))::text title,
      concat_ws(' · ',
        case when c.due_at<now() then 'SLA overdue' when c.due_at<=now()+interval '4 hours' then 'Due soon' else 'Open remediation' end,
        'priority '||c.priority::text,
        case when c.escalation_level>0 then 'escalation '||c.escalation_level::text end
      )::text detail,
      c.status::text status,
      case
        when c.due_at<now()-interval '24 hours' or c.priority>=90 then 'critical'
        when c.due_at<now() or c.priority>=75 then 'high'
        else 'elevated'
      end::text severity,
      least(100,c.priority
        +case when c.due_at<now() then 15 else 0 end
        +least(20,coalesce(c.escalation_level,0)*5)
      )::integer priority_score,
      c.due_at,
      c.updated_at observed_at,
      '/trust-operations'::text action_route,
      case when c.status='open' then 'Claim case' when c.status='assigned' then 'Start work' else 'Open case' end::text action_label,
      case when c.status='open' then 'claim' when c.status='assigned' then 'start' else 'open' end::text action_type,
      true verification_required,
      jsonb_build_object('amenity_id',c.amenity_id,'amenity_name',a.name,'priority',c.priority,'sla_due_at',c.due_at,'escalation_level',c.escalation_level) evidence
    from public.business_restroom_remediation_cases c
    join public.locations l on l.id=c.location_id
    left join public.amenities a on a.id=c.amenity_id
    where c.business_id=p_business_id and c.status in('open','assigned','in_progress')

    union all

    select
      'preventive'::text,w.id,w.location_id,l.name,
      ('Prevent '||coalesce(a.name,'restroom failure'))::text,
      concat_ws(' · ',
        coalesce(w.recommendation_action,'Preventive service'),
        case when w.due_at<now() then 'overdue' when w.due_at<=now()+interval '4 hours' then 'due soon' end,
        coalesce(w.priority,'watch')
      )::text,
      w.status::text,
      case
        when w.due_at<now()-interval '24 hours' or w.priority='critical' then 'critical'
        when w.due_at<now() or w.priority='high' then 'high'
        else 'elevated'
      end::text,
      least(100,
        case w.priority when 'critical' then 90 when 'high' then 75 when 'watch' then 55 else 40 end
        +case when w.due_at<now() then 15 else 0 end
        +least(20,coalesce(w.escalation_level,0)*5)
      )::integer,
      w.due_at,w.updated_at,
      '/prevention'::text,
      case when w.status='planned' then 'Claim work' when w.status='assigned' then 'Start work' else 'Open work' end::text,
      case when w.status='planned' then 'claim' when w.status='assigned' then 'start' else 'open' end::text,
      true,
      jsonb_build_object('amenity_id',w.amenity_id,'amenity_name',a.name,'recommendation_action',w.recommendation_action,'priority',w.priority,'verification_status',w.verification_status,'escalation_level',w.escalation_level)
    from public.business_restroom_preventive_work_orders w
    join public.locations l on l.id=w.location_id
    left join public.amenities a on a.id=w.amenity_id
    where w.business_id=p_business_id and w.status in('planned','assigned','in_progress')

    union all

    select
      'device'::text,e.id,d.location_id,l.name,
      coalesce(d.name,'Smart device')||': '||replace(e.event_type,'_',' ')::text,
      concat_ws(' · ',e.metric,coalesce(e.value_numeric::text,e.value_text),e.unit)::text,
      d.status::text,
      case when e.severity='critical' then 'critical' else 'high' end::text,
      (case when e.severity='critical' then 92 else 74 end
        +case when e.observed_at>=now()-interval '15 minutes' then 5 else 0 end
      )::integer,
      null::timestamptz,e.observed_at,
      '/devices'::text,'Open device'::text,'open'::text,false,
      jsonb_build_object('device_id',d.id,'device_name',d.name,'device_type',d.device_type,'event_type',e.event_type,'metric',e.metric,'value_numeric',e.value_numeric,'value_text',e.value_text,'unit',e.unit)
    from (
      select distinct on (device_id,coalesce(metric,event_type)) *
      from public.smart_device_events
      where business_id=p_business_id and severity in('warning','critical') and observed_at>=now()-interval '24 hours'
      order by device_id,coalesce(metric,event_type),observed_at desc
    ) e
    join public.smart_devices d on d.id=e.device_id
    left join public.locations l on l.id=d.location_id

    union all

    select
      'fleet_alert'::text,a.id,null::uuid,null::text,
      coalesce(a.title,replace(a.alert_type,'_',' '))::text,
      coalesce(a.details,'Fleet operational exception')::text,
      a.status::text,
      case when lower(a.severity) in('critical','high') then lower(a.severity) else 'elevated' end::text,
      case lower(a.severity) when 'critical' then 96 when 'high' then 82 when 'warning' then 68 else 58 end::integer,
      null::timestamptz,a.created_at,
      '/fleet'::text,'Open Fleet'::text,'open'::text,false,
      jsonb_build_object('alert_type',a.alert_type,'vehicle_id',a.vehicle_id,'source_kind',a.source_kind,'source_id',a.source_id)
    from public.fleet_alerts a
    where a.business_id=p_business_id and a.status<>'resolved'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_kind',q.source_kind,'source_id',q.source_id,'location_id',q.location_id,'location_name',q.location_name,
    'title',q.title,'detail',q.detail,'status',q.status,'severity',q.severity,'priority_score',q.priority_score,
    'due_at',q.due_at,'observed_at',q.observed_at,'action_route',q.action_route,'action_label',q.action_label,
    'action_type',q.action_type,'verification_required',q.verification_required,'evidence',q.evidence
  ) order by q.priority_score desc,q.due_at asc nulls last,q.observed_at desc),'[]'::jsonb)
  into v_attention
  from (select * from queue order by priority_score desc,due_at asc nulls last,observed_at desc limit 60) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'source_kind','preventive','source_id',w.id,'location_id',w.location_id,'location_name',l.name,
    'title','Verify completed preventive work','detail',concat_ws(' · ',a.name,w.recommendation_action),
    'status',w.verification_status,'completed_at',w.completed_at,'proof_media_id',w.proof_media_id,
    'action_route','/prevention','action_label','Review verification'
  ) order by w.completed_at desc),'[]'::jsonb)
  into v_verification
  from public.business_restroom_preventive_work_orders w
  join public.locations l on l.id=w.location_id
  left join public.amenities a on a.id=w.amenity_id
  where w.business_id=p_business_id and w.status='completed' and coalesce(w.verification_status,'pending')='pending';

  select jsonb_build_object(
    'total_devices',count(*),
    'online_devices',count(*) filter(where status='online'),
    'offline_devices',count(*) filter(where status='offline'),
    'degraded_devices',count(*) filter(where status='degraded'),
    'stale_devices',count(*) filter(where coalesce(last_seen_at,created_at)<now()-interval '30 minutes'),
    'critical_events_24h',(select count(*) from public.smart_device_events e where e.business_id=p_business_id and e.severity='critical' and e.observed_at>=now()-interval '24 hours'),
    'open_commands',(select count(*) from public.smart_device_commands c where c.business_id=p_business_id and c.status in('pending_approval','queued','claimed','dispatched','acknowledged'))
  ) into v_device
  from public.smart_devices d where d.business_id=p_business_id;

  select jsonb_build_object(
    'active_routes',count(*) filter(where r.status in('dispatched','active','in_progress','paused')),
    'planned_routes',count(*) filter(where r.status='planned'),
    'open_alerts',(select count(*) from public.fleet_alerts a where a.business_id=p_business_id and a.status<>'resolved'),
    'late_stops',(select count(*) from public.fleet_route_stops s where s.business_id=p_business_id and s.planned_arrival_at<now() and s.actual_arrived_at is null and s.status not in('completed','skipped','departed')),
    'stalled_stops',(select count(*) from public.fleet_route_stops s where s.business_id=p_business_id and s.actual_service_started_at is not null and s.actual_completed_at is null and now()>s.actual_service_started_at+make_interval(mins=>greatest(10,coalesce(s.planned_dwell_minutes,15))))
  ) into v_fleet
  from public.fleet_routes r where r.business_id=p_business_id;

  select jsonb_build_object(
    'open_remediation',(select count(*) from public.business_restroom_remediation_cases c where c.business_id=p_business_id and c.status in('open','assigned','in_progress')),
    'overdue_remediation',(select count(*) from public.business_restroom_remediation_cases c where c.business_id=p_business_id and c.status in('open','assigned','in_progress') and c.due_at<now()),
    'open_preventive',(select count(*) from public.business_restroom_preventive_work_orders w where w.business_id=p_business_id and w.status in('planned','assigned','in_progress')),
    'overdue_preventive',(select count(*) from public.business_restroom_preventive_work_orders w where w.business_id=p_business_id and w.status in('planned','assigned','in_progress') and w.due_at<now()),
    'verification_pending',(select count(*) from public.business_restroom_preventive_work_orders w where w.business_id=p_business_id and w.status='completed' and coalesce(w.verification_status,'pending')='pending')
  ) into v_service;

  with activity as (
    select e.created_at occurred_at,'network'::text source_kind,e.id source_id,e.location_id,e.event_type title,
      coalesce(e.payload,'{}'::jsonb) evidence
    from public.live_network_events e
    join public.locations l on l.id=e.location_id
    where e.created_at>=v_since and coalesce(l.claimed_business_id,l.business_id)=p_business_id
    union all
    select e.observed_at,'device',e.id,d.location_id,e.event_type,
      jsonb_build_object('severity',e.severity,'metric',e.metric,'value_numeric',e.value_numeric,'value_text',e.value_text,'unit',e.unit,'device_name',d.name)
    from public.smart_device_events e join public.smart_devices d on d.id=e.device_id
    where e.business_id=p_business_id and e.observed_at>=v_since
    union all
    select g.occurred_at,'geofence',g.id,g.location_id,g.event_type,
      jsonb_build_object('dwell_seconds',g.dwell_seconds)
    from public.geofence_events g where g.business_id=p_business_id and g.occurred_at>=v_since
    union all
    select f.occurred_at,'fleet',f.id,null::uuid,f.event_type,
      jsonb_build_object('route_id',f.route_id,'vehicle_id',f.vehicle_id,'value',f.event_value,'unit',f.unit)
    from public.fleet_operational_events f where f.business_id=p_business_id and f.occurred_at>=v_since
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'occurred_at',a.occurred_at,'source_kind',a.source_kind,'source_id',a.source_id,
    'location_id',a.location_id,'title',a.title,'evidence',a.evidence
  ) order by a.occurred_at desc),'[]'::jsonb)
  into v_activity
  from (select * from activity order by occurred_at desc limit 50) a;

  select coalesce(jsonb_agg(to_jsonb(m) order by
    case m.severity when 'high' then 1 when 'elevated' then 2 when 'active' then 3 when 'stable' then 4 else 5 end,
    m.motif_key
  ),'[]'::jsonb) into v_motifs
  from public.live_network_motif_snapshot(p_business_id,v_window) m;

  with delta as (
    select 'Critical device events'::text label,
      (select count(*) from public.smart_device_events where business_id=p_business_id and severity='critical' and observed_at>=v_since)::integer current_value,
      (select count(*) from public.smart_device_events where business_id=p_business_id and severity='critical' and observed_at>=v_previous_since and observed_at<v_since)::integer previous_value
    union all
    select 'Geofence activity',
      (select count(*) from public.geofence_events where business_id=p_business_id and occurred_at>=v_since)::integer,
      (select count(*) from public.geofence_events where business_id=p_business_id and occurred_at>=v_previous_since and occurred_at<v_since)::integer
    union all
    select 'Fleet alerts',
      (select count(*) from public.fleet_alerts where business_id=p_business_id and created_at>=v_since)::integer,
      (select count(*) from public.fleet_alerts where business_id=p_business_id and created_at>=v_previous_since and created_at<v_since)::integer
    union all
    select 'New remediation',
      (select count(*) from public.business_restroom_remediation_cases where business_id=p_business_id and opened_at>=v_since)::integer,
      (select count(*) from public.business_restroom_remediation_cases where business_id=p_business_id and opened_at>=v_previous_since and opened_at<v_since)::integer
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'label',d.label,'current',d.current_value,'previous',d.previous_value,
    'delta',d.current_value-d.previous_value,
    'direction',case when d.current_value>d.previous_value then 'up' when d.current_value<d.previous_value then 'down' else 'flat' end
  )),'[]'::jsonb) into v_changes from delta d;

  v_summary:=jsonb_build_object(
    'attention_count',jsonb_array_length(v_attention),
    'critical_count',(select count(*) from jsonb_array_elements(v_attention) x where x->>'severity'='critical'),
    'overdue_count',coalesce((v_service->>'overdue_remediation')::integer,0)+coalesce((v_service->>'overdue_preventive')::integer,0),
    'verification_pending',coalesce((v_service->>'verification_pending')::integer,0),
    'offline_devices',coalesce((v_device->>'offline_devices')::integer,0),
    'open_fleet_alerts',coalesce((v_fleet->>'open_alerts')::integer,0)
  );

  return jsonb_build_object(
    'business_id',p_business_id,'generated_at',now(),'window_minutes',v_window,
    'summary',v_summary,'attention_queue',v_attention,'verification_queue',v_verification,
    'device_health',v_device,'fleet_summary',v_fleet,'service_summary',v_service,
    'motifs',v_motifs,'activity',v_activity,'what_changed',v_changes
  );
end;
$function$;

revoke all on function public.business_live_ops_command_center(uuid,integer) from public,anon;
grant execute on function public.business_live_ops_command_center(uuid,integer) to authenticated,service_role;
