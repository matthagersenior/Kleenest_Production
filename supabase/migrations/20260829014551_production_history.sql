revoke execute on function public.get_business_attribution_funnel(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.get_business_attribution_funnel(uuid, timestamptz, timestamptz) from anon;
grant execute on function public.get_business_attribution_funnel(uuid, timestamptz, timestamptz) to authenticated;
