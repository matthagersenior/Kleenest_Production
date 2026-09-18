create or replace function public.admin_list_user_safety_reports(p_status text default 'open')
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'PLATFORM_OWNER_REQUIRED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'reporter_id',r.reporter_id,'reported_user_id',r.reported_user_id,
    'reporter_name',coalesce(nullif(pr.display_name,''),nullif(pr.username,''),'Kleenest user'),
    'reported_name',coalesce(nullif(pt.display_name,''),nullif(pt.username,''),'Kleenest user'),
    'reason',r.reason,'details',r.details,'context',r.context,'status',r.status,'created_at',r.created_at,'resolved_at',r.resolved_at
  ) order by r.created_at desc),'[]'::jsonb)
  into v_result
  from public.user_safety_reports r
  left join public.profiles pr on pr.id=r.reporter_id
  left join public.profiles pt on pt.id=r.reported_user_id
  where p_status is null or p_status='' or r.status=p_status;
  return v_result;
end;
$$;

create or replace function public.admin_resolve_user_safety_report(p_report_id uuid,p_status text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_row public.user_safety_reports;
begin
  if not public.is_platform_owner_session() then raise exception 'PLATFORM_OWNER_REQUIRED'; end if;
  if p_status not in ('reviewing','resolved','dismissed') then raise exception 'INVALID_REPORT_STATUS'; end if;
  update public.user_safety_reports
  set status=p_status,resolved_at=case when p_status in ('resolved','dismissed') then now() else null end
  where id=p_report_id
  returning * into v_row;
  if v_row.id is null then raise exception 'USER_REPORT_NOT_FOUND'; end if;
  return to_jsonb(v_row);
end;
$$;

grant execute on function public.admin_list_user_safety_reports(text) to authenticated;
grant execute on function public.admin_resolve_user_safety_report(uuid,text) to authenticated;

insert into public.capability_function_classifications(function_signature,domain,classification,rationale,updated_at) values
('admin_list_user_safety_reports(p_status text)','owner_moderation','canonical','Platform-owner queue for contributor safety reports.',now()),
('admin_resolve_user_safety_report(p_report_id uuid, p_status text)','owner_moderation','canonical','Platform-owner resolution mutation for contributor safety reports.',now())
on conflict (function_signature) do update set domain=excluded.domain,classification=excluded.classification,rationale=excluded.rationale,updated_at=now();
