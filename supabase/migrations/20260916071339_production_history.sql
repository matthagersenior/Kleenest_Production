CREATE OR REPLACE FUNCTION internal.owner_email_enqueue(p_owner uuid, p_source_key text, p_severity text, p_noteworthy boolean, p_title text, p_reason text, p_body text, p_details jsonb, p_dedupe_key text, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rule public.owner_email_notification_rules%rowtype;
  v_settings public.owner_email_notification_settings%rowtype;
  v_existing uuid;
  v_cadence text;
  v_delivery timestamptz;
  v_immediate_count integer;
  v_id uuid;
begin
  perform internal.ensure_owner_email_defaults(p_owner);

  select * into v_rule
  from public.owner_email_notification_rules
  where owner_user_id=p_owner and source_key=p_source_key and enabled
  limit 1;

  if v_rule.id is null then return null; end if;
  if internal.owner_email_severity_rank(p_severity) < internal.owner_email_severity_rank(v_rule.severity_floor) then
    return null;
  end if;

  select * into v_settings from public.owner_email_notification_settings where owner_user_id=p_owner;
  if not coalesce(v_settings.enabled,false) or nullif(trim(coalesce(v_settings.recipient_email,'')),'') is null then
    return null;
  end if;

  select e.id into v_existing
  from public.owner_email_notification_events e
  where e.owner_user_id=p_owner
    and e.source_key=p_source_key
    and e.dedupe_key=p_dedupe_key
    and e.created_at>=now()-make_interval(mins=>v_rule.dedupe_window_minutes)
    and e.status in ('queued','sending','sent','failed')
  order by e.created_at desc
  limit 1;

  if v_existing is not null then
    update public.owner_email_notification_events
      set last_occurred_at=greatest(last_occurred_at,p_occurred_at),
          severity=case when internal.owner_email_severity_rank(p_severity)>internal.owner_email_severity_rank(severity) then p_severity else severity end,
          noteworthy=noteworthy or coalesce(p_noteworthy,false),
          details=coalesce(details,'{}'::jsonb)||coalesce(p_details,'{}'::jsonb),
          updated_at=now()
    where id=v_existing and status in ('queued','sending','failed');
    return v_existing;
  end if;

  v_cadence := v_rule.cadence;
  if coalesce(p_noteworthy,false) and v_rule.noteworthy_immediate and internal.owner_email_severity_rank(p_severity)>=2 then
    v_cadence:='immediate';
  end if;

  if v_cadence='immediate' then
    select count(*) into v_immediate_count
    from public.owner_email_notification_events
    where owner_user_id=p_owner
      and effective_cadence='immediate'
      and created_at>=now()-interval '1 hour'
      and status in ('queued','sending','sent');
    if v_immediate_count>=v_settings.max_immediate_per_hour then
      v_cadence:='hourly';
    end if;
  end if;

  v_delivery:=internal.owner_email_next_delivery(
    v_cadence,v_settings.timezone,v_settings.daily_digest_hour,
    v_settings.weekly_digest_dow,v_settings.weekly_digest_hour
  );

  insert into public.owner_email_notification_events(
    owner_user_id,rule_id,source_key,category,severity,noteworthy,title,reason,body,details,
    dedupe_key,first_occurred_at,last_occurred_at,effective_cadence,delivery_after
  ) values(
    p_owner,v_rule.id,p_source_key,v_rule.category,p_severity,coalesce(p_noteworthy,false),
    left(p_title,180),left(p_reason,1200),left(coalesce(p_body,''),4000),coalesce(p_details,'{}'::jsonb),
    left(p_dedupe_key,240),p_occurred_at,p_occurred_at,v_cadence,v_delivery
  ) returning id into v_id;

  return v_id;
end
$function$
;
update public.owner_email_notification_events
set occurrences=1
where occurrences<>1 and status in ('queued','suppressed','failed');
