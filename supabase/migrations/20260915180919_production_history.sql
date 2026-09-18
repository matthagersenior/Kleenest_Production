create index if not exists qr_location_placement_events_actor_idx
  on public.qr_location_placement_events(actor_user_id,created_at desc)
  where actor_user_id is not null;

create index if not exists qr_location_placement_events_resolved_by_idx
  on public.qr_location_placement_events(resolved_by,resolved_at desc)
  where resolved_by is not null;
