-- Verification/remediation opportunities are user-scoped surfaces.
-- They expose per-user eligibility and proof metadata and should require sign-in.

revoke all on function public.get_location_preventive_verification_opportunities(uuid)
  from public, anon;
grant execute on function public.get_location_preventive_verification_opportunities(uuid)
  to authenticated, service_role;

revoke all on function public.get_location_remediation_confirmation_opportunities(uuid)
  from public, anon;
grant execute on function public.get_location_remediation_confirmation_opportunities(uuid)
  to authenticated, service_role;
