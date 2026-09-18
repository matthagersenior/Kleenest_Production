revoke execute on function public.record_verification_streak(uuid) from authenticated;
revoke execute on function public.select_reverification_targets(integer) from authenticated;
grant execute on function public.record_verification_streak(uuid) to service_role;
grant execute on function public.select_reverification_targets(integer) to service_role;
