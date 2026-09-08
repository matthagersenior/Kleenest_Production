-- Source-control reconciliation for the live KC-to-Chicago moving-frontier ingestion configuration.
-- Live rows were applied operationally before this migration was committed; all statements are idempotent.

insert into public.national_ingestion_markets
  (market_key,name,state_code,market_kind,population_rank,priority,bbox,status,current_source,source_progress,created_at,updated_at)
values
  ('focus_corridor_columbia_mo','KC→Chicago Frontier — Columbia MO','MO','state_fill',0,-15000,'[38.55,-93.15,39.35,-91.55]'::jsonb,'pending','osm','{"osm":{"completed":false,"tile_cursor":0,"consecutive_failures":0,"grid_version":"corridor_0.24_frontier_v1"}}'::jsonb,now(),now()),
  ('focus_corridor_kansas_city','KC→Chicago Frontier — Kansas City','MO','state_fill',0,-14990,'[38.45,-95.15,39.65,-93.65]'::jsonb,'pending','osm','{"osm":{"completed":false,"tile_cursor":0,"consecutive_failures":0,"grid_version":"corridor_0.24_frontier_v1"}}'::jsonb,now(),now()),
  ('focus_corridor_springfield_il','KC→Chicago Frontier — Springfield IL','IL','state_fill',0,-14980,'[39.35,-90.35,40.35,-88.55]'::jsonb,'pending','osm','{"osm":{"completed":false,"tile_cursor":0,"consecutive_failures":0,"grid_version":"corridor_0.24_frontier_v1"}}'::jsonb,now(),now()),
  ('focus_corridor_bloomington_il','KC→Chicago Frontier — Bloomington-Normal IL','IL','state_fill',0,-14970,'[40.05,-89.85,41.05,-88.15]'::jsonb,'pending','osm','{"osm":{"completed":false,"tile_cursor":0,"consecutive_failures":0,"grid_version":"corridor_0.24_frontier_v1"}}'::jsonb,now(),now()),
  ('focus_corridor_chicago','KC→Chicago Frontier — Chicago','IL','state_fill',0,-14960,'[41.25,-88.65,42.25,-87.25]'::jsonb,'pending','osm','{"osm":{"completed":false,"tile_cursor":0,"consecutive_failures":0,"grid_version":"corridor_0.24_frontier_v1"}}'::jsonb,now(),now()),
  ('focus_corridor_springfield_mo_branch','KC→Chicago Frontier — Springfield MO Branch','MO','state_fill',0,-14950,'[36.65,-94.05,37.85,-92.65]'::jsonb,'pending','osm','{"osm":{"completed":false,"tile_cursor":0,"consecutive_failures":0,"grid_version":"corridor_0.24_frontier_v1"}}'::jsonb,now(),now())
on conflict (market_key) do update
set name=excluded.name,
    state_code=excluded.state_code,
    priority=excluded.priority,
    bbox=excluded.bbox,
    updated_at=now();

-- Preserve cursors while shelving low-yield / repeatedly failing legacy lanes.
update public.national_ingestion_markets
set status='paused', current_source=null, updated_at=now()
where market_key in ('focus_63101_050_100_s','focus_63101_100_150_e')
  and status in ('running','pending');

-- Keep the nearly-complete/productive northward legacy frontier available behind the new anchors.
update public.national_ingestion_markets
set priority=case market_key
      when 'focus_63101_100_150_n' then -14940
      when 'focus_63101_200_250_n' then -14930
      else priority
    end,
    updated_at=now()
where market_key in ('focus_63101_100_150_n','focus_63101_200_250_n');
