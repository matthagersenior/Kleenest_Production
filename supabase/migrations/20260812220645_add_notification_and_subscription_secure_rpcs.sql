create or replace function public.user_notifications(p_limit integer default 50)
returns setof public.notifications
language sql security invoker set search_path=public
as $$ select n.* from public.notifications n where n.user_id=auth.uid() order by n.created_at desc limit least(greatest(coalesce(p_limit,50),1),100); $$;
revoke execute on function public.user_notifications(integer) from public; grant execute on function public.user_notifications(integer) to authenticated;

create or replace function public.user_subscription_summary()
returns jsonb language sql security invoker set search_path=public
as $$ select jsonb_build_object('profile',jsonb_build_object('subscription_tier',p.subscription_tier),'subscriptions',coalesce((select jsonb_agg(to_jsonb(s) order by s.updated_at desc) from public.subscriptions s where s.user_id=auth.uid()),'[]'::jsonb)) from public.profiles p where p.id=auth.uid(); $$;
revoke execute on function public.user_subscription_summary() from public; grant execute on function public.user_subscription_summary() to authenticated;
