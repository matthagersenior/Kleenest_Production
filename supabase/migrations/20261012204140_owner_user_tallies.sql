-- Keep anonymous lifecycle totals after account erasure. No deleted identity is retained.
create schema if not exists private;
create table private.user_tally_daily (
  day date primary key,
  signups bigint not null default 0,
  deletions bigint not null default 0
);
create table private.user_tally_tracking (
  singleton boolean primary key default true check(singleton),
  started_at timestamptz not null default now()
);
insert into private.user_tally_tracking(singleton) values(true);
insert into private.user_tally_daily(day,signups)
select (created_at at time zone 'America/Chicago')::date,count(*) from auth.users
where not coalesce(is_anonymous,false) and deleted_at is null group by 1;
create table private.user_tally_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null
);
create index user_tally_activity_seen_idx on private.user_tally_activity(last_seen_at desc);
-- Seed from recorded usage, never from token refresh/sign-in timestamps.
insert into private.user_tally_activity(user_id,last_seen_at)
select e.user_id,max(e.occurred_at) from public.consumer_core_loop_events e
join auth.users u on u.id=e.user_id where not coalesce(u.is_anonymous,false) and u.deleted_at is null group by e.user_id;
create table private.user_tally_guest_activity (
  session_id text primary key,
  last_seen_at timestamptz not null
);
create index user_tally_guest_seen_idx on private.user_tally_guest_activity(last_seen_at);
alter table private.user_tally_daily enable row level security;
alter table private.user_tally_tracking enable row level security;
alter table private.user_tally_activity enable row level security;
alter table private.user_tally_guest_activity enable row level security;
revoke all on private.user_tally_daily,private.user_tally_tracking,private.user_tally_activity,private.user_tally_guest_activity from public,anon,authenticated;

create function private.record_user_tally_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare d date := (now() at time zone 'America/Chicago')::date;
begin
  if tg_op='INSERT' and not coalesce(new.is_anonymous,false) and new.deleted_at is null then
    insert into private.user_tally_daily(day,signups) values(d,1)
    on conflict(day) do update set signups=private.user_tally_daily.signups+1;
  elsif tg_op='DELETE' and not coalesce(old.is_anonymous,false) and old.deleted_at is null then
    insert into private.user_tally_daily(day,deletions) values(d,1)
    on conflict(day) do update set deletions=private.user_tally_daily.deletions+1;
  elsif tg_op='UPDATE' and old.deleted_at is null and new.deleted_at is not null and not coalesce(old.is_anonymous,false) then
    insert into private.user_tally_daily(day,deletions) values(d,1)
    on conflict(day) do update set deletions=private.user_tally_daily.deletions+1;
    delete from private.user_tally_activity where user_id=old.id;
  elsif tg_op='UPDATE' and coalesce(old.is_anonymous,false) and not coalesce(new.is_anonymous,false) and new.deleted_at is null then
    insert into private.user_tally_daily(day,signups) values(d,1)
    on conflict(day) do update set signups=private.user_tally_daily.signups+1;
  end if;
  return coalesce(new,old);
end $$;
revoke all on function private.record_user_tally_lifecycle() from public,anon,authenticated;
create trigger user_tally_lifecycle after insert or delete or update of is_anonymous,deleted_at on auth.users
for each row execute function private.record_user_tally_lifecycle();

create function public.record_app_activity(p_guest_session text default null) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid();
begin
  if uid is not null and exists(select 1 from auth.users where id=uid and not coalesce(is_anonymous,false) and deleted_at is null) then
    insert into private.user_tally_activity(user_id,last_seen_at) values(uid,now())
    on conflict(user_id) do update set last_seen_at=excluded.last_seen_at
    where private.user_tally_activity.last_seen_at < now()-interval '1 minute';
  elsif p_guest_session ~ '^[a-zA-Z0-9-]{20,80}$' then
    insert into private.user_tally_guest_activity(session_id,last_seen_at) values(p_guest_session,now())
    on conflict(session_id) do update set last_seen_at=excluded.last_seen_at
    where private.user_tally_guest_activity.last_seen_at < now()-interval '1 minute';
  end if;
end $$;
revoke all on function public.record_app_activity(text) from public;
grant execute on function public.record_app_activity(text) to anon,authenticated;

create function public.owner_user_tally_snapshot() returns jsonb
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
revoke all on function public.owner_user_tally_snapshot() from public,anon;
grant execute on function public.owner_user_tally_snapshot() to authenticated;
-- Guest sessions are temporary diagnostics, not durable user identities.
select cron.schedule('user-tally-guest-retention','17 4 * * *',
  $$delete from private.user_tally_guest_activity where last_seen_at<now()-interval '31 days'$$);
