create table if not exists public.beta_incidents (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  app_surface text not null,
  category text not null,
  title text not null,
  status text not null default 'new'
    check (status in ('new','reproduced','investigating','fixed','shipped')),
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_route text,
  last_app_version text,
  last_runtime_version text,
  last_error text,
  sample_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.beta_report_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.beta_incidents(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  session_id text not null,
  report_kind text not null check (report_kind in ('manual','automatic')),
  category text not null,
  message text not null,
  route text,
  app_surface text not null,
  app_version text,
  runtime_version text,
  update_id text,
  platform text,
  platform_version text,
  metadata jsonb not null default '{}'::jsonb,
  breadcrumbs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists beta_incidents_last_seen_idx
  on public.beta_incidents(last_seen desc);
create index if not exists beta_incidents_status_last_seen_idx
  on public.beta_incidents(status,last_seen desc);
create index if not exists beta_report_events_incident_created_idx
  on public.beta_report_events(incident_id,created_at desc);
create index if not exists beta_report_events_user_created_idx
  on public.beta_report_events(user_id,created_at desc)
  where user_id is not null;

alter table public.beta_incidents enable row level security;
alter table public.beta_report_events enable row level security;

revoke all on table public.beta_incidents from public, anon, authenticated;
revoke all on table public.beta_report_events from public, anon, authenticated;

create or replace function public.submit_beta_report(
  p_fingerprint text,
  p_app_surface text,
  p_report_kind text,
  p_category text,
  p_message text,
  p_session_id text,
  p_route text default null,
  p_app_version text default null,
  p_runtime_version text default null,
  p_update_id text default null,
  p_platform text default null,
  p_platform_version text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_breadcrumbs jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_fingerprint text := left(trim(coalesce(p_fingerprint,'')),200);
  v_surface text := lower(left(trim(coalesce(p_app_surface,'')),40));
  v_kind text := lower(trim(coalesce(p_report_kind,'')));
  v_category text := lower(left(trim(coalesce(p_category,'')),40));
  v_message text := left(trim(coalesce(p_message,'')),4000);
  v_session text := left(trim(coalesce(p_session_id,'')),160);
  v_route text := nullif(left(trim(coalesce(p_route,'')),500),'');
  v_metadata jsonb := case when jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))='object' then coalesce(p_metadata,'{}'::jsonb) else '{}'::jsonb end;
  v_breadcrumbs jsonb := case when jsonb_typeof(coalesce(p_breadcrumbs,'[]'::jsonb))='array' then coalesce(p_breadcrumbs,'[]'::jsonb) else '[]'::jsonb end;
  v_incident public.beta_incidents;
  v_is_new boolean := false;
  v_error text;
begin
  if length(v_fingerprint) < 6 then raise exception 'BETA_REPORT_FINGERPRINT_REQUIRED'; end if;
  if v_surface not in ('consumer','business','fleet','owner','web') then raise exception 'BETA_REPORT_APP_SURFACE_INVALID'; end if;
  if v_kind not in ('manual','automatic') then raise exception 'BETA_REPORT_KIND_INVALID'; end if;
  if v_category not in ('bug','glitch','network','data','performance','feedback','crash','other') then raise exception 'BETA_REPORT_CATEGORY_INVALID'; end if;
  if length(v_message) < 1 then raise exception 'BETA_REPORT_MESSAGE_REQUIRED'; end if;
  if length(v_session) < 6 then raise exception 'BETA_REPORT_SESSION_REQUIRED'; end if;
  if jsonb_array_length(v_breadcrumbs) > 60 then
    v_breadcrumbs := (
      select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)
      from jsonb_array_elements(v_breadcrumbs) with ordinality
      where ordinality > jsonb_array_length(v_breadcrumbs) - 60
    );
  end if;

  v_error := nullif(left(coalesce(v_metadata->>'error',''),1200),'');

  select *
  into v_incident
  from public.beta_incidents
  where fingerprint=v_fingerprint
  for update;

  if found then
    update public.beta_incidents
    set occurrence_count=occurrence_count+1,
        last_seen=now(),
        last_route=coalesce(v_route,last_route),
        last_app_version=coalesce(nullif(p_app_version,''),last_app_version),
        last_runtime_version=coalesce(nullif(p_runtime_version,''),last_runtime_version),
        last_error=coalesce(v_error,last_error),
        sample_metadata=v_metadata,
        status=case when status in ('fixed','shipped') then 'reproduced' else status end,
        updated_at=now()
    where id=v_incident.id
    returning * into v_incident;
  else
    begin
      insert into public.beta_incidents(
        fingerprint,app_surface,category,title,status,occurrence_count,
        first_seen,last_seen,last_route,last_app_version,last_runtime_version,last_error,sample_metadata
      )
      values(
        v_fingerprint,v_surface,v_category,
        left(initcap(v_category)||' · '||coalesce(v_route,v_surface),180),
        'new',1,now(),now(),v_route,nullif(p_app_version,''),nullif(p_runtime_version,''),v_error,v_metadata
      )
      returning * into v_incident;
      v_is_new := true;
    exception when unique_violation then
      update public.beta_incidents
      set occurrence_count=occurrence_count+1,
          last_seen=now(),
          last_route=coalesce(v_route,last_route),
          last_app_version=coalesce(nullif(p_app_version,''),last_app_version),
          last_runtime_version=coalesce(nullif(p_runtime_version,''),last_runtime_version),
          last_error=coalesce(v_error,last_error),
          sample_metadata=v_metadata,
          status=case when status in ('fixed','shipped') then 'reproduced' else status end,
          updated_at=now()
      where fingerprint=v_fingerprint
      returning * into v_incident;
    end;
  end if;

  insert into public.beta_report_events(
    incident_id,user_id,session_id,report_kind,category,message,route,app_surface,
    app_version,runtime_version,update_id,platform,platform_version,metadata,breadcrumbs
  )
  values(
    v_incident.id,v_uid,v_session,v_kind,v_category,v_message,v_route,v_surface,
    nullif(p_app_version,''),nullif(p_runtime_version,''),nullif(p_update_id,''),
    nullif(p_platform,''),nullif(p_platform_version,''),v_metadata,v_breadcrumbs
  );

  if v_is_new then
    insert into public.notifications(user_id,type,title,body,data)
    select
      p.id,
      'beta_incident',
      'New beta incident',
      left(initcap(v_category)||' · '||coalesce(v_route,v_surface),180),
      jsonb_build_object(
        'beta_incident_id',v_incident.id,
        'app_surface',v_surface,
        'category',v_category,
        'route',v_route,
        'occurrence_count',v_incident.occurrence_count
      )
    from public.profiles p
    where coalesce(p.is_platform_owner,false)
       or coalesce(p.is_admin,false)
       or lower(coalesce(p.role::text,'')) in ('admin','platform_admin','super_admin');
  end if;

  return jsonb_build_object(
    'incident_id',v_incident.id,
    'status',v_incident.status,
    'occurrence_count',v_incident.occurrence_count,
    'created',v_is_new
  );
