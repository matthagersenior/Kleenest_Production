alter table public.contests add column if not exists business_id uuid references public.businesses(id) on delete cascade;
create index if not exists contests_business_id_idx on public.contests(business_id);

create or replace function public.business_advanced_allowed(p_business_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$ select exists(select 1 from public.businesses b where b.id=p_business_id and b.business_tier::text in ('growth','enterprise')); $$;

create or replace function public.business_create_contest(p_business_id uuid,p_name text,p_description text default null,p_starts_at timestamptz default now(),p_ends_at timestamptz default null,p_scoring_rules jsonb default '{}'::jsonb,p_rewards jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$ declare cid uuid; begin
if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
if coalesce(trim(p_name),'')='' then raise exception 'Contest name is required'; end if;
insert into public.contests(business_id,name,description,starts_at,ends_at,scoring_rules,rewards,status,created_by) values(p_business_id,trim(p_name),p_description,p_starts_at,p_ends_at,coalesce(p_scoring_rules,'{}'::jsonb),coalesce(p_rewards,'{}'::jsonb),case when p_starts_at>now() then 'scheduled' else 'active' end,auth.uid()) returning id into cid; return cid; end; $$;

create or replace function public.business_list_contests(p_business_id uuid)
returns setof public.contests language plpgsql security definer set search_path=public,pg_temp as $$ begin
if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
return query select * from public.contests where business_id=p_business_id order by starts_at desc nulls last,created_at desc; end; $$;

create or replace function public.business_update_contest(p_business_id uuid,p_contest_id uuid,p_name text,p_description text default null,p_starts_at timestamptz default null,p_ends_at timestamptz default null,p_scoring_rules jsonb default '{}'::jsonb,p_rewards jsonb default '{}'::jsonb,p_status text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$ begin
if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
update public.contests set name=trim(p_name),description=p_description,starts_at=coalesce(p_starts_at,starts_at),ends_at=p_ends_at,scoring_rules=coalesce(p_scoring_rules,scoring_rules),rewards=coalesce(p_rewards,rewards),status=coalesce(nullif(trim(p_status),''),status),updated_at=now() where id=p_contest_id and business_id=p_business_id; return found; end; $$;

create or replace function public.business_delete_contest(p_business_id uuid,p_contest_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$ begin
if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
delete from public.contests where id=p_contest_id and business_id=p_business_id; return found; end; $$;

create table if not exists public.pricing_catalog(id uuid primary key default gen_random_uuid(),code text unique not null,name text not null,category text not null,price_cents integer,interval text,max_users integer,max_locations integer,price_note text,features jsonb not null default '{}'::jsonb,active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
insert into public.pricing_catalog(code,name,category,price_cents,interval,max_users,max_locations,price_note,features) values
('free','Free','consumer',0,null,1,null,'Free with ads','{"ads":true,"basic_user_features":true}'),
('premium_user','Premium User','consumer',500,'once',1,null,'One-time purchase; unlocks premium features and removes ads','{"ads_removed":true,"premium_features":true}'),
('family','Family','consumer',1500,'month',5,null,'Up to 5 people','{"family_members":true,"shared_features":true}'),
('fleet','Fleet Users','consumer',7500,'month',20,null,'Up to 20 users','{"team_members":true,"fleet_features":true}'),
('enterprise_users','Enterprise Users','consumer',null,null,null,null,'More than 20 users — inquire','{"inquire":true,"team_members":true}'),
('business_standard','Business Standard','business',2000,'month',null,1,'Basic business stats','{"basic_stats":true,"advanced_features":false}'),
('business_growth','Business Growth','business',5000,'month',null,10,'Up to 10 locations; $50/month per location','{"basic_stats":true,"advanced_features":true,"crud":true,"campaigns":true,"contests":true,"qr_studio":true,"per_location":true}'),
('business_enterprise','Business Enterprise','business',null,null,null,null,'Inquire','{"advanced_features":true,"crud":true,"multi_location":true,"inquire":true}')
on conflict(code) do update set name=excluded.name,category=excluded.category,price_cents=excluded.price_cents,interval=excluded.interval,max_users=excluded.max_users,max_locations=excluded.max_locations,price_note=excluded.price_note,features=excluded.features,active=true,updated_at=now();

update public.subscription_plans set price_cents=0, interval=null, features=coalesce(features,'{}'::jsonb)||'{"ads":true}'::jsonb where code='free';
update public.subscription_plans set price_cents=0, interval='once', features=coalesce(features,'{}'::jsonb)||'{"ads_removed":true,"one_time_unlock":true}'::jsonb where code='premium';
update public.subscription_plans set price_cents=1500, interval='month', max_family_members=5 where code='family';
update public.subscription_plans set price_cents=7500, interval='month', max_family_members=20 where code='fleet';
update public.subscription_plans set price_cents=0, interval=null, features=coalesce(features,'{}'::jsonb)||'{"inquire":true}'::jsonb where code='enterprise';
