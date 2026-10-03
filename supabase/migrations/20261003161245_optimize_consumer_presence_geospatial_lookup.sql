-- Production hot-path recovery: consumer presence used a Haversine expression over
-- the full active location set. Keep this source-controlled marker tied to the
-- live migration; the authoritative live function uses locations.geom + ST_DWithin
-- with locations_active_geom_idx before applying the per-location geofence radius.
--
-- Applied directly to Production during recovery as ledger migration
-- optimize_consumer_presence_geospatial_lookup.
-- No duplicate DDL here: this timestamped marker records the already-applied recovery.
select 1;
