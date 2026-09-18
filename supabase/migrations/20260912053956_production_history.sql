-- Keep safe public read-only RPCs available while removing unnecessary elevated execution.

alter function public.current_policy_versions()
  security invoker;

alter function public.consumer_nearby_progression_opportunities(double precision,double precision,integer)
  security invoker;

comment on function public.current_policy_versions() is
  'Public read-only policy-version metadata. SECURITY INVOKER is sufficient; no privileged table access is required.';

comment on function public.consumer_nearby_progression_opportunities(double precision,double precision,integer) is
  'Public read-only nearby progression opportunity query. Verified to work for anon under SECURITY INVOKER.';
