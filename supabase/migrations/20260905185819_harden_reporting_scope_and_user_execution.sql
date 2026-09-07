create or replace function public.reporting_schedule_scope_authorized(
  p_owner_id uuid,
  p_scope_type text,
  p_scope_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
  select case
    when p_owner_id is null then false
    when public.is_platform_owner(p_owner_id) then true
    when p_scope_type = 'business' and p_scope_id is not null then
      exists (
        select 1
        from public.business_members bm
        where bm.business_id = p_scope_id
          and bm.user_id = p_owner_id
          and lower(bm.role::text) in ('owner','admin','manager','analyst')
      )
      and (
        exists (
          select 1 from public.businesses b
          where b.id = p_scope_id
            and b.business_tier::text in ('growth','enterprise')
        )
        or coalesce((public.get_business_service_entitlement(p_scope_id)->>'service_tier') in ('growth','enterprise'), false)
      )
    when p_scope_type = 'fleet' and p_scope_id is not null then
      exists (
        select 1
        from public.business_members bm
        where bm.business_id = p_scope_id
          and bm.user_id = p_owner_id
          and lower(bm.role::text) in ('owner','admin','manager','fleet_owner','fleet_manager')
      )
    when p_scope_type = 'enterprise' and p_scope_id is not null then
      exists (
        select 1
        from public.enterprise_partner_networks n
        join public.business_members bm on bm.business_id = n.owner_business_id
        where n.id = p_scope_id
          and bm.user_id = p_owner_id
          and lower(bm.role::text) in ('owner','admin','manager','enterprise_owner','enterprise_admin','enterprise_manager')
      )
    else false
  end;
$$;

revoke all on function public.reporting_schedule_scope_authorized(uuid,text,uuid) from public, anon;
grant execute on function public.reporting_schedule_scope_authorized(uuid,text,uuid) to authenticated, service_role;

drop policy if exists reporting_schedules_owner_insert on public.reporting_schedules;
create policy reporting_schedules_owner_insert
on public.reporting_schedules
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and public.reporting_schedule_scope_authorized(owner_id, scope_type, scope_id)
);

create or replace function public.run_due_reporting_schedules(p_requested_by uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  s record;
  r_id uuid;
  payload jsonb;
  period_start timestamptz;
  processed integer := 0;
  next_run timestamptz;
begin
  if p_requested_by is null and session_user not in ('postgres','supabase_admin') then
    raise exception 'internal reporting execution only';
  end if;

  for s in
    select *
    from public.reporting_schedules
    where enabled
      and (next_run_at is null or next_run_at <= now())
      and (p_requested_by is null or owner_id = p_requested_by)
      and public.reporting_schedule_scope_authorized(owner_id, scope_type, scope_id)
    order by next_run_at nulls first
    limit 50
  loop
    if not pg_try_advisory_xact_lock(hashtext('reporting:' || s.id::text)) then
      continue;
    end if;

    period_start := case
      when s.cadence = 'daily' then now() - interval '1 day'
      when s.cadence = 'weekly' then now() - interval '7 days'
      else now() - interval '1 month'
    end;

    insert into public.reporting_runs(schedule_id,status,period_start,period_end)
    values(s.id,'running',period_start,now())
    returning id into r_id;

    begin
      payload := public.reporting_build_payload(s.scope_type,s.scope_id,period_start,now());
      update public.reporting_runs
      set status='sent',report_payload=payload,delivered_to=s.recipients,completed_at=now()
      where id=r_id;

      insert into public.notifications(user_id,type,title,body,data)
      values(
        s.owner_id,
        'scheduled_report',
        s.name,
        'Your ' || s.cadence || ' ' || s.scope_type || ' report is ready.',
        jsonb_build_object('report_run_id',r_id,'scope_type',s.scope_type,'scope_id',s.scope_id,'metrics',payload,'recipients',s.recipients)
      );

      next_run := public.reporting_next_run(s.cadence,s.hour_local,s.timezone,s.day_of_week,s.day_of_month,now());
      update public.reporting_schedules
      set last_run_at=now(),next_run_at=next_run,updated_at=now()
      where id=s.id;
      processed := processed + 1;
    exception when others then
      update public.reporting_runs set status='failed',error=sqlerrm,completed_at=now() where id=r_id;
      update public.reporting_schedules
      set next_run_at=public.reporting_next_run(s.cadence,s.hour_local,s.timezone,s.day_of_week,s.day_of_month,now()+interval '1 hour'),updated_at=now()
      where id=s.id;
    end;
  end loop;

  return jsonb_build_object('processed',processed);
end;
$$;

revoke all on function public.run_due_reporting_schedules(uuid) from public, anon, authenticated;
grant execute on function public.run_due_reporting_schedules(uuid) to service_role;

create or replace function public.run_user_due_reporting_schedules()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  return public.run_due_reporting_schedules(v_user);
end;
$$;

revoke all on function public.run_user_due_reporting_schedules() from public, anon;
grant execute on function public.run_user_due_reporting_schedules() to authenticated, service_role;

create or replace function public.business_reporting_build_payload(
  p_business_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.reporting_schedule_scope_authorized(auth.uid(),'business',p_business_id)
     or not public.business_analytics_authorized(p_business_id) then
    raise exception 'Business Growth or Enterprise reporting access required';
  end if;
  return public.reporting_build_payload('business',p_business_id,p_start,p_end);
end;
$$;

revoke all on function public.business_reporting_build_payload(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.business_reporting_build_payload(uuid,timestamptz,timestamptz) to authenticated, service_role;
