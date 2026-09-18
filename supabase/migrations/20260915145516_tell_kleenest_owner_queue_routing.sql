alter table public.beta_report_events
  add column if not exists owner_queue text not null default 'incident',
  add column if not exists owner_status text not null default 'new',
  add column if not exists owner_note text,
  add column if not exists owner_updated_at timestamptz;

alter table public.beta_report_events
  drop constraint if exists beta_report_events_owner_queue_check;
alter table public.beta_report_events
  add constraint beta_report_events_owner_queue_check
  check (owner_queue in ('incident','ux_friction','product_gap','ideas','voice_of_customer'));

alter table public.beta_report_events
  drop constraint if exists beta_report_events_owner_status_check;
alter table public.beta_report_events
  add constraint beta_report_events_owner_status_check
  check (owner_status in ('new','reviewing','planned','resolved','archived'));

update public.beta_report_events e
set owner_queue = case
  when e.report_kind='automatic'
    or lower(coalesce(e.metadata->>'feedback_kind',''))='bug'
    or e.category in ('bug','glitch','network','data','performance','crash')
    then 'incident'
  when lower(coalesce(e.metadata->>'feedback_kind',''))='confusing' then 'ux_friction'
  when lower(coalesce(e.metadata->>'feedback_kind',''))='missing' then 'product_gap'
  when lower(coalesce(e.metadata->>'feedback_kind',''))='idea' then 'ideas'
  when lower(coalesce(e.metadata->>'feedback_surface',''))='tell_kleenest' then 'voice_of_customer'
  else 'incident'
end
where e.owner_queue='incident';

create index if not exists beta_report_events_owner_queue_status_created_idx
  on public.beta_report_events(owner_queue,owner_status,created_at desc);

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
  v_feedback_kind text;
  v_feedback_surface text;
  v_sentiment text;
  v_owner_queue text;
  v_queue_title text;
  v_incident public.beta_incidents;
  v_is_new boolean := false;
  v_error text;
begin
  if v_uid is null then raise exception 'BETA_REPORT_AUTH_REQUIRED' using errcode='42501'; end if;
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
  v_feedback_kind := lower(trim(coalesce(v_metadata->>'feedback_kind','')));
  v_feedback_surface := lower(trim(coalesce(v_metadata->>'feedback_surface','')));
  v_sentiment := lower(trim(coalesce(v_metadata->>'sentiment','')));
  v_owner_queue := case
    when v_kind='automatic'
      or v_feedback_kind='bug'
      or v_category in ('bug','glitch','network','data','performance','crash')
      then 'incident'
    when v_feedback_kind='confusing' then 'ux_friction'
    when v_feedback_kind='missing' then 'product_gap'
    when v_feedback_kind='idea' then 'ideas'
    when v_feedback_surface='tell_kleenest' and v_sentiment='great' then 'voice_of_customer'
    when v_feedback_surface='tell_kleenest' then 'voice_of_customer'
    else 'incident'
  end;
  v_queue_title := case v_owner_queue
    when 'ux_friction' then 'UX friction'
    when 'product_gap' then 'Product gap'
    when 'ideas' then 'Idea'
    when 'voice_of_customer' then 'Voice of customer'
    else initcap(v_category)
  end;

  select * into v_incident
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
        left(v_queue_title||' · '||coalesce(v_route,v_surface),180),
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
    app_version,runtime_version,update_id,platform,platform_version,metadata,breadcrumbs,
    owner_queue,owner_status
  )
  values(
    v_incident.id,v_uid,v_session,v_kind,v_category,v_message,v_route,v_surface,
    nullif(p_app_version,''),nullif(p_runtime_version,''),nullif(p_update_id,''),
    nullif(p_platform,''),nullif(p_platform_version,''),v_metadata,v_breadcrumbs,
    v_owner_queue,'new'
  );

  if v_is_new or v_owner_queue <> 'incident' then
    insert into public.notifications(user_id,type,title,body,data)
    select
      p.id,
      case when v_owner_queue='incident' then 'beta_incident' else 'tell_kleenest_feedback' end,
      case when v_owner_queue='incident' then 'New beta incident' else 'New Tell Kleenest feedback' end,
      left(v_queue_title||' · '||coalesce(v_route,v_surface),180),
      jsonb_build_object(
        'beta_incident_id',v_incident.id,
        'owner_queue',v_owner_queue,
        'app_surface',v_surface,
        'category',v_category,
        'feedback_kind',nullif(v_feedback_kind,''),
        'sentiment',nullif(v_sentiment,''),
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
    'owner_queue',v_owner_queue,
    'occurrence_count',v_incident.occurrence_count,
    'created',v_is_new
  );
end;
$$;

