create unique index if not exists location_amenity_observations_visit_semantic_uidx on public.location_amenity_observations(user_id, location_id, check_in_id, amenity_id, status) where check_in_id is not null;

create unique index if not exists location_quality_observations_visit_semantic_uidx on public.location_quality_observations(user_id, location_id, check_in_id, overall_stars, cleanliness_score, accessibility_score, safety_score, availability_score, condition_score) where check_in_id is not null;
