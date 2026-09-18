create or replace function public.refresh_reputation_for_evidence_user()
returns trigger
language plpgsql
security definer
set search_path to public, auth, extensions, pg_temp
as $$
declare v_user uuid;
begin
  v_user := coalesce(new.user_id, old.user_id);
  if v_user is not null then
    perform public.refresh_contributor_reputation(v_user);
  end if;
  return coalesce(new, old);
exception when others then
  raise warning 'Contributor reputation refresh skipped: %', sqlerrm;
  return coalesce(new, old);
end; $$;

drop trigger if exists reputation_checkin_refresh on public.check_ins;
create trigger reputation_checkin_refresh after insert or update on public.check_ins for each row execute function public.refresh_reputation_for_evidence_user();

drop trigger if exists reputation_observation_refresh on public.restroom_observations;
create trigger reputation_observation_refresh after insert or update or delete on public.restroom_observations for each row execute function public.refresh_reputation_for_evidence_user();

drop trigger if exists reputation_verification_refresh on public.location_bathroom_verifications;
create trigger reputation_verification_refresh after insert or update or delete on public.location_bathroom_verifications for each row execute function public.refresh_reputation_for_evidence_user();

drop trigger if exists reputation_review_refresh on public.reviews;
create trigger reputation_review_refresh after insert or update or delete on public.reviews for each row execute function public.refresh_reputation_for_evidence_user();

drop trigger if exists reputation_amenity_observation_refresh on public.location_amenity_observations;
create trigger reputation_amenity_observation_refresh after insert or update or delete on public.location_amenity_observations for each row execute function public.refresh_reputation_for_evidence_user();
