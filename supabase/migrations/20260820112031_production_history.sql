create table if not exists public.notification_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

alter table public.notification_push_subscriptions enable row level security;

drop policy if exists notification_push_subscriptions_select_own on public.notification_push_subscriptions;
create policy notification_push_subscriptions_select_own on public.notification_push_subscriptions for select to authenticated using (auth.uid() = user_id);

drop policy if exists notification_push_subscriptions_insert_own on public.notification_push_subscriptions;
create policy notification_push_subscriptions_insert_own on public.notification_push_subscriptions for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists notification_push_subscriptions_update_own on public.notification_push_subscriptions;
create policy notification_push_subscriptions_update_own on public.notification_push_subscriptions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists notification_push_subscriptions_delete_own on public.notification_push_subscriptions;
create policy notification_push_subscriptions_delete_own on public.notification_push_subscriptions for delete to authenticated using (auth.uid() = user_id);

create or replace function public.register_notification_push_subscription(p_endpoint text, p_subscription jsonb)
returns public.notification_push_subscriptions
language plpgsql
security invoker
set search_path = public
as $$
declare result public.notification_push_subscriptions;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_endpoint),'') is null then raise exception 'Push endpoint is required'; end if;
  insert into public.notification_push_subscriptions(user_id,endpoint,subscription,updated_at)
  values(auth.uid(),p_endpoint,coalesce(p_subscription,'{}'::jsonb),now())
  on conflict(user_id,endpoint) do update set subscription=excluded.subscription,updated_at=now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.remove_notification_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.notification_push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint;
  return found;
end;
$$;

revoke all on table public.notification_push_subscriptions from anon;
revoke all on table public.notification_push_subscriptions from authenticated;
grant select,insert,update,delete on public.notification_push_subscriptions to authenticated;
revoke execute on function public.register_notification_push_subscription(text,jsonb) from anon;
revoke execute on function public.remove_notification_push_subscription(text) from anon;
grant execute on function public.register_notification_push_subscription(text,jsonb) to authenticated;
grant execute on function public.remove_notification_push_subscription(text) to authenticated;
