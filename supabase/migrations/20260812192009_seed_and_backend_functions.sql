begin;

insert into public.subscription_plans(code,name,tier,price_cents,interval,max_family_members,features) values
('free','Free','free',0,null,null,'{"checkins":true,"reviews":true,"favorites":true}'::jsonb),
('premium','Premium','premium',999,'month',null,'{"advanced_filters":true,"smart_notifications":true,"premium_restrooms":true}'::jsonb),
('family','Family','family',1499,'month',5,'{"family_members":true,"shared_favorites":true}'::jsonb),
('fleet','Fleet / Group','fleet',2999,'month',25,'{"team_members":true,"fleet_dashboard":true}'::jsonb),
('enterprise','Enterprise','enterprise',9999,'month',null,'{"multi_location":true,"analytics":true,"api":true}'::jsonb)
on conflict(code) do update set name=excluded.name,tier=excluded.tier,price_cents=excluded.price_cents,interval=excluded.interval,max_family_members=excluded.max_family_members,features=excluded.features;

insert into public.amenities(name,category) values
('Soap','Hygiene'),('Paper Towels','Hygiene'),('Hand Dryer','Hygiene'),('Baby Changing','Family'),('Showers','Comfort'),('Accessible Stall','Accessibility'),('Family Restroom','Family'),('Vending','Convenience'),('Free Wi-Fi','Technology'),('Drinking Water','Comfort'),('Well Lit','Safety'),('Attended','Safety')
on conflict(name) do nothing;

insert into public.badges(code,name,description,icon,criteria) values
('first_checkin','First Check-in','Complete your first verified check-in','📍','{"check_ins":1}'),
('regular','Regular','Complete 10 verified check-ins','⭐','{"check_ins":10}'),
('trailblazer','Trailblazer','Visit 25 different locations','🧭','{"unique_locations":25}'),
('first_review','First Review','Write your first review','✍️','{"reviews":1}'),
('five_star_reviewer','5-Star Reviewer','Leave 5 reviews','🌟','{"reviews":5}'),
('point_collector','Point Collector','Earn 500 points','🪙','{"points":500}'),
('week_warrior','Week Warrior','Maintain a 7-day streak','🔥','{"streak":7}'),
('month_master','Month Master','Maintain a 30-day streak','🔥','{"streak":30}'),
('premium_member','Premium Member','Join Premium','💎','{"subscription":"premium"}'),
('family_member','Family Member','Join a Family plan','👪','{"subscription":"family"}'),
('community_builder','Community Builder','Submit 5 community reports','🏗️','{"reports":5}'),
('helpful_reviewer','Helpful Reviewer','Receive 10 helpful interactions','👍','{"helpful":10}'),
('explorer','Explorer','Visit 10 cities','🌎','{"cities":10}'),
('cleanliness_champion','Cleanliness Champion','Give 10 cleanliness ratings','🧼','{"cleanliness_ratings":10}'),
('early_adopter','Early Adopter','Join Kleenest during launch','🚀','{"early_adopter":true}')
on conflict(code) do update set description=excluded.description,icon=excluded.icon,criteria=excluded.criteria;

-- Auth -> profile automation
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,display_name,username,avatar_url)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',split_part(coalesce(new.email,''),'@',1)),new.raw_user_meta_data->>'username',new.raw_user_meta_data->>'avatar_url')
 on conflict(id) do nothing;
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Keep derived location ratings/review counts correct.
create or replace function public.refresh_location_rating() returns trigger language plpgsql security definer set search_path=public as $$
declare v_location uuid;
begin
 v_location := coalesce(new.location_id,old.location_id);
 update public.locations l set
   rating = x.avg_stars,
   review_count = x.review_count,
   cleanliness_pct = x.avg_cleanliness,
   updated_at = now()
 from (select location_id,round(avg(stars)::numeric,2) avg_stars,count(*)::integer review_count,round(avg(cleanliness_pct)::numeric,2) avg_cleanliness from public.reviews where location_id=v_location and status='published' group by location_id) x
 where l.id=v_location;
 if not exists(select 1 from public.reviews where location_id=v_location and status='published') then
   update public.locations set rating=null,review_count=0,cleanliness_pct=null,updated_at=now() where id=v_location;
 end if;
 return coalesce(new,old);
end; $$;
drop trigger if exists reviews_refresh_location on public.reviews;
create trigger reviews_refresh_location after insert or update or delete on public.reviews for each row execute function public.refresh_location_rating();

-- Check-in awards points and updates profile counters.
create or replace function public.process_check_in() returns trigger language plpgsql security definer set search_path=public as $$
declare p integer := 10;
begin
 new.points_awarded := p;
 insert into public.point_transactions(user_id,points,reason,reference_id) values(new.user_id,p,'Verified check-in',new.id);
 update public.profiles set points=points+p,total_check_ins=total_check_ins+1,updated_at=now() where id=new.user_id;
 return new;
end; $$;
drop trigger if exists checkin_rewards on public.check_ins;
create trigger checkin_rewards before insert on public.check_ins for each row execute function public.process_check_in();

-- Review counter.
create or replace function public.process_review_counter() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then update public.profiles set total_reviews=total_reviews+1,points=points+25,updated_at=now() where id=new.user_id; insert into public.point_transactions(user_id,points,reason,reference_id) values(new.user_id,25,'Review submitted',new.id); return new; end if;
 if tg_op='DELETE' then update public.profiles set total_reviews=greatest(0,total_reviews-1),updated_at=now() where id=old.user_id; return old; end if;
 return new;
end; $$;
drop trigger if exists review_counter on public.reviews;
create trigger review_counter after insert or delete on public.reviews for each row execute function public.process_review_counter();

-- Useful RPC for map discovery without exposing raw geospatial implementation.
create or replace function public.nearby_locations(lat double precision,lng double precision,radius_meters integer default 8047,limit_count integer default 50)
returns table(id uuid,name text,business_id uuid,address text,city text,state text,latitude double precision,longitude double precision,distance_meters double precision,rating numeric,review_count integer,cleanliness_pct numeric,accessible boolean,changing_table boolean)
language sql stable security invoker set search_path=public,extensions as $$
 select l.id,l.name,l.business_id,l.address,l.city,l.state,l.latitude,l.longitude,
        round(extensions.st_distance(l.geom,extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography)::numeric,1),
        l.rating,l.review_count,l.cleanliness_pct,l.accessible,l.changing_table
 from public.locations l
 where l.is_active=true and l.verification_status='verified' and l.geom is not null
 and extensions.st_dwithin(l.geom,extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography,radius_meters)
 order by l.geom <-> extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography
 limit greatest(1,least(limit_count,200));
$$;

-- Business analytics summary RPC.
create or replace function public.business_dashboard_summary(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns table(event_type public.analytics_event_type,event_count bigint)
language sql stable security invoker set search_path=public as $$
 select event_type,count(*) from public.analytics_events
 where business_id=p_business_id and created_at>=p_start and created_at<p_end
 group by event_type order by event_type;
$$;

-- Seed a few common fixture defaults for future locations via helper.
create or replace function public.create_default_location_data(p_location_id uuid) returns void language plpgsql security invoker set search_path=public as $$
begin
 insert into public.location_fixtures(location_id) values(p_location_id) on conflict(location_id) do nothing;
 insert into public.location_hours(location_id,day_of_week,opens_at,closes_at) select p_location_id,d,'06:00','22:00' from generate_series(0,6) d on conflict(location_id,day_of_week) do nothing;
end; $$;

commit;
