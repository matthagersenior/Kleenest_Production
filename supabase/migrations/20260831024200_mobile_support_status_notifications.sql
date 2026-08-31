create or replace function internal.notify_support_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications(user_id,type,title,body,data)
    values(
      new.user_id,
      'support_status',
      'Support request updated',
      format(
        'Your support request "%s" is now %s.',
        left(new.subject,80),
        replace(coalesce(new.status,'updated'),'_',' ')
      ),
      jsonb_build_object(
        'support_request_id',new.id,
        'support_status',new.status
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function internal.notify_support_request_status_change() from public, anon, authenticated;

drop trigger if exists support_requests_notify_status_change on public.support_requests;
create trigger support_requests_notify_status_change
after update of status on public.support_requests
for each row
when (old.status is distinct from new.status)
execute function internal.notify_support_request_status_change();
