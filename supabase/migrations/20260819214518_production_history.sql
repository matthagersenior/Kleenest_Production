create table if not exists public.intelligence_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  event_id uuid,
  surface text not null check (surface in ('consumer','business','fleet')),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists intelligence_notification_jobs_pending_idx on public.intelligence_notification_jobs(status,available_at);
create unique index if not exists intelligence_notification_jobs_event_surface_idx on public.intelligence_notification_jobs(event_id,surface) where event_id is not null;

alter table public.intelligence_notification_jobs enable row level security;

create policy "users can read own intelligence jobs through location membership" on public.intelligence_notification_jobs for select using (false);

create or replace function public.queue_intelligence_notification_jobs()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.location_id is null then return new; end if;
  insert into public.intelligence_notification_jobs(location_id,event_id,surface)
  values
    (new.location_id,new.id,'consumer'),
    (new.location_id,new.id,'business'),
    (new.location_id,new.id,'fleet')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_queue_intelligence_notifications on public.live_network_events;
create trigger trg_queue_intelligence_notifications
after insert on public.live_network_events
for each row execute function public.queue_intelligence_notification_jobs();
