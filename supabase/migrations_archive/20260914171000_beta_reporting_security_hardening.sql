revoke execute on function public.submit_beta_report(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,jsonb) from anon;
grant execute on function public.submit_beta_report(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,jsonb) to authenticated;

create or replace function internal.enforce_beta_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    raise exception 'BETA_REPORT_AUTH_REQUIRED' using errcode='42501';
  end if;

  if (
    select count(*)
    from public.beta_report_events e
    where e.user_id=new.user_id
      and e.created_at > now()-interval '1 minute'
  ) >= 10 then
    raise exception 'BETA_REPORT_RATE_LIMIT' using errcode='42901';
  end if;

  return new;
end;
$$;

revoke all on function internal.enforce_beta_report_rate_limit() from public,anon,authenticated;

drop trigger if exists beta_report_rate_limit on public.beta_report_events;
create trigger beta_report_rate_limit
before insert on public.beta_report_events
for each row execute function internal.enforce_beta_report_rate_limit();
