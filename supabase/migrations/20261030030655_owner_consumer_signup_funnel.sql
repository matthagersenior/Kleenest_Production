-- Privacy-bounded signup funnel for KleenestOS. Aggregate only, no personal identifiers.
-- Keep the privileged reader in private; the exposed RPC is security invoker.
create or replace function private.owner_consumer_signup_funnel(p_days integer default 7)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_days integer := case when p_days = 30 then 30 else 7 end;
  v_since timestamptz := now() - make_interval(days => case when p_days = 30 then 30 else 7 end);
  v_counts record;
begin
  if auth.uid() is null or not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;

  select
    count(distinct session_key) filter (where event_name='signup_intent' and metadata->>'stage'='view') as signup_views,
    count(distinct session_key) filter (where event_name='signup_intent' and metadata->>'stage'='submitted') as signup_submissions,
    count(distinct session_key) filter (where event_name='signup_intent' and metadata->>'stage'='confirmation_required') as email_confirmation_pending,
    count(distinct session_key) filter (where event_name='signup_intent' and metadata->>'stage'='confirmed_session') as signup_sessions_created,
    count(distinct session_key) filter (where event_name='signup_intent' and metadata->>'stage'='failed') as signup_errors,
    count(distinct session_key) filter (where event_name='signup_intent' and metadata->>'stage'='google_started') as google_signup_starts,
    count(distinct session_key) filter (where event_name='signup_intent' and metadata->>'stage'='google_failed') as google_signup_failures,
    count(distinct session_key) filter (where event_name='continue_guest') as continue_guest,
    count(distinct session_key) filter (where event_name='share') as sharing_sessions,
    count(distinct session_key) filter (where event_name='install_intent') as install_intent,
    count(distinct session_key) filter (where event_name in ('install_success','installed_app_launch')) as installed_evidence
  into v_counts
  from public.acquisition_attribution_events
  where created_at >= v_since;

  return jsonb_build_object(
    'updated_at', now(),
    'days', v_days,
    'signup_views', v_counts.signup_views,
    'signup_submissions', v_counts.signup_submissions,
    'email_confirmation_pending', v_counts.email_confirmation_pending,
    'signup_sessions_created', v_counts.signup_sessions_created,
    'signup_errors', v_counts.signup_errors,
    'google_signup_starts', v_counts.google_signup_starts,
    'google_signup_failures', v_counts.google_signup_failures,
    'continue_guest', v_counts.continue_guest,
    'sharing_sessions', v_counts.sharing_sessions,
    'install_intent', v_counts.install_intent,
    'installed_evidence', v_counts.installed_evidence,
    'registered_accounts_created', (
      select count(*) from auth.users u
      where u.created_at >= v_since and not coalesce(u.is_anonymous,false) and u.deleted_at is null
    )
  );
end
$function$;

revoke all on function private.owner_consumer_signup_funnel(integer) from public, anon;
grant execute on function private.owner_consumer_signup_funnel(integer) to authenticated;

create or replace function public.owner_consumer_signup_funnel(p_days integer default 7)
returns jsonb
language sql stable security invoker set search_path=''
as $function$ select private.owner_consumer_signup_funnel(p_days); $function$;

revoke all on function public.owner_consumer_signup_funnel(integer) from public, anon;
grant execute on function public.owner_consumer_signup_funnel(integer) to authenticated;
