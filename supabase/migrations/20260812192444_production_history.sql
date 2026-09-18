begin;

-- Prevent clients from awarding arbitrary points through direct check-in inserts.
drop policy if exists checkins_own_insert on public.check_ins;

create or replace function public.verify_checkin(p_qr_code text,p_lat double precision default null,p_lng double precision default null)
returns public.check_ins
language plpgsql
security invoker
set search_path=public,extensions
as $$
declare
 v_uid uuid := auth.uid();
 v_qr public.qr_codes%rowtype;
 v_loc public.locations%rowtype;
 v_check public.check_ins%rowtype;
 v_distance double precision;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select * into v_qr from public.qr_codes where code=p_qr_code and active=true limit 1;
 if not found then raise exception 'Invalid or inactive QR code'; end if;
 select * into v_loc from public.locations where id=v_qr.location_id and is_active=true and verification_status='verified';
 if not found then raise exception 'Location is not currently available for check-in'; end if;
 if p_lat is not null and p_lng is not null and v_loc.geom is not null then
   v_distance := extensions.st_distance(v_loc.geom,extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography);
   if v_distance > coalesce(v_loc.geofence_radius_m,250) then raise exception 'You are too far from this location'; end if;
 end if;
 if exists(select 1 from public.check_ins where user_id=v_uid and location_id=v_loc.id and checked_in_at > now()-interval '30 minutes') then
   raise exception 'Already checked in here recently';
 end if;
 insert into public.check_ins(user_id,location_id,qr_code_id,latitude,longitude,distance_meters,verification_method)
 values(v_uid,v_loc.id,v_qr.id,p_lat,p_lng,v_distance,'qr') returning * into v_check;
 return v_check;
end;
$$;

-- Only the verified-checkin RPC may create check-ins.
revoke insert on public.check_ins from anon,authenticated;
grant execute on function public.verify_checkin(text,double precision,double precision) to authenticated;

-- Automatically notify users when they receive a message.
create or replace function public.notify_new_message() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.notifications(user_id,type,title,body,data)
 values(new.to_id,'message','New message','You received a new Kleenest message',jsonb_build_object('message_id',new.id,'from_id',new.from_id));
 return new;
end; $$;
drop trigger if exists message_notification on public.messages;
create trigger message_notification after insert on public.messages for each row execute function public.notify_new_message();

-- Notify businesses when a review is published.
create or replace function public.notify_business_review() returns trigger language plpgsql security definer set search_path=public as $$
declare v_business uuid; v_name text;
begin
 if new.status <> 'published' then return new; end if;
 select l.business_id,l.name into v_business,v_name from public.locations l where l.id=new.location_id;
 if v_business is not null then
   insert into public.notifications(user_id,type,title,body,data)
   select bm.user_id,'review','New review',coalesce('A new review was posted for '||v_name,'A new review was posted'),jsonb_build_object('review_id',new.id,'location_id',new.location_id)
   from public.business_members bm where bm.business_id=v_business;
 end if;
 return new;
end; $$;
drop trigger if exists review_business_notification on public.reviews;
create trigger review_business_notification after insert on public.reviews for each row execute function public.notify_business_review();

-- Lightweight leaderboard view.
create or replace view public.community_leaderboard as
select id,display_name,username,avatar_url,points,level,streak,total_check_ins,total_reviews,
       row_number() over(order by points desc,total_check_ins desc,total_reviews desc,created_at asc) as rank
from public.profiles
where role='customer' and not is_admin;

-- Public leaderboard is intentionally limited to community-safe profile fields.
-- Admin/business analytics remain protected by their table policies.

commit;
