CREATE OR REPLACE FUNCTION public.owner_email_collect_signals()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_owner uuid;
  v_storage jsonb;
  v_audit public.capability_audit_runs%rowtype;
  v_count bigint;
  v_fail bigint;
  v_expired bigint;
  v_pending_reviews bigint;
  v_open_safety bigint;
  v_open_ai bigint;
  v_pending_business bigint;
  v_tasks bigint;
  v_anomalies bigint;
  v_activity bigint;
  v_scheduler_active boolean:=true;
  v_row record;
  v_enqueued integer:=0;
  v_id uuid;
  v_today text:=to_char(now() at time zone 'UTC','YYYY-MM-DD');
  v_week text:=to_char(now() at time zone 'UTC','IYYY-IW');
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required'; end if;

  if not exists(select 1 from public.capability_audit_runs where source='scheduled' and executed_at>=now()-interval '24 hours') then
    select * into v_audit from public.run_capability_audit('scheduled');
  else
    select * into v_audit from public.capability_audit_runs order by executed_at desc limit 1;
  end if;

  select public.national_ingestion_storage_status() into v_storage;
  begin
    select coalesce(j.active,false) into v_scheduler_active from cron.job j where j.jobname='kleenest-national-ingestion' limit 1;
    if not found then v_scheduler_active:=false; end if;
  exception when others then
    v_scheduler_active:=true;
  end;

  select count(*) into v_pending_reviews from public.review_reports where status='pending';
  select count(*) into v_open_safety from public.user_safety_reports where status in ('open','reviewing');
  select count(*) into v_open_ai from public.ai_response_reports where status in ('open','reviewing');
  select count(*) into v_pending_business from public.businesses where verification_status='pending' and not is_demo_test;
  select count(*) into v_tasks from public.beta_report_events where owner_status in ('new','open');
  select count(*) into v_anomalies from (
    select user_id from public.progression_events_v2
    where status='awarded' and created_at>=now()-interval '24 hours'
    group by user_id having count(*)>=50 or sum(xp_awarded)>=5000
  ) q;

  for v_owner in
    select p.id from public.profiles p where coalesce(p.is_platform_owner,false)
  loop
    perform internal.ensure_owner_email_defaults(v_owner);

    for v_row in
      select * from (
        select 'orphan_business_members'::text issue_code,count(*)::bigint issue_count,'critical'::text severity from public.business_members bm left join public.businesses b on b.id=bm.business_id where b.id is null
        union all select 'orphan_business_locations',count(*)::bigint,'critical' from public.locations l left join public.businesses b on b.id=l.business_id where l.business_id is not null and b.id is null
        union all select 'orphan_qr_locations',count(*)::bigint,'critical' from public.qr_codes q left join public.locations l on l.id=q.location_id where q.location_id is not null and l.id is null
        union all select 'orphan_enterprise_campaign_networks',count(*)::bigint,'critical' from public.enterprise_partner_campaigns c left join public.enterprise_partner_networks n on n.id=c.network_id where n.id is null
        union all select 'orphan_enterprise_network_members',count(*)::bigint,'critical' from public.enterprise_partner_network_members m left join public.enterprise_partner_networks n on n.id=m.network_id where n.id is null
        union all select 'orphan_notifications',count(*)::bigint,'warning' from public.notifications n left join public.profiles p on p.id=n.user_id where p.id is null
      ) x where issue_count>0
    loop
      v_id:=internal.owner_email_enqueue(v_owner,'data_integrity',v_row.severity,true,
        'Data integrity issue: '||replace(v_row.issue_code,'_',' '),
        v_row.issue_count||' canonical record'||case when v_row.issue_count=1 then ' is' else 's are' end||' currently inconsistent.',
        'Open KleenestOS Operations to inspect the affected records.',
        jsonb_build_object('issue_code',v_row.issue_code,'issue_count',v_row.issue_count),
        'integrity:'||v_row.issue_code,now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end loop;

    if coalesce((v_storage->>'hard_stop')::boolean,false) or coalesce((v_storage->>'paused')::boolean,false) then
      v_id:=internal.owner_email_enqueue(v_owner,'ingestion_storage',
        case when coalesce((v_storage->>'hard_stop')::boolean,false) then 'critical' else 'warning' end,true,
        case when coalesce((v_storage->>'hard_stop')::boolean,false) then 'Ingestion storage hard stop' else 'Ingestion is paused' end,
        case v_storage->>'pause_reason'
          when 'free_plan_database_hard_stop_85_percent' then 'Ingestion stopped because database usage reached the 85% hard-stop safety threshold.'
          when 'disk_observed_hard_stop_95_percent' then 'Ingestion stopped because observed disk usage reached the 95% hard-stop safety threshold.'
          when 'free_plan_database_pause_70_percent' then 'Ingestion paused because database usage reached the 70% safety threshold.'
          when 'disk_observed_pause_90_percent' then 'Ingestion paused because observed disk usage reached the 90% safety threshold.'
          else 'The storage safety guard paused ingestion.'
        end,
        'Database observed: '||coalesce(v_storage->>'database_percent','?')||'%. Disk observed: '||coalesce(v_storage->>'disk_observed_percent','?')||'%.',
        v_storage,'storage:'||coalesce(v_storage->>'pause_reason','paused'),now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    if not v_scheduler_active and not coalesce((v_storage->>'paused')::boolean,false) and not coalesce((v_storage->>'hard_stop')::boolean,false) then
      v_id:=internal.owner_email_enqueue(v_owner,'ingestion_storage','critical',true,
        'National ingestion scheduler is inactive',
        'The canonical pg_cron job kleenest-national-ingestion is missing or disabled.',
        'Ingestion may stop advancing even if existing runs finish.','{}'::jsonb,'scheduler:inactive',now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    for v_row in
      select id,source_key,status,error,started_at from public.national_ingestion_runs
      where started_at>=now()-interval '15 minutes' and status='failed'
    loop
      v_id:=internal.owner_email_enqueue(v_owner,'ingestion_storage','warning',true,
        'Ingestion run failed: '||v_row.source_key,
        coalesce(v_row.error,'An ingestion run failed without a recorded error message.'),
        'The failure occurred in the last 15 minutes.',
        jsonb_build_object('run_id',v_row.id,'source_key',v_row.source_key),
        'ingestion-run:'||v_row.id::text,v_row.started_at);
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end loop;

    for v_row in
      select id,status,error,created_at from public.reporting_runs
      where created_at>=now()-interval '15 minutes' and lower(status) in ('failed','error')
    loop
      v_id:=internal.owner_email_enqueue(v_owner,'automation_delivery','warning',true,
        'Reporting automation failed',
        coalesce(v_row.error,'A reporting run failed.'),
        'KleenestOS recorded a failed reporting run that may require attention.',
        jsonb_build_object('reporting_run_id',v_row.id),'reporting-run:'||v_row.id::text,v_row.created_at);
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end loop;

    select count(*) filter(where status='failed'),count(*) filter(where status='expired')
      into v_fail,v_expired
    from public.notification_native_push_deliveries
    where created_at>=now()-interval '24 hours';
    if coalesce(v_fail,0)+coalesce(v_expired,0)>0 then
      v_id:=internal.owner_email_enqueue(v_owner,'automation_delivery',
        case when coalesce(v_fail,0)+coalesce(v_expired,0)>=25 then 'warning' else 'info' end,
        coalesce(v_fail,0)+coalesce(v_expired,0)>=25,
        'Notification delivery health needs review',
        (coalesce(v_fail,0)+coalesce(v_expired,0))||' native push deliver'||case when coalesce(v_fail,0)+coalesce(v_expired,0)=1 then 'y has' else 'ies have' end||' failed or expired in the last 24 hours.',
        'Routine delivery issues stay in the daily digest unless volume becomes material.',
        jsonb_build_object('failed',v_fail,'expired',v_expired),
        'native-push:'||v_today,now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    if v_pending_reviews+v_open_safety+v_open_ai>0 then
      v_id:=internal.owner_email_enqueue(v_owner,'moderation_safety','info',false,
        'Trust & safety queue update',
        (v_pending_reviews+v_open_safety+v_open_ai)||' moderation or safety item'||case when v_pending_reviews+v_open_safety+v_open_ai=1 then ' is' else 's are' end||' waiting for review.',
        'Review reports: '||v_pending_reviews||'. User safety: '||v_open_safety||'. AI response reports: '||v_open_ai||'.',
        jsonb_build_object('review_reports',v_pending_reviews,'user_safety',v_open_safety,'ai_reports',v_open_ai),
        'moderation:'||v_today,now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    for v_row in
      select id,reason,details,created_at from public.user_safety_reports
      where created_at>=now()-interval '15 minutes' and status='open'
    loop
      v_id:=internal.owner_email_enqueue(v_owner,'moderation_safety','warning',true,
        'New user safety report',
        coalesce(v_row.reason,'A user safety report was opened.'),
        coalesce(v_row.details,'Open Trust & Moderation for details.'),
        jsonb_build_object('report_id',v_row.id),'user-safety:'||v_row.id::text,v_row.created_at);
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end loop;

    if v_tasks>0 then
      v_id:=internal.owner_email_enqueue(v_owner,'tasks','info',false,
        'Owner work queue update',
        v_tasks||' beta incident or owner task'||case when v_tasks=1 then ' is' else 's are' end||' waiting.',
        'Open the Owner app to review the active queue.',
        jsonb_build_object('open_items',v_tasks),'tasks:'||v_today,now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    if v_audit.id is not null then
      v_id:=internal.owner_email_enqueue(v_owner,'audits',
        case when v_audit.issue_count>0 then 'warning' else 'info' end,
        v_audit.issue_count>0,
        case when v_audit.issue_count>0 then 'Audit found issues' else 'Weekly audit status' end,
        case when v_audit.issue_count>0 then v_audit.issue_count||' capability audit issue'||case when v_audit.issue_count=1 then ' was' else 's were' end||' found.' else 'No capability contract issues were found in the latest scheduled audit.' end,
        'Duplicate domains: '||v_audit.duplicate_domain_count||'. Uncovered RPCs: '||v_audit.uncovered_rpc_count||'.',
        jsonb_build_object('audit_run_id',v_audit.id,'issue_count',v_audit.issue_count,'duplicate_domain_count',v_audit.duplicate_domain_count,'uncovered_rpc_count',v_audit.uncovered_rpc_count),
        'audit-week:'||v_week,v_audit.executed_at);
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    select count(*) into v_activity
    from public.platform_owner_control_audit
    where created_at>=now()-interval '24 hours' and domain<>'owner_email_notifications';
    if v_activity>0 then
      v_id:=internal.owner_email_enqueue(v_owner,'owner_activity','info',false,
        'Owner control-plane activity',
        v_activity||' audited owner/admin control change'||case when v_activity=1 then ' occurred' else 's occurred' end||' in the last 24 hours.',
        'Routine administrative activity is grouped into the daily digest.',
        jsonb_build_object('changes_24h',v_activity),'owner-activity:'||v_today,now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    for v_row in
      select id,domain,action,target_key,reason,created_at
      from public.platform_owner_control_audit
      where created_at>=now()-interval '15 minutes'
        and domain in ('access','people','auth','security','users')
        and (action ~* '(revoke|disable|delete|admin|owner|role|access|security)')
    loop
      v_id:=internal.owner_email_enqueue(v_owner,'security_access','warning',true,
        'Security/access control changed',
        coalesce(v_row.reason,v_row.domain||' · '||v_row.action),
        'Target: '||coalesce(v_row.target_key,'unspecified')||'.',
        jsonb_build_object('audit_id',v_row.id,'domain',v_row.domain,'action',v_row.action),
        'access-change:'||v_row.id::text,v_row.created_at);
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end loop;

    if v_pending_business>0 then
      v_id:=internal.owner_email_enqueue(v_owner,'business_network','info',false,
        'Business network queue update',
        v_pending_business||' business verification item'||case when v_pending_business=1 then ' is' else 's are' end||' pending.',
        'Routine business administration stays in the daily digest.',
        jsonb_build_object('pending_businesses',v_pending_business),'business-network:'||v_today,now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    if v_anomalies>0 then
      v_id:=internal.owner_email_enqueue(v_owner,'economy_anomalies','warning',true,
        'Progression economy anomaly detected',
        v_anomalies||' account'||case when v_anomalies=1 then ' has' else 's have' end||' unusually high XP/event velocity in the last 24 hours.',
        'Threshold: at least 50 awarded events or 5,000 XP in 24 hours.',
        jsonb_build_object('anomaly_accounts',v_anomalies),'economy-anomaly:'||v_today,now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;
  end loop;

  return jsonb_build_object('enqueued_or_updated',v_enqueued,'collected_at',now());
end
$function$
;
update public.owner_email_notification_events
set reason=case details->>'pause_reason'
  when 'free_plan_database_hard_stop_85_percent' then 'Ingestion stopped because database usage reached the 85% hard-stop safety threshold.'
  when 'disk_observed_hard_stop_95_percent' then 'Ingestion stopped because observed disk usage reached the 95% hard-stop safety threshold.'
  when 'free_plan_database_pause_70_percent' then 'Ingestion paused because database usage reached the 70% safety threshold.'
  when 'disk_observed_pause_90_percent' then 'Ingestion paused because observed disk usage reached the 90% safety threshold.'
  else reason
end,
updated_at=now()
where source_key='ingestion_storage'
  and details ? 'pause_reason'
  and status in ('queued','sending','failed');
