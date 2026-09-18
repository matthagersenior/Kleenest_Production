-- Promotion integrity and lookup performance.
create index if not exists promotions_business_active_idx on public.promotions(business_id, active, starts_at, ends_at);
create index if not exists promotion_redemptions_user_idx on public.promotion_redemptions(user_id, redeemed_at desc);
create index if not exists promotion_redemptions_promotion_idx on public.promotion_redemptions(promotion_id, redeemed_at desc);
create index if not exists partner_programs_business_enabled_idx on public.partner_programs(business_id, enabled);
create index if not exists partner_agreements_program_status_idx on public.partner_agreements(partner_program_id, status);
create index if not exists partner_agreements_business_status_idx on public.partner_agreements(partner_business_id, status);

-- Prevent nonsensical promotion windows and hours.
alter table public.promotions drop constraint if exists promotions_time_window_check;
alter table public.promotions add constraint promotions_time_window_check check (ends_at is null or starts_at is null or ends_at > starts_at);
alter table public.promotions drop constraint if exists promotions_hour_range_check;
alter table public.promotions add constraint promotions_hour_range_check check ((start_hour is null and end_hour is null) or (start_hour between 0 and 23 and end_hour between 0 and 23));

-- A redemption belongs to the authenticated redeemer; clients cannot impersonate another user.
drop policy if exists promotion_redemptions_own_insert on public.promotion_redemptions;
create policy promotion_redemptions_own_insert on public.promotion_redemptions
for insert to authenticated
with check ((select auth.uid()) = user_id);

-- Safe promotion redemption: verifies promotion is active and in its configured time window.
create or replace function public.redeem_promotion(p_promotion_id uuid, p_location_id uuid default null)
returns public.promotion_redemptions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_promotion public.promotions%rowtype;
  v_redemption public.promotion_redemptions%rowtype;
  v_now timestamptz := now();
  v_dow integer := extract(isodow from v_now)::integer;
  v_hour integer := extract(hour from v_now)::integer;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;

  select * into v_promotion
  from public.promotions
  where id = p_promotion_id
    and active = true
    and (starts_at is null or starts_at <= v_now)
    and (ends_at is null or ends_at > v_now);

  if not found then
    raise exception 'promotion is not active';
  end if;

  if v_promotion.days_of_week is not null and array_length(v_promotion.days_of_week, 1) > 0
     and not (v_dow = any(v_promotion.days_of_week)) then
    raise exception 'promotion unavailable today';
  end if;

  if v_promotion.start_hour is not null and v_promotion.end_hour is not null then
    if v_promotion.start_hour <= v_promotion.end_hour then
      if v_hour < v_promotion.start_hour or v_hour >= v_promotion.end_hour then
        raise exception 'promotion unavailable at this time';
      end if;
    else
      if v_hour < v_promotion.start_hour and v_hour >= v_promotion.end_hour then
        raise exception 'promotion unavailable at this time';
      end if;
    end if;
  end if;

  if p_location_id is not null and v_promotion.location_id is not null and p_location_id <> v_promotion.location_id then
    raise exception 'promotion is for a different location';
  end if;

  insert into public.promotion_redemptions(promotion_id, user_id, location_id)
  values (p_promotion_id, (select auth.uid()), p_location_id)
  returning * into v_redemption;

  return v_redemption;
end;
$$;
revoke execute on function public.redeem_promotion(uuid,uuid) from anon;
grant execute on function public.redeem_promotion(uuid,uuid) to authenticated;
