create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare affected integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.notifications
     set read_at = coalesce(read_at, now())
   where user_id = auth.uid()
     and read_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;
