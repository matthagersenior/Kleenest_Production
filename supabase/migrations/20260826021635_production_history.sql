create table if not exists public.capability_function_classifications (function_signature text primary key, domain text not null, classification text not null check (classification in ('canonical','supporting','compatibility','legacy','duplicate_candidate','trigger_helper')), rationale text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

insert into public.capability_function_classifications(function_signature,domain,classification,rationale) values
('create_check_in(uuid,text)','consumer_checkins','canonical','Canonical consumer check-in creation.'),
('kleenest_map_check_in(uuid,double precision,double precision)','consumer_checkins','canonical','Canonical map check-in entry point.'),
('verify_checkin(text,double precision,double precision)','consumer_checkins','supporting','Verification/provenance step for check-ins.'),
('record_gps_checkin(double precision,double precision,integer)','consumer_checkins','compatibility','Legacy/GPS-specific check-in entry point pending consolidation.'),
('submit_restroom_observation(uuid,uuid,text,numeric,text)','consumer_observations','canonical','Canonical restroom evidence submission.'),
('submit_location_quality_observation(uuid,smallint,numeric,numeric,numeric,numeric,numeric,text,uuid,uuid,jsonb)','consumer_observations','supporting','General location quality observation.'),
('submit_amenity_observation(uuid,uuid,text,numeric,text,uuid,uuid,text,jsonb)','consumer_observations','supporting','Amenity-level observation supporting restroom/location evidence.'),
('record_location_observation(uuid,text,double precision,double precision,double precision,jsonb,numeric,timestamp with time zone)','consumer_observations','supporting','Lower-level observation ingestion primitive.'),
('create_review(uuid,uuid,smallint,numeric,text)','consumer_reviews','canonical','Canonical consumer review creation.'),
('reply_to_review(uuid,text)','consumer_reviews','supporting','Review conversation operation.'),
('business_reply_review(uuid,uuid,text)','consumer_reviews','supporting','Business-side review response.'),
('record_review_amenity_feedback(uuid,uuid[],uuid[])','consumer_reviews','supporting','Review amenity feedback enrichment.'),
('toggle_review_like(uuid)','consumer_reviews','supporting','Review engagement operation.'),
('refresh_contributor_reputation(uuid)','consumer_reputation','canonical','Canonical reputation refresh after evidence contributions.'),
('checkin_rewards_summary(uuid)','consumer_rewards','supporting','Reward summary derived from check-in activity.'),
('review_rewards_summary(uuid)','consumer_rewards','supporting','Reward summary derived from review activity.'),
('process_check_in()','consumer_checkins','trigger_helper','Database trigger helper.'),
('process_review_counter()','consumer_reviews','trigger_helper','Database counter trigger helper.'),
('trg_quest_checkin_activity()','consumer_checkins','trigger_helper','Quest activity trigger helper.'),
('trg_quest_review_activity()','consumer_reviews','trigger_helper','Quest activity trigger helper.'),
('notify_business_review()','consumer_reviews','trigger_helper','Review notification trigger helper.'),
('apply_external_amenity_observation()','consumer_observations','trigger_helper','External observation trigger helper.')
on conflict (function_signature) do update set domain=excluded.domain, classification=excluded.classification, rationale=excluded.rationale, updated_at=now();

create or replace function public.consumer_evidence_loop_health(p_user_id uuid default auth.uid()) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if p_user_id is null or not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'authenticated profile required'; end if;
 select jsonb_build_object(
  'check_ins', coalesce((select count(*) from public.check_ins where user_id=p_user_id),0),
  'observations', coalesce((select count(*) from public.location_quality_observations where user_id=p_user_id),0) + coalesce((select count(*) from public.location_amenity_observations where user_id=p_user_id),0),
  'reviews', coalesce((select count(*) from public.reviews where user_id=p_user_id),0),
  'reputation', (select to_jsonb(r) from public.contributor_reputation r where r.user_id=p_user_id limit 1),
  'loop_complete', exists(select 1 from public.check_ins c where c.user_id=p_user_id) and exists(select 1 from public.reviews r where r.user_id=p_user_id)
 ) into result;
 return result;
end $$;
revoke all on function public.consumer_evidence_loop_health(uuid) from public;
grant execute on function public.consumer_evidence_loop_health(uuid) to authenticated;
