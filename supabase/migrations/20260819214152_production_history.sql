create table if not exists public.intelligence_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null,
  surface text not null check (surface in ('consumer','business','fleet')),
  notification_type text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists intelligence_notification_deliveries_user_key_idx
  on public.intelligence_notification_deliveries(user_id, dedupe_key, created_at desc);

alter table public.intelligence_notification_deliveries enable row level security;

create policy "users can read own intelligence notification deliveries"
  on public.intelligence_notification_deliveries for select
  using (auth.uid() = user_id);

create policy "users can insert own intelligence notification deliveries"
  on public.intelligence_notification_deliveries for insert
  with check (auth.uid() = user_id);

create or replace function public.create_intelligence_notification(
  p_user_id uuid,
  p_location_id uuid,
  p_surface text,
  p_type text,
  p_dedupe_key text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_cooldown_minutes integer default 120
) returns public.notifications
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_notification public.notifications;
  v_recent boolean;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Not authorized';
  end if;

  select exists(
    select 1 from public.intelligence_notification_deliveries d
    where d.user_id = p_user_id
      and d.dedupe_key = p_dedupe_key
      and d.created_at > now() - make_interval(mins => greatest(p_cooldown_minutes,0))
  ) into v_recent;

  if v_recent then return null; end if;

  insert into public.notifications(user_id,type,title,body,data)
  values (
    p_user_id,
    p_type,
    p_title,
    p_body,
    coalesce(p_data,'{}'::jsonb) || jsonb_build_object('surface',p_surface,'location_id',p_location_id,'dedupe_key',p_dedupe_key)
  )
  returning * into v_notification;

  insert into public.intelligence_notification_deliveries(user_id,location_id,surface,notification_type,dedupe_key)
  values(p_user_id,p_location_id,p_surface,p_type,p_dedupe_key);

  return v_notification;
end;
$$;
