-- Show existing registered accounts that were active in each rolling window.
-- This is an operational returning-user measure; it does not retain deleted identities.
create or replace function private.owner_user_tally_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare today date := (now() at time zone 'America/Chicago')::date;
begin
  if auth.uid() is null or not public.is_platform_owner_session() then raise exception 'platform owner access required'; end if;
  return jsonb_build_object(
    'updated_at',now(),'tracking_since',(select started_at from private.user_tally_tracking),
    'current_accounts',(select count(*) from auth.users where not coalesce(is_anonymous,false) and deleted_at is null),
    'total_signups_recorded',(select coalesce(sum(signups),0) from private.user_tally_daily),
    'deleted_accounts_recorded',(select coalesce(sum(deletions),0) from private.user_tally_daily),
    'pending_deletion_requests',(select count(*) from public.account_deletion_requests r join auth.users u on u.id=r.user_id where r.status in ('requested','processing') and u.deleted_at is null),
    'active_24h',(select count(*) from private.user_tally_activity where last_seen_at>=now()-interval '24 hours'),
    'active_7d',(select count(*) from private.user_tally_activity where last_seen_at>=now()-interval '7 days'),
    'active_30d',(select count(*) from private.user_tally_activity where last_seen_at>=now()-interval '30 days'),
    'returning_24h',(select count(*) from private.user_tally_activity a join auth.users u on u.id=a.user_id where a.last_seen_at>=now()-interval '24 hours' and u.created_at<now()-interval '24 hours' and not coalesce(u.is_anonymous,false) and u.deleted_at is null),
    'returning_7d',(select count(*) from private.user_tally_activity a join auth.users u on u.id=a.user_id where a.last_seen_at>=now()-interval '7 days' and u.created_at<now()-interval '7 days' and not coalesce(u.is_anonymous,false) and u.deleted_at is null),
    'returning_30d',(select count(*) from private.user_tally_activity a join auth.users u on u.id=a.user_id where a.last_seen_at>=now()-interval '30 days' and u.created_at<now()-interval '30 days' and not coalesce(u.is_anonymous,false) and u.deleted_at is null),
    'guest_sessions_24h',(select count(*) from private.user_tally_guest_activity where last_seen_at>=now()-interval '24 hours'),
    'guest_sessions_7d',(select count(*) from private.user_tally_guest_activity where last_seen_at>=now()-interval '7 days'),
    'guest_sessions_30d',(select count(*) from private.user_tally_guest_activity where last_seen_at>=now()-interval '30 days'),
    'signups_today',(select coalesce(sum(signups),0) from private.user_tally_daily where day=today),
    'deletions_today',(select coalesce(sum(deletions),0) from private.user_tally_daily where day=today),
    'signups_7d',(select coalesce(sum(signups),0) from private.user_tally_daily where day>=today-6),
    'deletions_7d',(select coalesce(sum(deletions),0) from private.user_tally_daily where day>=today-6),
    'signups_30d',(select coalesce(sum(signups),0) from private.user_tally_daily where day>=today-29),
    'deletions_30d',(select coalesce(sum(deletions),0) from private.user_tally_daily where day>=today-29),
    'daily',coalesce((select jsonb_agg(jsonb_build_object('day',day,'signups',signups,'deletions',deletions,'net',signups-deletions) order by day desc) from private.user_tally_daily where day>=today-29),'[]'::jsonb)
  );
end $$;
revoke all on function private.owner_user_tally_snapshot() from public,anon;
grant execute on function private.owner_user_tally_snapshot() to authenticated;
