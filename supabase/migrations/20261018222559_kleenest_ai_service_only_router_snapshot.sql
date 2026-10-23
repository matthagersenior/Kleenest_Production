create or replace function public.kleenest_ai_router_snapshot(p_task_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
select jsonb_build_object(
'task',(select to_jsonb(t) from kleenest_ai.ai_tasks t where t.id=p_task_id),
'models',(select coalesce(jsonb_agg(to_jsonb(m) order by m.priority), '[]'::jsonb) from kleenest_ai.provider_models m where m.enabled=true and m.model<>'unconfigured'),
'health',(select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) from kleenest_ai.provider_health h),
'policy',(select to_jsonb(p) from kleenest_ai.ai_policy p where p.singleton=true),
'budget',kleenest_ai.budget_status()
)
$$;
revoke all on function public.kleenest_ai_router_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.kleenest_ai_router_snapshot(uuid) to service_role;