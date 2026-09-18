insert into public.external_data_sources(source_key,name,source_url,license_name,license_url,attribution_text,active)
values
('osm','OpenStreetMap','https://www.openstreetmap.org','ODbL 1.0','https://opendatacommons.org/licenses/odbl/1-0/','© OpenStreetMap contributors',true),
('data_gov','Data.gov','https://data.gov','U.S. Government open data; dataset-specific terms apply','https://data.gov/about','Source attribution follows the originating dataset and publisher.',true)
on conflict(source_key) do update set name=excluded.name,source_url=excluded.source_url,license_name=excluded.license_name,license_url=excluded.license_url,attribution_text=excluded.attribution_text,active=true,updated_at=now();
