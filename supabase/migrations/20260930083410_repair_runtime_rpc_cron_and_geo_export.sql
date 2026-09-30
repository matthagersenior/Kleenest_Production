-- Repair live Supabase runtime errors observed on 2026-09-30.
-- This migration is already applied in Production as 20260930083410.

-- Anonymous-safe consumer telemetry: unsigned sessions no-op instead of logging 42501.
revoke all on function public.record_consumer_core_loop_event(text,uuid,text,jsonb) from public;
grant execute on function public.record_consumer_core_loop_event(text,uuid,text,jsonb)
  to anon, authenticated, service_role;

-- Business workspace RPC remains SECURITY INVOKER, but returns an empty set before
-- touching protected tables when there is no authenticated user.
create or replace function public.business_list_workspaces(
  p_include_demo boolean default false
)
returns table(
  id uuid,
  business_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz,
  business_name text,
  name text,
  business_tier text,
  is_demo_test boolean
)
language plpgsql
stable
security invoker
set search_path to ''
as $function$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  with member_rows as (
    select
      b.id,
      b.id as business_id,
      bm.user_id,
      bm.role::text,
      bm.created_at,
      b.name as business_name,
      b.name,
      b.business_tier::text,
      coalesce(b.is_demo_test,false) as is_demo_test
    from public.business_members bm
    join public.businesses b on b.id = bm.business_id
    where bm.user_id = auth.uid()
  ),
  demo_rows as (
    select
      b.id,
      b.id as business_id,
      null::uuid as user_id,
      'owner'::text as role,
      b.created_at,
      b.name as business_name,
      b.name,
      b.business_tier::text,
      coalesce(b.is_demo_test,false) as is_demo_test
    from public.businesses b
    where p_include_demo
      and public.is_platform_owner_session()
      and coalesce(b.is_demo_test,false)
      and b.verification_status::text = 'verified'
  )
  select m.id,m.business_id,m.user_id,m.role,m.created_at,m.business_name,m.name,m.business_tier,m.is_demo_test
  from member_rows m
  union all
  select d.id,d.business_id,d.user_id,d.role,d.created_at,d.business_name,d.name,d.business_tier,d.is_demo_test
  from demo_rows d
  where not exists (
    select 1 from member_rows m where m.business_id=d.business_id
  )
  order by created_at asc;
end;
$function$;

revoke all on function public.business_list_workspaces(boolean) from public;
grant execute on function public.business_list_workspaces(boolean)
  to anon, authenticated, service_role;

-- COALESCE is SQL syntax, not pg_catalog.coalesce().
create or replace function internal.notification_native_push_allowed(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_push boolean := true;
  v_start time without time zone;
  v_end time without time zone;
  v_timezone text;
  v_local_time time without time zone;
begin
  select
    coalesce(np.push,true),
    np.quiet_hours_start,
    np.quiet_hours_end,
    coalesce(np.quiet_hours_timezone,'UTC')
  into v_push,v_start,v_end,v_timezone
  from (select 1) seed
  left join public.notification_preferences np on np.user_id=p_user_id;

  if not coalesce(v_push,true) then return false; end if;
  if v_start is null or v_end is null or v_start = v_end then return true; end if;

  v_local_time := (pg_catalog.now() at time zone v_timezone)::time;
  if v_start < v_end then
    return not (v_local_time >= v_start and v_local_time < v_end);
  end if;
  return not (v_local_time >= v_start or v_local_time < v_end);
end;
$function$;

revoke all on function internal.notification_native_push_allowed(uuid) from public,anon;
grant execute on function internal.notification_native_push_allowed(uuid)
  to authenticated,service_role;

-- The same latent COALESCE bug existed in support submission.
create or replace function public.submit_support_request(
  p_subject text,
  p_message text,
  p_category text default 'general'
)
returns public.support_requests
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_subject text := pg_catalog.btrim(coalesce(p_subject,''));
  v_message text := pg_catalog.btrim(coalesce(p_message,''));
  v_category text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_category,'general')));
  v_request public.support_requests;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if pg_catalog.length(v_subject) < 3 then raise exception 'SUBJECT_TOO_SHORT'; end if;
  if pg_catalog.length(v_subject) > 160 then raise exception 'SUBJECT_TOO_LONG'; end if;
  if pg_catalog.length(v_message) < 10 then raise exception 'MESSAGE_TOO_SHORT'; end if;
  if pg_catalog.length(v_message) > 5000 then raise exception 'MESSAGE_TOO_LONG'; end if;
  if v_category not in ('general','account','billing','technical','safety','feedback') then
    raise exception 'INVALID_SUPPORT_CATEGORY';
  end if;

  insert into public.support_requests(user_id,subject,message,category,status,priority,admin_notes)
  values(v_uid,v_subject,v_message,v_category,'open','normal',null)
  returning * into v_request;

  return v_request;
end;
$function$;

revoke all on function public.submit_support_request(text,text,text) from public,anon;
grant execute on function public.submit_support_request(text,text,text)
  to authenticated,service_role;

-- Allow only a genuine Postgres cron session (or service role / Owner session)
-- to use the scheduled audit path. SECURITY DEFINER does not change session_user.
create or replace function public.run_capability_audit(p_source text default 'manual')
returns public.capability_audit_runs
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v jsonb;
  d jsonb;
  issues jsonb;
  uncatalogued jsonb;
  r public.capability_audit_runs;
  domain_count integer;
  issue_count integer;
  v_trusted_scheduler boolean :=
    session_user = 'postgres'
    or coalesce(auth.jwt()->>'role','') = 'service_role';
begin
  if p_source='scheduled' then
    if not v_trusted_scheduler and not public.is_platform_owner_session() then
      raise exception 'platform owner or service role required' using errcode='42501';
    end if;
  elsif not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;

  v := public._collect_raw_schema_capability_audit();

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
  into d
  from public.check_single_capability_per_domain() x
  where x.issue<>'ok';

  issues :=
    coalesce(v->'contract_violations','[]'::jsonb)
    || coalesce(v->'missing_canonical_rpcs','[]'::jsonb)
    || d;
  uncatalogued := coalesce(v->'uncatalogued_public_rpcs','[]'::jsonb);

  select count(*) into domain_count
  from public.capability_domain_contracts
  where active;

  issue_count := jsonb_array_length(issues);

  insert into public.capability_audit_runs(
    executed_by,source,domain_count,issue_count,
    duplicate_domain_count,uncovered_rpc_count,report
  )
  values(
    auth.uid(),
    coalesce(nullif(p_source,''),'manual'),
    domain_count,
    issue_count,
    coalesce(jsonb_array_length(v->'contract_violations'),0),
    jsonb_array_length(uncatalogued),
    jsonb_build_object('raw_schema',v,'single_capability_issues',d)
  )
  returning * into r;

  return r;
end;
$function$;

revoke all on function public.run_capability_audit(text) from public,anon;
grant execute on function public.run_capability_audit(text)
  to authenticated,service_role;

-- Make incremental geo-catalog export use the watermark instead of scanning/sorting
-- every geocoded location on every poll.
create index if not exists locations_geo_export_updated_id_idx
  on public.locations(updated_at,id)
  where latitude is not null and longitude is not null;