end;
$$;

revoke all on function public.submit_beta_report(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,jsonb) from public;
grant execute on function public.submit_beta_report(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,jsonb) to anon, authenticated;

create or replace function public.owner_list_beta_incidents(
  p_limit integer default 100,
  p_status text default null
)
returns setof public.beta_incidents
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_owner_session() then
    raise exception 'Platform owner access required' using errcode='42501';
  end if;
  return query
  select i.*
  from public.beta_incidents i
  where p_status is null or i.status=lower(trim(p_status))
  order by
    case i.status when 'new' then 0 when 'reproduced' then 1 when 'investigating' then 2 when 'fixed' then 3 else 4 end,
    i.last_seen desc
  limit greatest(1,least(coalesce(p_limit,100),500));
end;
$$;

revoke all on function public.owner_list_beta_incidents(integer,text) from public, anon;
grant execute on function public.owner_list_beta_incidents(integer,text) to authenticated, service_role;

create or replace function public.owner_list_beta_report_events(
  p_incident_id uuid,
  p_limit integer default 50
)
returns setof public.beta_report_events
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_owner_session() then
    raise exception 'Platform owner access required' using errcode='42501';
  end if;
  return query
  select e.*
  from public.beta_report_events e
  where e.incident_id=p_incident_id
  order by e.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
end;
$$;

revoke all on function public.owner_list_beta_report_events(uuid,integer) from public, anon;
grant execute on function public.owner_list_beta_report_events(uuid,integer) to authenticated, service_role;

create or replace function public.owner_set_beta_incident_status(
  p_incident_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(trim(coalesce(p_status,'')));
  v_previous text;
  v_incident public.beta_incidents;
begin
  if not public.is_platform_owner_session() then
    raise exception 'Platform owner access required' using errcode='42501';
  end if;
  if v_status not in ('new','reproduced','investigating','fixed','shipped') then
    raise exception 'Invalid beta incident status';
  end if;

  select status into v_previous
  from public.beta_incidents
  where id=p_incident_id
  for update;
  if not found then raise exception 'Beta incident not found'; end if;

  update public.beta_incidents
  set status=v_status,updated_at=now()
  where id=p_incident_id
  returning * into v_incident;

  if v_previous is distinct from v_status and v_status in ('fixed','shipped') then
    insert into public.notifications(user_id,type,title,body,data)
    select distinct
      e.user_id,
      'beta_incident_status',
      case when v_status='fixed' then 'Your beta report was fixed' else 'Your beta fix has shipped' end,
      case when v_status='fixed'
        then 'We think the issue you reported is fixed. Please try it again.'
        else 'A fix for an issue you reported has shipped. Please try it again.'
      end,
      jsonb_build_object('beta_incident_id',v_incident.id,'beta_status',v_status)
    from public.beta_report_events e
    where e.incident_id=v_incident.id and e.user_id is not null;
  end if;

  return jsonb_build_object(
    'incident_id',v_incident.id,
    'status',v_incident.status,
    'occurrence_count',v_incident.occurrence_count,
    'updated_at',v_incident.updated_at
  );
end;
$$;

revoke all on function public.owner_set_beta_incident_status(uuid,text) from public, anon;
grant execute on function public.owner_set_beta_incident_status(uuid,text) to authenticated, service_role;
