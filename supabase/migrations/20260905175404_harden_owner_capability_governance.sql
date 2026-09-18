create table if not exists public.capability_domain_governance_log (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  changed_by uuid null,
  reason text null,
  previous_state jsonb not null default '{}'::jsonb,
  next_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.capability_domain_governance_log enable row level security;
revoke all on table public.capability_domain_governance_log from public, anon;
grant select on table public.capability_domain_governance_log to authenticated;
drop policy if exists capability_domain_governance_owner_read on public.capability_domain_governance_log;
create policy capability_domain_governance_owner_read on public.capability_domain_governance_log
for select to authenticated using (public.is_platform_owner_session());

create or replace function public.check_single_capability_per_domain()
returns table(domain text, canonical_capability text, canonical_rpc text, issue text)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  return query
  select c.domain, c.canonical_capability, c.canonical_rpc,
         case
           when not c.active then 'inactive_contract'
           when not exists (
             select 1 from pg_catalog.pg_proc p
             join pg_catalog.pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname=c.canonical_rpc
           ) then 'missing_canonical_rpc'
           else 'ok'
         end
  from public.capability_domain_contracts c
  where c.active
  union all
  select c.domain, null::text, null::text, 'duplicate_domain_contract'
  from public.capability_domain_contracts c
  join (
    select d.domain from public.capability_domain_contracts d
    where d.active group by d.domain having count(*)>1
  ) dup using(domain)
  where c.active;
end;
$$;
revoke all on function public.check_single_capability_per_domain() from public, anon;
grant execute on function public.check_single_capability_per_domain() to authenticated, service_role;

create or replace function public.capability_retirement_audit(p_limit integer default 200)
returns table(function_signature text, domain text, classification text, db_dependency_count bigint, db_dependents text[], retirement_state text)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  return query
  with classified as (
    select p.oid, p.oid::regprocedure::text as signature, c.domain, c.classification
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    join public.capability_function_classifications c on c.function_signature=p.oid::regprocedure::text
    where n.nspname='public' and p.prokind='f'
  ), compat as (
    select * from classified where classification in ('compatibility','legacy')
  ), dep as (
    select c.oid,
           count(distinct d.classid::text||':'||d.objid::text||':'||d.objsubid::text) filter (where d.objid<>c.oid) as dep_count,
           array_remove(array_agg(distinct pg_catalog.pg_describe_object(d.classid,d.objid,d.objsubid)) filter (where d.objid<>c.oid),null) as dependents
    from compat c
    left join pg_catalog.pg_depend d on d.refclassid='pg_proc'::regclass and d.refobjid=c.oid and d.deptype in ('n','a')
    group by c.oid
  )
  select c.signature,c.domain,c.classification,
         coalesce(d.dep_count,0),coalesce(d.dependents,array[]::text[]),
         case when coalesce(d.dep_count,0)>0 then 'blocked_db_dependency' else 'candidate_pending_app_caller_audit' end
  from compat c
  left join dep d on d.oid=c.oid
  order by case when coalesce(d.dep_count,0)>0 then 0 else 1 end,c.domain,c.signature
  limit greatest(1,least(coalesce(p_limit,200),1000));
end;
$$;
revoke all on function public.capability_retirement_audit(integer) from public, anon;
grant execute on function public.capability_retirement_audit(integer) to authenticated, service_role;

create or replace function public.run_capability_audit(p_source text default 'manual')
returns public.capability_audit_runs
language plpgsql
security definer
set search_path=''
as $$
declare
  v jsonb;
  d jsonb;
  issues jsonb;
  uncatalogued jsonb;
  r public.capability_audit_runs;
  domain_count integer;
  issue_count integer;
  v_service_role boolean := coalesce(auth.role(),'')='service_role';
begin
  if p_source='scheduled' then
    if not v_service_role and not public.is_platform_owner_session() then
      raise exception 'platform owner or service role required' using errcode='42501';
    end if;
  elsif not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  v := public._collect_raw_schema_capability_audit();
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into d
  from public.check_single_capability_per_domain() x where x.issue<>'ok';
  issues := coalesce(v->'contract_violations','[]'::jsonb) || coalesce(v->'missing_canonical_rpcs','[]'::jsonb) || d;
  uncatalogued := coalesce(v->'uncatalogued_public_rpcs','[]'::jsonb);
  select count(*) into domain_count from public.capability_domain_contracts where active;
  issue_count := jsonb_array_length(issues);
  insert into public.capability_audit_runs(executed_by,source,domain_count,issue_count,duplicate_domain_count,uncovered_rpc_count,report)
  values(auth.uid(),coalesce(nullif(p_source,''),'manual'),domain_count,issue_count,coalesce(jsonb_array_length(v->'contract_violations'),0),jsonb_array_length(uncatalogued),jsonb_build_object('raw_schema',v,'single_capability_issues',d))
  returning * into r;
  return r;
end;
$$;
revoke all on function public.run_capability_audit(text) from public, anon;
grant execute on function public.run_capability_audit(text) to authenticated, service_role;

create or replace function public.owner_capability_domain_contracts()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,
    'domain',c.domain,
    'canonical_capability',c.canonical_capability,
    'canonical_rpc',c.canonical_rpc,
    'owner_surface',c.owner_surface,
    'owner_workspace',c.owner_workspace,
    'owner_route',c.owner_route,
    'active',c.active,
    'exposure_state',c.exposure_state,
    'release_state',c.release_state,
    'requires_surface',c.requires_surface,
    'source_repos',c.source_repos,
    'notes',c.notes,
    'rpc_exists',exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=c.canonical_rpc),
    'authenticated_execute',exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=c.canonical_rpc and has_function_privilege('authenticated',p.oid,'EXECUTE')),
    'anon_execute',exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=c.canonical_rpc and has_function_privilege('anon',p.oid,'EXECUTE')),
    'updated_at',c.updated_at
  ) order by c.domain),'[]'::jsonb) into v_result
  from public.capability_domain_contracts c;
  return v_result;
