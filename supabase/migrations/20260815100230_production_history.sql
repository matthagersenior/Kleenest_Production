update public.locations set bathroom_verification_status='unverified', bathroom_negative_count=0 where bathroom_verification_status='not_a_bathroom';
create unique index if not exists location_verification_points_user_location_reason_uq on public.location_verification_points(user_id,location_id,reason);
create or replace function public.get_location_bathroom_verification(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'status', coalesce(l.bathroom_verification_status,'unverified'),
    'verified', coalesce(l.bathroom_verification_status,'unverified')='verified',
    'positive', coalesce(l.bathroom_positive_count,0),
    'total', coalesce(l.bathroom_verification_count,0),
    'verified_at', l.bathroom_verified_at,
    'verification_once', true,
    'free_required', 3
  ) from public.locations l where l.id=p_location_id;
$$;
