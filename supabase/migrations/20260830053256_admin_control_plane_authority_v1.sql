create or replace function public.admin_data_integrity_summary()
returns table(issue_code text,issue_count bigint,severity text)
language sql stable security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $function$
  select * from (
    select 'orphan_business_members'::text,count(*)::bigint,'high'::text from public.business_members bm left join public.businesses b on b.id=bm.business_id where b.id is null
    union all select 'orphan_business_locations',count(*)::bigint,'high' from public.locations l left join public.businesses b on b.id=l.business_id where l.business_id is not null and b.id is null
    union all select 'orphan_qr_locations',count(*)::bigint,'high' from public.qr_codes q left join public.locations l on l.id=q.location_id where q.location_id is not null and l.id is null
    union all select 'orphan_enterprise_campaign_networks',count(*)::bigint,'high' from public.enterprise_partner_campaigns c left join public.enterprise_partner_networks n on n.id=c.network_id where n.id is null
    union all select 'orphan_enterprise_network_members',count(*)::bigint,'high' from public.enterprise_partner_network_members m left join public.enterprise_partner_networks n on n.id=m.network_id where n.id is null
    union all select 'orphan_notifications',count(*)::bigint,'medium' from public.notifications n left join public.profiles p on p.id=n.user_id where p.id is null
  ) x
  where exists(select 1 from public.profiles p where p.id=auth.uid() and (coalesce(p.is_admin,false) or coalesce(p.is_platform_owner,false) or lower(coalesce(p.role::text,'')) in ('admin','owner','platform_admin','super_admin')));
$function$;
revoke all on function public.admin_data_integrity_summary() from public,anon;
grant execute on function public.admin_data_integrity_summary() to authenticated;

create or replace function public.admin_control_plane_snapshot()
returns jsonb
language plpgsql stable security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $function$
declare v_auth jsonb;v_overview jsonb;v_caps jsonb;v_resources jsonb;v_integrity jsonb;v_high bigint:=0;v_medium bigint:=0;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select public.admin_authorization_v1(auth.uid()) into v_auth;
 if not coalesce((v_auth->>'is_platform_owner')::boolean,false) then raise exception 'Platform owner access required';end if;
 select public.admin_get_overview() into v_overview;
 select public.admin_operational_capability_catalog() into v_caps;
 select public.admin_backend_resource_catalog() into v_resources;
 select coalesce(jsonb_agg(to_jsonb(i) order by i.severity,i.issue_code),'[]'::jsonb),coalesce(sum(i.issue_count) filter(where i.severity='high'),0),coalesce(sum(i.issue_count) filter(where i.severity='medium'),0) into v_integrity,v_high,v_medium from public.admin_data_integrity_summary() i;
 return jsonb_build_object('authorization',v_auth,'overview',coalesce(v_overview,'{}'::jsonb),'integrity',jsonb_build_object('issues',v_integrity,'high',v_high,'medium',v_medium,'status',case when v_high>0 then 'attention' when v_medium>0 then 'watch' else 'ready' end),'capabilities',coalesce(v_caps,'{}'::jsonb),'resources',coalesce(v_resources,'{}'::jsonb),'generated_at',now());
end $function$;
revoke all on function public.admin_control_plane_snapshot() from public,anon;
grant execute on function public.admin_control_plane_snapshot() to authenticated;
