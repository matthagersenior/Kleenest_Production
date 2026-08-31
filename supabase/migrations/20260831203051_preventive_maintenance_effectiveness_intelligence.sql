create or replace function public.business_restroom_preventive_effectiveness(p_business_id uuid,p_days integer default 180)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); v_days integer:=greatest(30,least(coalesce(p_days,180),365)); v_summary jsonb; v_rows jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=uid) then raise exception 'Business membership required'; end if;
 with base as (
   select w.*,l.name location_name,a.name amenity_name,
     case when w.verified_at is not null and w.completed_at is not null then round((extract(epoch from (w.verified_at-w.completed_at))/3600.0)::numeric,1) end verification_lag_hours,
     (select min(o.observed_at) from public.location_amenity_observations o
       where o.location_id=w.location_id and o.amenity_id=w.amenity_id and o.status='absent'
         and w.verified_at is not null and o.observed_at>w.verified_at
         and o.id is distinct from w.verification_observation_id) recurrence_at
   from public.business_restroom_preventive_work_orders w
   join public.locations l on l.id=w.location_id
   join public.amenities a on a.id=w.amenity_id
   where w.business_id=p_business_id and w.status='completed'
     and w.completed_at>=now()-make_interval(days=>v_days)
 ), scored as (
   select b.*,
     case
       when b.verification_status='failed' then 'failed_verification'
       when b.verification_status='pending' then 'pending_verification'
       when b.verification_status='effective' and b.recurrence_at is not null and b.recurrence_at<=b.verified_at+interval '30 days' then 'recurrence_detected'
       when b.verification_status='effective' and b.verified_at<=now()-interval '30 days' then 'durable_30d'
       when b.verification_status='effective' then 'holding_so_far'
       else 'unverified_completed'
     end effectiveness_state,
     case
       when b.verification_status='failed' then 20
       when b.verification_status='pending' then 45
       when b.verification_status='effective' and b.recurrence_at is not null and b.recurrence_at<=b.verified_at+interval '7 days' then 25
       when b.verification_status='effective' and b.recurrence_at is not null and b.recurrence_at<=b.verified_at+interval '30 days' then 45
       when b.verification_status='effective' and b.verified_at<=now()-interval '30 days' then 100
       when b.verification_status='effective' then 80
       else 40
     end intervention_score,
     case
       when b.verification_status='failed' then now()
       when b.verification_status='pending' then least(now()+interval '12 hours',b.completed_at+interval '24 hours')
       when b.verification_status='effective' and b.recurrence_at is not null and b.recurrence_at<=b.verified_at+interval '30 days' then now()
       when b.verification_status='effective' and b.verified_at<=now()-interval '30 days' then b.verified_at+interval '60 days'
       when b.verification_status='effective' then b.verified_at+interval '30 days'
       else b.completed_at+interval '24 hours'
     end recommended_next_check_at
   from base b
 ), agg as (
   select count(*)::int completed,
     count(*) filter(where verification_status in('effective','failed'))::int independently_verified,
     count(*) filter(where verification_status='pending')::int awaiting_verification,
     count(*) filter(where verification_status='effective')::int effective,
     count(*) filter(where verification_status='failed')::int failed,
     count(*) filter(where verification_status='effective' and recurrence_at is not null and recurrence_at<=verified_at+interval '7 days')::int recurrence_7d,
     count(*) filter(where verification_status='effective' and recurrence_at is not null and recurrence_at<=verified_at+interval '30 days')::int recurrence_30d,
     count(*) filter(where effectiveness_state='durable_30d')::int durable_30d,
     round(avg(verification_lag_hours),1) average_verification_lag_hours,
     round(avg(intervention_score),1) average_intervention_score
   from scored
 )
 select jsonb_build_object(
   'completed',completed,'independently_verified',independently_verified,'awaiting_verification',awaiting_verification,
   'effective',effective,'failed',failed,'recurrence_7d',recurrence_7d,'recurrence_30d',recurrence_30d,'durable_30d',durable_30d,
   'verification_rate_pct',case when completed>0 then round(100.0*independently_verified/completed,1) else 0 end,
   'effective_rate_pct',case when independently_verified>0 then round(100.0*effective/independently_verified,1) else 0 end,
   'recurrence_rate_30d_pct',case when effective>0 then round(100.0*recurrence_30d/effective,1) else 0 end,
   'average_verification_lag_hours',average_verification_lag_hours,'average_intervention_score',average_intervention_score
 ) into v_summary from agg;
 select coalesce(jsonb_agg(jsonb_build_object(
   'work_order_id',id,'location_id',location_id,'location_name',location_name,'amenity_id',amenity_id,'amenity_name',amenity_name,
   'recommendation_action',recommendation_action,'priority',priority,'completed_at',completed_at,'verification_status',verification_status,
   'verification_outcome',verification_outcome,'verified_at',verified_at,'verification_lag_hours',verification_lag_hours,
   'recurrence_at',recurrence_at,'recurrence_within_7d',coalesce(recurrence_at<=verified_at+interval '7 days',false),
   'recurrence_within_30d',coalesce(recurrence_at<=verified_at+interval '30 days',false),'effectiveness_state',effectiveness_state,
   'intervention_score',intervention_score,'recommended_next_check_at',recommended_next_check_at,'followup_work_order_id',followup_work_order_id
 ) order by case effectiveness_state when 'failed_verification' then 0 when 'recurrence_detected' then 1 when 'pending_verification' then 2 when 'holding_so_far' then 3 when 'durable_30d' then 4 else 5 end,recommended_next_check_at asc nulls last),'[]'::jsonb) into v_rows from scored;
 return jsonb_build_object('business_id',p_business_id,'window_days',v_days,'summary',coalesce(v_summary,'{}'::jsonb),'interventions',coalesce(v_rows,'[]'::jsonb),'generated_at',now());
