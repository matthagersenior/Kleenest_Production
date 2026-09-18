create table if not exists public.account_deletion_requests (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, status text not null default 'requested' check (status in ('requested','processing','completed','cancelled')), requested_at timestamptz not null default now(), processed_at timestamptz, reason text, unique(user_id));

alter table public.account_deletion_requests enable row level security;

create policy "users can view own deletion request" on public.account_deletion_requests for select to authenticated using (user_id = auth.uid());
create policy "users can request own deletion" on public.account_deletion_requests for insert to authenticated with check (user_id = auth.uid());

create or replace function public.request_account_deletion(p_reason text default null)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = public
as $$
declare result public.account_deletion_requests;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.account_deletion_requests(user_id, reason)
  values (auth.uid(), nullif(left(trim(coalesce(p_reason,'')),1000),''))
  on conflict (user_id) do update set status='requested', requested_at=now(), processed_at=null, reason=excluded.reason
  returning * into result;
  return result;
end;
$$;

revoke all on function public.request_account_deletion(text) from public;
grant execute on function public.request_account_deletion(text) to authenticated;
