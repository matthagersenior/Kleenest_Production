create or replace function public.submit_support_request(
  p_subject text,
  p_message text,
  p_category text default 'general'
)
returns public.support_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_subject text := pg_catalog.btrim(pg_catalog.coalesce(p_subject,''));
  v_message text := pg_catalog.btrim(pg_catalog.coalesce(p_message,''));
  v_category text := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_category,'general')));
  v_request public.support_requests;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if pg_catalog.length(v_subject) < 3 then raise exception 'SUBJECT_TOO_SHORT'; end if;
  if pg_catalog.length(v_subject) > 160 then raise exception 'SUBJECT_TOO_LONG'; end if;
  if pg_catalog.length(v_message) < 10 then raise exception 'MESSAGE_TOO_SHORT'; end if;
  if pg_catalog.length(v_message) > 5000 then raise exception 'MESSAGE_TOO_LONG'; end if;
  if v_category not in ('general','account','billing','technical','safety','feedback') then raise exception 'INVALID_SUPPORT_CATEGORY'; end if;

  insert into public.support_requests(user_id,subject,message,category,status,priority,admin_notes)
  values(v_uid,v_subject,v_message,v_category,'open','normal',null)
  returning * into v_request;
  return v_request;
end;
$$;

revoke all on function public.submit_support_request(text,text,text) from public, anon;
grant execute on function public.submit_support_request(text,text,text) to authenticated;
