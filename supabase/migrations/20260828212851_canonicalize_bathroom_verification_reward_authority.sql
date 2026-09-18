drop trigger if exists gamification_verifications on public.location_bathroom_verifications;

create or replace function public.process_bathroom_verification()
returns trigger
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
begin
  if new.user_id is distinct from auth.uid() then
    raise exception 'verification user mismatch';
  end if;

  update public.locations
     set bathroom_verification_count = coalesce(bathroom_verification_count,0) + 1,
         bathroom_positive_count = coalesce(bathroom_positive_count,0) + case when new.has_public_bathroom then 1 else 0 end,
         bathroom_negative_count = coalesce(bathroom_negative_count,0) + case when new.has_public_bathroom then 0 else 1 end,
         bathroom_verification_status = case when new.has_public_bathroom then 'has_bathroom' else 'no_bathroom' end,
         bathroom_verified_at = now(),
         bathroom_verified_by = new.user_id,
         bathroom_verification_source = coalesce(new.verification_method,'user'),
         updated_at = now()
   where id = new.location_id;

  -- Location state is projection-only here. User progression is awarded by
  -- the canonical evidence RPC, with its own qualifying-visit/idempotency key.
  return new;
end;
$$;
