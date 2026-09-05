alter table public.review_reports
  drop constraint if exists review_reports_reason_check;

alter table public.review_reports
  add constraint review_reports_reason_check
  check (reason = any (array['unsafe'::text,'harassment'::text,'hate'::text,'sexual'::text,'privacy'::text,'spam'::text,'inaccurate'::text,'other'::text]));

alter table public.review_reports
  drop constraint if exists review_reports_details_length_check;

alter table public.review_reports
  add constraint review_reports_details_length_check
  check (details is null or char_length(details) <= 1000);

create unique index if not exists review_reports_review_reporter_uidx
  on public.review_reports(review_id, reporter_id);

create or replace function public.report_review(
  p_review_id uuid,
  p_reason text,
  p_details text default null
)
returns public.review_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.review_reports%rowtype;
  v_reason text := pg_catalog.lower(pg_catalog.btrim(p_reason));
  v_details text := nullif(pg_catalog.btrim(p_details), '');
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_reason is null or v_reason not in ('unsafe','harassment','hate','sexual','privacy','spam','inaccurate','other') then
    raise exception 'REPORT_REASON_INVALID';
  end if;

  if v_details is not null and pg_catalog.char_length(v_details) > 1000 then
    raise exception 'REPORT_DETAILS_TOO_LONG';
  end if;

  if not exists(select 1 from public.reviews where id = p_review_id) then
    raise exception 'REVIEW_NOT_FOUND';
  end if;

  insert into public.review_reports(review_id, reporter_id, reason, details)
  values (p_review_id, auth.uid(), v_reason, v_details)
  returning * into v;

  return v;
exception
  when unique_violation then
    raise exception 'REVIEW_ALREADY_REPORTED_BY_USER';
end;
$$;

revoke all on function public.report_review(uuid, text, text) from public, anon;
grant execute on function public.report_review(uuid, text, text) to authenticated, service_role;

revoke all on table public.review_reports from anon;
revoke insert, update, delete, truncate, references, trigger on table public.review_reports from authenticated;
grant select on table public.review_reports to authenticated;
grant select, insert, update, delete, truncate, references, trigger on table public.review_reports to service_role;
