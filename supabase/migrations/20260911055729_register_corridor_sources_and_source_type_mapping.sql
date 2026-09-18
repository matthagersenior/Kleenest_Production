insert into public.external_data_sources(source_key,name,source_url,license_name,license_url,attribution_text,active,updated_at)
values
('overture_places','Overture Maps Places','https://docs.overturemaps.org/guides/places/','CDLA Permissive 2.0 / Apache 2.0 / CC0 1.0 by upstream source','https://docs.overturemaps.org/attribution/','Overture Maps Foundation; preserve applicable upstream attribution',true,now()),
('kcmo_business_licenses','Kansas City MO Business Licenses','https://www.kcmo.gov/city-hall/departments/finance/business-license-search','City of Kansas City public data; dataset-specific terms apply',null,'City of Kansas City, Missouri',true,now()),
('columbia_mo_gis','City of Columbia MO GIS','https://www.como.gov/information-technology/maps/','City of Columbia public GIS; dataset-specific terms and disclaimers apply',null,'City of Columbia, Missouri GIS',true,now()),
('jefferson_city_mo_gis','Jefferson City / Cole County MidMoGIS','https://www.colecounty.org/424/GISMapping','Cole County / Jefferson City public GIS; dataset-specific terms apply',null,'Cole County and City of Jefferson, Missouri MidMoGIS',true,now()),
('springfield_mo_open_data','City of Springfield MO Open Data','https://www.springfieldmo.gov/','City of Springfield public data; redistribution disclaimer required',null,'Data modified from its original source, www.springfieldmo.gov, the official website of the City of Springfield, Missouri. City data are provided without claims as to content, accuracy, timeliness, or completeness and are used at one’s own risk.',true,now()),
('springfield_il_gis','City of Springfield IL GIS','https://www.springfield.il.us/Departments/OPED/SiteSelection/LOIS.aspx','City of Springfield public GIS; dataset-specific terms apply',null,'City of Springfield, Illinois',true,now()),
('bloomington_il_gis','City of Bloomington IL GIS','https://www.bloomingtonil.gov/departments/engineering/resident-community/maps-gis','City of Bloomington public GIS; dataset-specific terms apply',null,'City of Bloomington, Illinois',true,now()),
('normal_il_open_data','Town of Normal IL Open Data','https://www.normalil.gov/','Town of Normal public data; dataset-specific terms apply',null,'Town of Normal, Illinois',true,now()),
('chicago_business_licenses','City of Chicago Business Licenses','https://data.cityofchicago.org/','City of Chicago open data; dataset-specific terms apply',null,'City of Chicago Data Portal',true,now()),
('missouri_open_data','State of Missouri Data Portal','https://data.mo.gov/','State of Missouri public data; dataset-specific terms apply',null,'State of Missouri Data Portal',true,now()),
('illinois_open_data','State of Illinois Open Data','https://data.illinois.gov/','State of Illinois public data; dataset-specific terms apply',null,'State of Illinois Open Data Portal',true,now())
on conflict (source_key) do update set
 name=excluded.name, source_url=excluded.source_url, license_name=excluded.license_name,
 license_url=excluded.license_url, attribution_text=excluded.attribution_text, active=true, updated_at=now();

create table if not exists public.external_source_place_type_map(
 source_key text not null references public.external_data_sources(source_key) on update cascade on delete cascade,
 raw_type text not null,
 canonical_type text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(source_key,raw_type),
 constraint canonical_place_type_check check (canonical_type in ('place','service','shopping','restaurant','cafe','gas_station','restroom','health','park','dog_park','library','public_safety','lodging','road_service','transit','travel'))
);
alter table public.external_source_place_type_map enable row level security;
revoke all on public.external_source_place_type_map from anon,authenticated;
grant select,insert,update,delete on public.external_source_place_type_map to service_role;

create or replace function public.normalize_ingestion_place_type_for_source(p_source_key text,p_value text)
returns text language sql stable set search_path='' as $$
 select coalesce(
   (select m.canonical_type from public.external_source_place_type_map m where m.source_key=p_source_key and m.raw_type=lower(trim(coalesce(p_value,''))) limit 1),
   public.normalize_ingestion_place_type(p_value)
 );
$$;
revoke all on function public.normalize_ingestion_place_type_for_source(text,text) from public;
grant execute on function public.normalize_ingestion_place_type_for_source(text,text) to service_role,postgres;

insert into public.external_source_place_type_map(source_key,raw_type,canonical_type)
values
('overture_places','restaurant','restaurant'),('overture_places','fast_food_restaurant','restaurant'),('overture_places','cafe','cafe'),('overture_places','coffee_shop','cafe'),('overture_places','gas_station','gas_station'),('overture_places','convenience_store','shopping'),('overture_places','supermarket','shopping'),('overture_places','shopping_mall','shopping'),('overture_places','hotel','lodging'),('overture_places','motel','lodging'),('overture_places','hostel','lodging'),('overture_places','hospital','health'),('overture_places','clinic','health'),('overture_places','pharmacy','health'),('overture_places','library','library'),('overture_places','park','park'),('overture_places','police_station','public_safety'),('overture_places','fire_station','public_safety'),('overture_places','bus_station','transit'),('overture_places','train_station','transit'),('overture_places','public_toilet','restroom'),
('kcmo_business_licenses','restaurant','restaurant'),('kcmo_business_licenses','retail','shopping'),('kcmo_business_licenses','gas station','gas_station'),('kcmo_business_licenses','hotel','lodging')
on conflict(source_key,raw_type) do update set canonical_type=excluded.canonical_type,updated_at=now();
