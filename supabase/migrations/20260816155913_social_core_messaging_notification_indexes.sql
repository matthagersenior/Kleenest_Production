create index if not exists messages_to_created_at_idx on public.messages (to_id, created_at desc);
create index if not exists messages_from_created_at_idx on public.messages (from_id, created_at desc);
create index if not exists notifications_user_created_at_idx on public.notifications (user_id, created_at desc);
alter table public.messages replica identity full;
alter table public.notifications replica identity full;
