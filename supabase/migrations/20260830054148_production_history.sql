create or replace function public.admin_control_plane_history(p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path to 'public','auth','extensions','pg_catalog' as $function$
declare v_limit integer:=least(greatest(coalesce(p_limit,50),1),200);begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.is_platform_owner(auth.uid()) then raise exception 'Platform owner access required'; end if;
 return jsonb_build_object(
  'capability_changes',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,admin_user_id,target_user_id,previous_state,new_state,reason,created_at from public.admin_capability_audit order by created_at desc limit v_limit) x),'[]'::jsonb),
  'audit_runs',coalesce((select jsonb_agg(to_jsonb(x) order by x.executed_at desc) from (select id,executed_at,executed_by,source,domain_count,issue_count,duplicate_domain_count,uncovered_rpc_count from public.capability_audit_runs order by executed_at desc limit v_limit) x),'[]'::jsonb),
  'retirements',coalesce((select jsonb_agg(to_jsonb(x) order by x.retired_at desc) from (select id,function_signature,canonical_replacement,github_callers,postgres_dependents,evidence,retired_at from public.capability_retirement_log order by retired_at desc limit v_limit) x),'[]'::jsonb),
  'configuration',jsonb_build_object(
    'features_total',(select count(*) from public.feature_catalog),
    'features_enabled',(select count(*) from public.feature_catalog where enabled),
    'pricing_entries',(select count(*) from public.pricing_catalog),
    'pricing_active',(select count(*) from public.pricing_catalog where active)
  ),
  'generated_at',now()
 );
end $function$;
revoke all on function public.admin_control_plane_history(integer) from public,anon;
grant execute on function public.admin_control_plane_history(integer) to authenticated;
