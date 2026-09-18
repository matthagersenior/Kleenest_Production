create index if not exists business_members_user_business_idx on public.business_members (user_id, business_id);
create index if not exists business_members_business_role_idx on public.business_members (business_id, role);
create index if not exists business_events_business_date_idx on public.business_events (business_id, event_date, event_time);
create index if not exists business_campaigns_business_status_idx on public.business_campaigns (business_id, status, starts_at);

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_events enable row level security;
alter table public.business_campaigns enable row level security;

-- Social is never granted business-management authority. Existing Business RLS remains authoritative for all business data consumed by Social.
