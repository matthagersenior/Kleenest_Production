revoke insert,update,delete,truncate on table public.social_posts from anon;
revoke insert,update,delete,truncate on table public.social_post_comments from anon;
revoke insert,update,delete,truncate on table public.social_post_likes from anon;
revoke insert,update,delete,truncate on table public.social_post_saves from anon;
revoke update,delete on table public.notification_preferences from anon;
revoke insert,update,delete on table public.notification_push_subscriptions from anon;
revoke insert,update,delete on table public.profile_preferences from anon;
