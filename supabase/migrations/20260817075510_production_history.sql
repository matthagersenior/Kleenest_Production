create table if not exists public.pricing_family_catalog_v1 (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  audience text not null check (audience in ('consumer','business')),
  monthly_price_cents integer,
  annual_price_cents integer,
  max_users integer,
  price_note text,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.pricing_family_catalog_v1 (code,name,audience,monthly_price_cents,annual_price_cents,max_users,price_note,features)
values
('free','Free','consumer',0,0,1,'Free with ads','{"ads":true,"basic_user_features":true}'::jsonb),
('premium','Premium','consumer',500,null,1,'$5/month','{"ads_removed":true,"premium_features":true}'::jsonb),
('family_premium','Family Premium','consumer',2000,null,5,'Owner + up to 4 additional people; Premium feature entitlement','{"premium_features":true,"family_members":true,"shared_favorites":true,"no_ads":true}'::jsonb),
('business_standard','Business Standard','business',2000,20000,null,'$20/month or $200/year; basic business metrics','{"basic_stats":true,"advanced_features":false}'::jsonb),
('business_growth','Business Growth','business',5000,50000,null,'$50/month or $500/year; advanced growth features','{"basic_stats":true,"advanced_features":true,"crud":true,"contests":true,"campaigns":true,"qr_studio":true}'::jsonb),
('business_fleet','Business Fleet','business',10000,100000,100,'$100/month or $1,000/year; up to 100 users','{"fleet_features":true,"team_members":true,"advanced_features":true}'::jsonb),
('business_enterprise','Business Enterprise','business',null,null,null,'Tailored to business size; enterprise fleets are >100 users','{"advanced_features":true,"multi_location":true,"inquire":true}'::jsonb)
on conflict (code) do update set
name=excluded.name,audience=excluded.audience,monthly_price_cents=excluded.monthly_price_cents,annual_price_cents=excluded.annual_price_cents,max_users=excluded.max_users,price_note=excluded.price_note,features=excluded.features,active=true,updated_at=now();

create index if not exists pricing_family_catalog_v1_active_idx on public.pricing_family_catalog_v1(active);
