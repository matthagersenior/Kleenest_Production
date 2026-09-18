revoke execute on function public.consumer_ads_enabled(uuid) from public, anon;
revoke execute on function public.consumer_feature_access(text,uuid) from public, anon;
grant execute on function public.consumer_ads_enabled(uuid) to authenticated;
grant execute on function public.consumer_feature_access(text,uuid) to authenticated;
