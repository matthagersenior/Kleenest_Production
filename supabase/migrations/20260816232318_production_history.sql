create or replace function public.gamification_activity_trigger() returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  if auth.uid() is null then return new; end if;
  if new.user_id is distinct from auth.uid() then return new; end if;
  if TG_TABLE_NAME='check_ins' then
    perform public.record_gamification_activity('check_in',new.id);
    if not exists(select 1 from public.check_ins where user_id=new.user_id and location_id=new.location_id and id<>new.id) then perform public.record_gamification_activity('location_diversity',new.location_id); end if;
  elsif TG_TABLE_NAME='location_bathroom_verifications' then perform public.record_gamification_activity('verification',new.id);
  elsif TG_TABLE_NAME='reviews' then if new.status='published' then perform public.record_gamification_activity('review',new.id); end if;
  elsif TG_TABLE_NAME='favorites' then perform public.record_gamification_activity('favorite',new.location_id);
  elsif TG_TABLE_NAME='social_posts' then if coalesce(new.status,'published')='published' then perform public.record_gamification_activity('social_post',new.id); end if;
  elsif TG_TABLE_NAME='contest_entries' then perform public.record_gamification_activity('contest_entry',new.contest_id);
  elsif TG_TABLE_NAME='route_events' then if new.event_type='route_completed' then perform public.record_gamification_activity('route_completed',new.route_id); elsif new.event_type='stop_completed' then perform public.record_gamification_activity('route_stop_completed',new.route_stop_id); elsif new.event_type='route_shared' then perform public.record_gamification_activity('share',new.route_id); end if;
  elsif TG_TABLE_NAME='analytics_events' then if new.event_type='qr_scan' then perform public.record_gamification_activity('qr_scan',new.id); elsif new.event_type='event_rsvp' then perform public.record_gamification_activity('event_rsvp',new.event_id); elsif new.event_type='share' then perform public.record_gamification_activity('share',new.id); end if; end if;
  return new;
exception when others then raise warning 'gamification trigger skipped: %',sqlerrm; return new; end;
$function$;
