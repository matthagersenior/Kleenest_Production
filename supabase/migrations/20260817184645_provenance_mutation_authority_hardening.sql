revoke insert, update, delete, truncate, references, trigger on public.external_observations from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.location_sources from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.location_amenity_observations from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.location_quality_observations from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.location_bathroom_verifications from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.data_feature_events from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.location_confidence from anon, authenticated;

-- Preserve read access for public/client-facing observation surfaces where existing RLS permits it.
-- Mutations must flow through the existing SECURITY DEFINER observation/verification functions or trusted ingestion paths.
