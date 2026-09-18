create or replace function public.admin_control_plane_snapshot()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare v_auth jsonb;v_overview jsonb;v_caps jsonb;v_resources jsonb;v_integrity jsonb;v_high bigint:=0;v_medium bigint:=0;begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.is_platform_owner_session() then raise exception 'Platform owner or administrator access required'; end if;
 select public.admin_authorization_v1(auth.uid()) into v_auth;
 select public.admin_get_overview() into v_overview;
 select public.admin_operational_capability_catalog() into v_caps;
 select public.admin_backend_resource_catalog() into v_resources;
 select coalesce(jsonb_agg(to_jsonb(i) order by i.severity,i.issue_code),'[]'::jsonb),coalesce(sum(i.issue_count) filter(where i.severity='high'),0),coalesce(sum(i.issue_count) filter(where i.severity='medium'),0) into v_integrity,v_high,v_medium from public.admin_data_integrity_summary() i;
 return jsonb_build_object('authorization',v_auth,'overview',coalesce(v_overview,'{}'::jsonb),'integrity',jsonb_build_object('issues',v_integrity,'high',v_high,'medium',v_medium,'status',case when v_high>0 then 'attention' when v_medium>0 then 'watch' else 'ready' end),'capabilities',coalesce(v_caps,'{}'::jsonb),'resources',coalesce(v_resources,'{}'::jsonb),'generated_at',now());
end $function$;

create or replace function public.admin_control_plane_history(p_limit integer default 50)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare v_limit integer:=least(greatest(coalesce(p_limit,50),1),200);begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.is_platform_owner_session() then raise exception 'Platform owner or administrator access required'; end if;
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
