-- Mirrors deployed Production migration 20261008213113_owner_email_isolated_web_push.
-- Mail PWA subscriptions are distinct from Consumer/Owner app push tokens.
create table if not exists public.owner_email_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint),
  constraint mail_push_endpoint_length check (length(endpoint) between 20 and 2048)
);
create index if not exists owner_email_push_subscriptions_user_idx
  on public.owner_email_push_subscriptions(user_id);
alter table public.owner_email_push_subscriptions enable row level security;
revoke all on public.owner_email_push_subscriptions from public, anon;
grant select, insert, update, delete on public.owner_email_push_subscriptions to authenticated;
drop policy if exists mail_push_subscription_own on public.owner_email_push_subscriptions;
create policy mail_push_subscription_own on public.owner_email_push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.owner_email_push_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_id uuid not null references public.owner_email_mailboxes(id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(user_id, mailbox_id)
);
create index if not exists owner_email_push_preferences_mailbox_idx
  on public.owner_email_push_preferences(mailbox_id);
alter table public.owner_email_push_preferences enable row level security;
revoke all on public.owner_email_push_preferences from public, anon;
grant select, insert, update, delete on public.owner_email_push_preferences to authenticated;
drop policy if exists mail_push_preferences_own on public.owner_email_push_preferences;
create policy mail_push_preferences_own on public.owner_email_push_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.owner_email_push_deliveries (
  message_id uuid not null references public.owner_email_center_messages(id) on delete cascade,
  subscription_id uuid not null references public.owner_email_push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','failed','expired')),
  attempt_count integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key(message_id,subscription_id)
);
alter table public.owner_email_push_deliveries enable row level security;
revoke all on public.owner_email_push_deliveries from public,anon,authenticated;

-- Thread classification is final only after the inbound message count advances;
-- avoid push notifications for blocked, spam, and archive-only mail.
create or replace function internal.enqueue_owner_email_push()
returns trigger
language plpgsql security definer set search_path=''
as $fn$
declare
  v_worker_secret text;
begin
  if new.message_count <= old.message_count
     or new.latest_direction <> 'inbound'
     or new.folder <> 'inbox'
     or new.mailbox_id is null then
    return new;
  end if;
  select worker_secret into v_worker_secret from internal.push_worker_config where id=true;
  if v_worker_secret is null or v_worker_secret='' then
    return new;
  end if;
  perform net.http_post(
    url:='https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/owner-email-web-push',
    headers:=pg_catalog.jsonb_build_object(
      'Content-Type','application/json','x-kleenest-worker-secret',v_worker_secret
    ),
    body:=pg_catalog.jsonb_build_object('thread_id',new.id,'mailbox_id',new.mailbox_id),
    timeout_milliseconds:=5000
  );
  return new;
end;
$fn$;
revoke all on function internal.enqueue_owner_email_push() from public,anon,authenticated;
drop trigger if exists owner_email_push_enqueued on public.owner_email_center_threads;
create trigger owner_email_push_enqueued
after update of message_count on public.owner_email_center_threads
for each row execute function internal.enqueue_owner_email_push();
