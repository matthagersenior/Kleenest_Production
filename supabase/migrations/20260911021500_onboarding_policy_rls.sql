-- Keep onboarding policy private while satisfying explicit RLS policy coverage.
drop policy if exists business_onboarding_policy_authenticated_deny on public.business_onboarding_policy;
create policy business_onboarding_policy_authenticated_deny
on public.business_onboarding_policy
for select
to authenticated
using (false);
