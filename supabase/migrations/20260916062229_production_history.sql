create or replace function public.owner_creator_mission_attribution_summary(p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_days integer:=greatest(1,least(coalesce(p_days,90),366));
  v_since timestamptz:=now()-make_interval(days=>greatest(1,least(coalesce(p_days,90),366)));
  v_result jsonb;
begin
  if not public.is_platform_owner_session() then
    raise exception 'Platform owner access required' using errcode='42501';
  end if;

  with counts as (
    select
      e.assignment_id,
      count(*) filter(where e.event_name='landing_view') as landing_views,
      count(*) filter(where e.event_name='open_app') as open_app,
      count(*) filter(where e.event_name='install_intent') as install_intents,
      count(*) filter(where e.event_name='share') as shares,
      count(distinct e.session_key) as unique_sessions
    from public.creator_mission_attribution_events e
    where e.created_at>=v_since
    group by e.assignment_id
  )
  select jsonb_build_object(
    'days',v_days,
    'since',v_since,
    'missions',coalesce(jsonb_agg(jsonb_build_object(
      'assignment_id',a.id,
      'mission_code',o.code,
      'title',o.title,
      'status',a.status,
      'creator_name',a.creator_name,
      'creator_handle',a.creator_handle,
      'creator_slug',a.creator_slug,
      'tracking_slug',a.tracking_slug,
      'campaign_code',a.campaign_code,
      'default_channel',a.default_channel,
      'tracking_url','https://kleenest.app/creator?m='||a.tracking_slug||'&channel='||a.default_channel,
      'landing_views',coalesce(c.landing_views,0),
      'open_app',coalesce(c.open_app,0),
      'install_intents',coalesce(c.install_intents,0),
      'shares',coalesce(c.shares,0),
      'unique_sessions',coalesce(c.unique_sessions,0)
    ) order by a.creator_name),'[]'::jsonb)
  )
  into v_result
  from public.creator_mission_assignments a
  join public.progression_objectives_v2 o on o.id=a.objective_id
  left join counts c on c.assignment_id=a.id
  where a.campaign_code='kleenest-stl-creators-2026';

  return coalesce(v_result,jsonb_build_object('days',v_days,'since',v_since,'missions','[]'::jsonb));
end
$function$;

revoke all on function public.owner_creator_mission_attribution_summary(integer) from public,anon;
grant execute on function public.owner_creator_mission_attribution_summary(integer) to authenticated,service_role;

update public.progression_objectives_v2
set scope = coalesce(scope,'{}'::jsonb)
  || jsonb_build_object(
    'campaign_code','kleenest-stl-creators-2026',
    'creator_campaign','kleenest-stl-creators-2026',
    'creator_mission',true,
    'owner_activation_required',true
  )
where id in (
  select objective_id
  from public.creator_mission_assignments
  where campaign_code='kleenest-stl-creators-2026'
);
