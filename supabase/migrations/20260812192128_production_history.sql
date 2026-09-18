begin;

-- Public discovery view keeps the frontend query simple.
create or replace view public.public_locations as
select l.id,l.name,l.business_id,b.name as business_name,l.address,l.city,l.state,l.postal_code,l.country,l.latitude,l.longitude,l.place_type,l.phone,l.website,l.description,l.verification_status,l.is_premium,l.accessible,l.changing_table,l.cleanliness,l.cleanliness_pct,l.rating,l.review_count,l.cleaning_schedule,l.smart_bathroom
from public.locations l left join public.businesses b on b.id=l.business_id
where l.is_active=true and l.verification_status='verified';

-- Current-user dashboard view.
create or replace view public.my_profile as
select p.id,p.display_name,p.username,p.avatar_url,p.bio,p.role,p.subscription_tier,p.points,p.level,p.streak,p.total_check_ins,p.total_reviews,p.created_at
from public.profiles p where p.id=(select auth.uid());

-- Business dashboard summary with useful counts.
create or replace view public.business_overview as
select b.id,b.name,b.business_tier,b.verification_status,
 count(distinct l.id) filter(where l.is_active) as active_locations,
 count(distinct r.id) filter(where r.status='published') as published_reviews,
 count(distinct c.id) as check_ins,
 count(distinct f.user_id) as favorite_users
from public.businesses b
left join public.locations l on l.business_id=b.id
left join public.reviews r on r.location_id=l.id
left join public.check_ins c on c.location_id=l.id
left join public.favorites f on f.location_id=l.id
group by b.id,b.name,b.business_tier,b.verification_status;

-- Efficient full-text search for restroom discovery.
create index if not exists locations_search_idx on public.locations using gin(to_tsvector('english',coalesce(name,'')||' '||coalesce(address,'')||' '||coalesce(city,'')||' '||coalesce(state,'')));

create or replace function public.search_locations(search_text text default null, max_results integer default 50)
returns setof public.public_locations
language sql stable security invoker set search_path=public as $$
 select * from public.public_locations l
 where search_text is null or trim(search_text)='' or to_tsvector('english',coalesce(l.name,'')||' '||coalesce(l.address,'')||' '||coalesce(l.city,'')||' '||coalesce(l.state,'')) @@ plainto_tsquery('english',search_text)
 order by l.rating desc nulls last,l.review_count desc
 limit greatest(1,least(max_results,200));
$$;

-- Safe helper for frontend auth/session bootstrap.
create or replace function public.current_user_id() returns uuid language sql stable as $$ select auth.uid(); $$;

-- Realtime: enable live notifications/messages for the app.
alter table public.notifications replica identity full;
alter table public.messages replica identity full;
alter table public.check_ins replica identity full;
alter table public.reviews replica identity full;
alter table public.social_posts replica identity full;

-- Add tables to Supabase realtime publication when not already present.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table public.notifications; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then alter publication supabase_realtime add table public.messages; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='check_ins') then alter publication supabase_realtime add table public.check_ins; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reviews') then alter publication supabase_realtime add table public.reviews; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='social_posts') then alter publication supabase_realtime add table public.social_posts; end if;
end $$;

commit;
