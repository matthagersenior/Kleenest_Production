create table if not exists public.notification_native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  provider text not null default 'expo' check (provider in ('expo')),
  platform text not null check (platform in ('ios','android')),
  app_id text not null default 'com.kleenest.app',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, token)
);
create index if not exists notification_native_push_tokens_user_active_idx on public.notification_native_push_tokens(user_id, active);
alter table public.notification_native_push_tokens enable row level security;
drop policy if exists notification_native_push_tokens_self_select on public.notification_native_push_tokens;
create policy notification_native_push_tokens_self_select on public.notification_native_push_tokens for select to authenticated using (user_id = auth.uid());
drop policy if exists notification_native_push_tokens_self_delete on public.notification_native_push_tokens;
create policy notification_native_push_tokens_self_delete on public.notification_native_push_tokens for delete to authenticated using (user_id = auth.uid());

create table if not exists public.notification_native_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  token_id uuid not null references public.notification_native_push_tokens(id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_id, token_id)
);
create index if not exists notification_native_push_deliveries_notification_idx on public.notification_native_push_deliveries(notification_id);
create index if not exists notification_native_push_deliveries_token_idx on public.notification_native_push_deliveries(token_id);
alter table public.notification_native_push_deliveries enable row level security;
drop policy if exists notification_native_push_deliveries_self_select on public.notification_native_push_deliveries;
create policy notification_native_push_deliveries_self_select on public.notification_native_push_deliveries for select to authenticated using (exists (select 1 from public.notification_native_push_tokens t where t.id = token_id and t.user_id = auth.uid()));

create or replace function public.register_notification_native_push_token(p_token text, p_platform text, p_app_id text default 'com.kleenest.app') returns public.notification_native_push_tokens language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare result public.notification_native_push_tokens;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_token),'') is null then raise exception 'Push token is required'; end if;
  if p_platform not in ('ios','android') then raise exception 'Unsupported push platform'; end if;
  if p_token !~ '^Expo(nent)?PushToken\[[^]]+\]$' then raise exception 'Invalid Expo push token'; end if;
  insert into public.notification_native_push_tokens(user_id,token,provider,platform,app_id,active,updated_at) values(auth.uid(),trim(p_token),'expo',p_platform,coalesce(nullif(trim(p_app_id),''),'com.kleenest.app'),true,now()) on conflict(user_id,token) do update set platform=excluded.platform,app_id=excluded.app_id,active=true,updated_at=now() returning * into result;
  return result;
end;$$;
revoke all on function public.register_notification_native_push_token(text,text,text) from public, anon;
grant execute on function public.register_notification_native_push_token(text,text,text) to authenticated;

create or replace function public.remove_notification_native_push_token(p_token text) returns boolean language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.notification_native_push_tokens set active=false,updated_at=now() where user_id=auth.uid() and token=p_token and active=true;
  return found;
end;$$;
revoke all on function public.remove_notification_native_push_token(text) from public, anon;
grant execute on function public.remove_notification_native_push_token(text) to authenticated;

create or replace function public.enqueue_notification_native_push_delivery() returns trigger language plpgsql security definer set search_path = public, auth, extensions, pg_temp as $$
declare worker_secret text;
begin
  if exists(select 1 from public.notification_native_push_tokens t where t.user_id=new.user_id and t.active=true) then
    select c.worker_secret into worker_secret from internal.push_worker_config c where c.id=true;
    perform net.http_post(url:='https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/deliver-native-push-notification',headers:=jsonb_build_object('Content-Type','application/json','x-kleenest-worker-secret',worker_secret),body:=jsonb_build_object('record',jsonb_build_object('id',new.id)),timeout_milliseconds:=5000);
  end if;
  return new;
end;$$;
revoke all on function public.enqueue_notification_native_push_delivery() from public, anon, authenticated;
drop trigger if exists notifications_native_push_delivery on public.notifications;
create trigger notifications_native_push_delivery after insert on public.notifications for each row execute function public.enqueue_notification_native_push_delivery();