revoke all on function public.submit_beta_report(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_beta_report(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,jsonb) to authenticated,service_role;

create or replace function public.owner_list_feedback_queue(
  p_queue text default null,
  p_status text default null,
  p_limit integer default 200
)
returns table(
  id uuid,
  incident_id uuid,
  user_id uuid,
  owner_queue text,
  owner_status text,
  owner_note text,
  owner_updated_at timestamptz,
  report_kind text,
  category text,
  message text,
  route text,
  app_surface text,
  app_version text,
  runtime_version text,
  update_id text,
  platform text,
  platform_version text,
  metadata jsonb,
  breadcrumbs jsonb,
  created_at timestamptz,
  incident_fingerprint text,
  incident_occurrence_count integer,
  incident_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_queue text := nullif(lower(trim(coalesce(p_queue,''))),'');
  v_status text := nullif(lower(trim(coalesce(p_status,''))),'');
begin
  if not public.is_platform_owner_session() then
    raise exception 'Platform owner access required' using errcode='42501';
  end if;
  if v_queue is not null and v_queue not in ('incident','ux_friction','product_gap','ideas','voice_of_customer') then
    raise exception 'Invalid feedback owner queue';
  end if;
  if v_status is not null and v_status not in ('new','reviewing','planned','resolved','archived') then
    raise exception 'Invalid feedback owner status';
  end if;

  return query
  select
    e.id,e.incident_id,e.user_id,e.owner_queue,e.owner_status,e.owner_note,e.owner_updated_at,
    e.report_kind,e.category,e.message,e.route,e.app_surface,e.app_version,e.runtime_version,
    e.update_id,e.platform,e.platform_version,e.metadata,e.breadcrumbs,e.created_at,
    i.fingerprint,i.occurrence_count,i.status
  from public.beta_report_events e
  join public.beta_incidents i on i.id=e.incident_id
  where
    case when v_queue is null then e.owner_queue<>'incident' else e.owner_queue=v_queue end
    and (v_status is null or e.owner_status=v_status)
  order by
    case e.owner_status when 'new' then 0 when 'reviewing' then 1 when 'planned' then 2 when 'resolved' then 3 else 4 end,
    e.created_at desc
  limit greatest(1,least(coalesce(p_limit,200),500));
end;
$$;

revoke all on function public.owner_list_feedback_queue(text,text,integer) from public,anon;
grant execute on function public.owner_list_feedback_queue(text,text,integer) to authenticated,service_role;

create or replace function public.owner_feedback_queue_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_platform_owner_session() then
    raise exception 'Platform owner access required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'incident',count(*) filter(where owner_queue='incident' and owner_status<>'archived'),
    'ux_friction',count(*) filter(where owner_queue='ux_friction' and owner_status<>'archived'),
    'product_gap',count(*) filter(where owner_queue='product_gap' and owner_status<>'archived'),
    'ideas',count(*) filter(where owner_queue='ideas' and owner_status<>'archived'),
    'voice_of_customer',count(*) filter(where owner_queue='voice_of_customer' and owner_status<>'archived'),
    'new_total',count(*) filter(where owner_status='new'),
    'reviewing_total',count(*) filter(where owner_status='reviewing'),
    'planned_total',count(*) filter(where owner_status='planned'),
    'resolved_total',count(*) filter(where owner_status='resolved')
  )
  into v_result
  from public.beta_report_events;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;

revoke all on function public.owner_feedback_queue_summary() from public,anon;
grant execute on function public.owner_feedback_queue_summary() to authenticated,service_role;

create or replace function public.owner_update_feedback_event(
  p_event_id uuid,
  p_status text,
  p_note text default null,
  p_queue text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(trim(coalesce(p_status,'')));
  v_queue text := nullif(lower(trim(coalesce(p_queue,''))),'');
  v_row public.beta_report_events;
begin
  if not public.is_platform_owner_session() then
    raise exception 'Platform owner access required' using errcode='42501';
  end if;
  if v_status not in ('new','reviewing','planned','resolved','archived') then
    raise exception 'Invalid feedback owner status';
  end if;
  if v_queue is not null and v_queue not in ('incident','ux_friction','product_gap','ideas','voice_of_customer') then
    raise exception 'Invalid feedback owner queue';
  end if;

  update public.beta_report_events
  set owner_status=v_status,
      owner_note=nullif(left(trim(coalesce(p_note,'')),2000),''),
      owner_queue=coalesce(v_queue,owner_queue),
      owner_updated_at=now()
  where id=p_event_id
  returning * into v_row;

  if not found then raise exception 'Feedback event not found'; end if;

  return jsonb_build_object(
    'id',v_row.id,
    'owner_queue',v_row.owner_queue,
    'owner_status',v_row.owner_status,
    'owner_note',v_row.owner_note,
    'owner_updated_at',v_row.owner_updated_at
  );
end;
$$;

revoke all on function public.owner_update_feedback_event(uuid,text,text,text) from public,anon;
grant execute on function public.owner_update_feedback_event(uuid,text,text,text) to authenticated,service_role;

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
  where (p_status is null or i.status=lower(trim(p_status)))
    and exists(
      select 1
      from public.beta_report_events e
      where e.incident_id=i.id
        and e.owner_queue='incident'
    )
  order by
    case i.status when 'new' then 0 when 'reproduced' then 1 when 'investigating' then 2 when 'fixed' then 3 else 4 end,
    i.last_seen desc
  limit greatest(1,least(coalesce(p_limit,100),500));
end;
$$;

revoke all on function public.owner_list_beta_incidents(integer,text) from public,anon;
grant execute on function public.owner_list_beta_incidents(integer,text) to authenticated,service_role;

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
    and e.owner_queue='incident'
  order by e.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
end;
$$;

revoke all on function public.owner_list_beta_report_events(uuid,integer) from public,anon;
grant execute on function public.owner_list_beta_report_events(uuid,integer) to authenticated,service_role;
