alter table public.location_confidence
  add column if not exists freshness_score numeric not null default 0,
  add column if not exists staleness_status text not null default 'unknown',
  add column if not exists reverification_due_at timestamptz,
  add column if not exists freshness_computed_at timestamptz not null default now();

alter table public.location_confidence drop constraint if exists location_confidence_staleness_status_check;
alter table public.location_confidence add constraint location_confidence_staleness_status_check check (staleness_status = any(array['unknown','fresh','recent','aging','stale','very_stale']));

create table if not exists public.verification_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_verified_at timestamptz,
  last_verified_date date,
  streak_started_at timestamptz,
  last_location_id uuid references public.locations(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.verification_streaks enable row level security;
drop policy if exists verification_streaks_select_own on public.verification_streaks;
create policy verification_streaks_select_own on public.verification_streaks for select to authenticated using (user_id=auth.uid());

create or replace function public.refresh_location_trust_state(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare
  c record;
  v_age_days numeric;
  v_freshness numeric;
  v_status text;
  v_due timestamptz;
  v_conf numeric;
begin
  if p_location_id is null then raise exception 'location is required'; end if;
  select lc.*, l.id as canonical_id into c
  from public.locations l
  left join public.location_confidence lc on lc.location_id=l.id
  where l.id=p_location_id;
  if not found then raise exception 'location not found'; end if;

  v_age_days := case when c.last_verified_at is null then 9999 else greatest(0,extract(epoch from (now()-c.last_verified_at))/86400) end;
  v_freshness := case
    when c.last_verified_at is null then 0
    when v_age_days <= 7 then 100
    when v_age_days <= 30 then round(100 - ((v_age_days-7)/23)*20,2)
    when v_age_days <= 90 then round(80 - ((v_age_days-30)/60)*35,2)
    when v_age_days <= 180 then round(45 - ((v_age_days-90)/90)*30,2)
    else greatest(0,round(15 - least(15,(v_age_days-180)/30),2))
  end;
  v_status := case when c.last_verified_at is null then 'unknown' when v_age_days<=7 then 'fresh' when v_age_days<=30 then 'recent' when v_age_days<=90 then 'aging' when v_age_days<=180 then 'stale' else 'very_stale' end;
  v_due := case when c.last_verified_at is null then now() else c.last_verified_at + case when v_status in ('fresh','recent') then interval '30 days' when v_status='aging' then interval '14 days' else interval '3 days' end end;
  v_conf := coalesce(c.score,0);

  insert into public.location_confidence(location_id,score,level,verification_count,positive_verifications,negative_verifications,source_count,review_count,last_verified_at,computed_at,factors,freshness_score,staleness_status,reverification_due_at,freshness_computed_at)
  values(p_location_id,v_conf,coalesce(c.level,'unknown'),coalesce(c.verification_count,0),coalesce(c.positive_verifications,0),coalesce(c.negative_verifications,0),coalesce(c.source_count,0),coalesce(c.review_count,0),c.last_verified_at,now(),coalesce(c.factors,'{}'::jsonb)||jsonb_build_object('freshness_score',v_freshness,'staleness_status',v_status,'reverification_due_at',v_due,'freshness_age_days',v_age_days),v_freshness,v_status,v_due,now())
  on conflict(location_id) do update set score=excluded.score,level=excluded.level,verification_count=excluded.verification_count,positive_verifications=excluded.positive_verifications,negative_verifications=excluded.negative_verifications,source_count=excluded.source_count,review_count=excluded.review_count,last_verified_at=excluded.last_verified_at,computed_at=now(),factors=excluded.factors,freshness_score=excluded.freshness_score,staleness_status=excluded.staleness_status,reverification_due_at=excluded.reverification_due_at,freshness_computed_at=now();

  return jsonb_build_object('location_id',p_location_id,'confidence_score',v_conf,'freshness_score',v_freshness,'staleness_status',v_status,'last_verified_at',c.last_verified_at,'reverification_due_at',v_due,'freshness_age_days',round(v_age_days,2));
end $function$;

grant execute on function public.refresh_location_trust_state(uuid) to authenticated;
revoke execute on function public.refresh_location_trust_state(uuid) from anon;

create or replace function public.get_location_trust_state(p_location_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare r record;
begin
  if p_location_id is null then raise exception 'location is required'; end if;
  select lc.location_id,lc.score confidence_score,lc.level confidence_level,lc.verification_count,lc.review_count,lc.last_verified_at,lc.freshness_score,lc.staleness_status,lc.reverification_due_at,lc.freshness_computed_at,lc.factors into r from public.location_confidence lc where lc.location_id=p_location_id;
  if not found then return public.refresh_location_trust_state(p_location_id); end if;
  if r.freshness_computed_at < now()-interval '1 hour' then return public.refresh_location_trust_state(p_location_id); end if;
  return to_jsonb(r);
end $function$;

grant execute on function public.get_location_trust_state(uuid) to authenticated;
revoke execute on function public.get_location_trust_state(uuid) from anon;

create or replace function public.record_verification_streak(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare s public.verification_streaks; d date:=current_date; v_streak integer; v_longest integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into s from public.verification_streaks where user_id=auth.uid() for update;
  if not found then
    insert into public.verification_streaks(user_id,current_streak,longest_streak,last_verified_at,last_verified_date,streak_started_at,last_location_id,updated_at)
    values(auth.uid(),1,1,now(),d,now(),p_location_id,now());
    return jsonb_build_object('current_streak',1,'longest_streak',1,'last_verified_date',d,'location_id',p_location_id);
  end if;
  if s.last_verified_date=d then
    update public.verification_streaks set last_verified_at=now(),last_location_id=p_location_id,updated_at=now() where user_id=auth.uid();
    return jsonb_build_object('current_streak',s.current_streak,'longest_streak',s.longest_streak,'last_verified_date',d,'location_id',p_location_id,'already_counted',true);
  end if;
  v_streak := case when s.last_verified_date=d-1 then s.current_streak+1 else 1 end;
  v_longest := greatest(s.longest_streak,v_streak);
  update public.verification_streaks set current_streak=v_streak,longest_streak=v_longest,last_verified_at=now(),last_verified_date=d,streak_started_at=case when s.last_verified_date=d-1 then s.streak_started_at else now() end,last_location_id=p_location_id,updated_at=now() where user_id=auth.uid();
  return jsonb_build_object('current_streak',v_streak,'longest_streak',v_longest,'last_verified_date',d,'location_id',p_location_id,'already_counted',false);
end $function$;

grant execute on function public.record_verification_streak(uuid) to authenticated;
revoke execute on function public.record_verification_streak(uuid) from anon;

create or replace function public.select_reverification_targets(p_limit integer default 25)
returns table(location_id uuid, priority numeric, staleness_status text, freshness_score numeric, confidence_score numeric, last_verified_at timestamptz, reverification_due_at timestamptz)
language sql
stable
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
  select lc.location_id,
    round((case lc.staleness_status when 'very_stale' then 100 when 'stale' then 75 when 'aging' then 45 when 'recent' then 15 else 100 end + greatest(0,100-coalesce(lc.freshness_score,0)) + greatest(0,100-coalesce(lc.score,0))*0.5),2) priority,
    lc.staleness_status,lc.freshness_score,lc.score,lc.last_verified_at,lc.reverification_due_at
  from public.location_confidence lc
  where lc.staleness_status in ('unknown','aging','stale','very_stale') or lc.reverification_due_at<=now()
  order by priority desc,lc.reverification_due_at nulls first
  limit greatest(1,least(coalesce(p_limit,25),100));
$function$;

grant execute on function public.select_reverification_targets(integer) to authenticated;
revoke execute on function public.select_reverification_targets(integer) from anon;