end $$;

create or replace function public.fleet_restroom_prevention_effectiveness(p_business_id uuid,p_days integer default 180)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); v_result jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not public.business_fleet_authorized(p_business_id) then raise exception 'Fleet access is not enabled for this business'; end if;
 v_result:=public.business_restroom_preventive_effectiveness(p_business_id,p_days);
 return v_result||jsonb_build_object('fleet_priority','failed_or_recurrent_first');
end $$;

create or replace function public.get_location_preventive_maintenance_status(p_location_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
with w as(select * from public.business_restroom_preventive_work_orders where location_id=p_location_id), latest_effective as(
 select w1.*,(select min(o.observed_at) from public.location_amenity_observations o where o.location_id=w1.location_id and o.amenity_id=w1.amenity_id and o.status='absent' and w1.verified_at is not null and o.observed_at>w1.verified_at and o.id is distinct from w1.verification_observation_id) recurrence_at
 from w w1 where w1.verification_status='effective' order by w1.verified_at desc nulls last limit 1
), agg as(
 select count(*) filter(where status in('planned','assigned','in_progress'))::int active,
        count(*) filter(where status='completed')::int completed,
        count(*) filter(where status='completed' and verification_status='pending')::int awaiting_verification,
        count(*) filter(where status='completed' and verification_status='effective')::int verified_effective,
        count(*) filter(where status='completed' and verification_status='failed')::int failed_verification,
        max(completed_at) filter(where status='completed') latest_completed_at,max(verified_at) latest_verified_at,max(created_at) latest_created_at from w)
select jsonb_build_object('location_id',p_location_id,'active_preventive_work',agg.active,'completed_preventive_work',agg.completed,'awaiting_verification',agg.awaiting_verification,'verified_effective',agg.verified_effective,'failed_verification',agg.failed_verification,'latest_completed_at',agg.latest_completed_at,'latest_verified_at',agg.latest_verified_at,'latest_created_at',agg.latest_created_at,
 'latest_effective_work_order_id',(select id from latest_effective),'latest_effective_amenity_id',(select amenity_id from latest_effective),'recurrence_after_latest_effective_at',(select recurrence_at from latest_effective),
 'maintenance_effectiveness_state',case when (select recurrence_at from latest_effective) is not null and (select recurrence_at from latest_effective)<=(select verified_at from latest_effective)+interval '30 days' then 'recurrence_detected' when (select verified_at from latest_effective) is not null and (select verified_at from latest_effective)<=now()-interval '30 days' then 'durable_30d' when (select verified_at from latest_effective) is not null then 'holding_so_far' when agg.failed_verification>0 then 'failed_verification' when agg.awaiting_verification>0 then 'pending_verification' else 'no_verified_prevention' end,
 'maintenance_state',case when agg.failed_verification>0 and agg.active>0 then 'followup_required' when agg.awaiting_verification>0 then 'awaiting_independent_verification' when agg.active>0 then 'prevention_active' when agg.verified_effective>0 then 'independently_verified_history' when agg.completed>0 then 'preventive_history' else 'none' end) from agg $$;

revoke all on function public.business_restroom_preventive_effectiveness(uuid,integer) from public,anon;
grant execute on function public.business_restroom_preventive_effectiveness(uuid,integer) to authenticated,service_role;
revoke all on function public.fleet_restroom_prevention_effectiveness(uuid,integer) from public,anon;
grant execute on function public.fleet_restroom_prevention_effectiveness(uuid,integer) to authenticated,service_role;
revoke all on function public.get_location_preventive_maintenance_status(uuid) from public;
grant execute on function public.get_location_preventive_maintenance_status(uuid) to anon,authenticated,service_role;