end;
$$;
revoke all on function public.owner_capability_domain_contracts() from public, anon;
grant execute on function public.owner_capability_domain_contracts() to authenticated, service_role;

create or replace function public.owner_update_capability_domain_contract(
  p_domain text,
  p_patch jsonb,
  p_reason text default 'KleenestOS capability governance update'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_patch jsonb := coalesce(p_patch,'{}'::jsonb);
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  if coalesce(nullif(trim(p_domain),''),'')='' then raise exception 'domain is required'; end if;
  if exists(select 1 from jsonb_object_keys(v_patch) k where k not in ('active','owner_surface','owner_workspace','owner_route','exposure_state','release_state','requires_surface','notes')) then
    raise exception 'unsupported capability governance field';
  end if;
  if v_patch ? 'exposure_state' and coalesce(v_patch->>'exposure_state','') not in ('surface','server-support','shared-service','release-gated') then
    raise exception 'invalid exposure state';
  end if;
  if v_patch ? 'release_state' and coalesce(v_patch->>'release_state','') not in ('enabled','internal-only','mixed','play-gated','disabled','retired') then
    raise exception 'invalid release state';
  end if;
  select to_jsonb(c) into v_before from public.capability_domain_contracts c where c.domain=p_domain limit 1 for update;
  if v_before is null then raise exception 'unknown capability domain'; end if;
  update public.capability_domain_contracts c set
    active=case when v_patch ? 'active' then (v_patch->>'active')::boolean else c.active end,
    owner_surface=case when v_patch ? 'owner_surface' then coalesce(nullif(trim(v_patch->>'owner_surface'),''),c.owner_surface) else c.owner_surface end,
    owner_workspace=case when v_patch ? 'owner_workspace' then nullif(trim(v_patch->>'owner_workspace'),'') else c.owner_workspace end,
    owner_route=case when v_patch ? 'owner_route' then nullif(trim(v_patch->>'owner_route'),'') else c.owner_route end,
    exposure_state=case when v_patch ? 'exposure_state' then v_patch->>'exposure_state' else c.exposure_state end,
    release_state=case when v_patch ? 'release_state' then v_patch->>'release_state' else c.release_state end,
    requires_surface=case when v_patch ? 'requires_surface' then (v_patch->>'requires_surface')::boolean else c.requires_surface end,
    notes=case when v_patch ? 'notes' then nullif(trim(v_patch->>'notes'),'') else c.notes end,
    updated_at=now()
  where c.domain=p_domain;
  select to_jsonb(c) into v_after from public.capability_domain_contracts c where c.domain=p_domain limit 1;
  insert into public.capability_domain_governance_log(domain,changed_by,reason,previous_state,next_state)
  values(p_domain,auth.uid(),nullif(trim(p_reason),''),v_before,v_after);
  return v_after;
end;
$$;
revoke all on function public.owner_update_capability_domain_contract(text,jsonb,text) from public, anon;
grant execute on function public.owner_update_capability_domain_contract(text,jsonb,text) to authenticated, service_role;
