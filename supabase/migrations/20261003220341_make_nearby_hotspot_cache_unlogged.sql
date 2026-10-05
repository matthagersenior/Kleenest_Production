-- Nearby responses are disposable acceleration state. Avoid WAL amplification when geographically distributed cold reads populate many cache cells.
alter table kleenest_api_private.nearby_response_cache set unlogged;
