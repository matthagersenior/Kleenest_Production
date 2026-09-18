alter table public.single_use_access_purchases
  add column if not exists payment_provider text,
  add column if not exists provider_checkout_session_id text,
  add column if not exists amount_cents integer;

create unique index if not exists single_use_access_purchases_checkout_session_uidx
  on public.single_use_access_purchases(provider_checkout_session_id)
  where provider_checkout_session_id is not null;

alter table public.single_use_access_purchases
  drop constraint if exists single_use_access_purchases_amount_cents_check;
alter table public.single_use_access_purchases
  add constraint single_use_access_purchases_amount_cents_check check (amount_cents is null or amount_cents >= 0);

create or replace function public.fulfill_single_use_access_checkout(
  p_user_id uuid,
  p_offer_id uuid,
  p_checkout_session_id text,
  p_amount_cents integer
)
returns public.single_use_access_purchases
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  o public.single_use_access_offers;
  p public.single_use_access_purchases;
begin
  if p_user_id is null or p_offer_id is null or nullif(trim(p_checkout_session_id),'') is null then
    raise exception 'checkout fulfillment identifiers are required';
  end if;

  select * into p
  from public.single_use_access_purchases
  where provider_checkout_session_id = p_checkout_session_id;
  if found then return p; end if;

  select * into o
  from public.single_use_access_offers
  where id = p_offer_id
    and enabled = true
    and (expires_at is null or expires_at > now())
  for update;
  if not found then raise exception 'offer unavailable'; end if;

  if coalesce(o.price_cents,0) <= 0 then raise exception 'offer does not require paid checkout'; end if;
  if p_amount_cents is distinct from o.price_cents then raise exception 'checkout amount mismatch'; end if;

  if exists(
    select 1 from public.single_use_access_purchases
    where offer_id = p_offer_id and user_id = p_user_id and status = 'purchased'
  ) then raise exception 'already purchased'; end if;

  insert into public.single_use_access_purchases(
    offer_id,user_id,status,payment_provider,provider_checkout_session_id,amount_cents
  ) values (
    p_offer_id,p_user_id,'purchased','stripe',p_checkout_session_id,p_amount_cents
  ) returning * into p;

  perform public.record_data_feature_event(
    'access_offer_purchased',
    'access_offers',
    'user',
    p_user_id,
    null,
    o.business_id,
    null,
    'single_use_access_purchases',
    p.id,
    p_amount_cents,
    o.name,
    jsonb_build_object(
      'offer_id',o.id,
      'partner_program_id',o.partner_program_id,
      'commerce_mode','stripe_checkout',
      'checkout_session_id',p_checkout_session_id
    )
  );

  return p;
end
$$;

revoke all on function public.fulfill_single_use_access_checkout(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.fulfill_single_use_access_checkout(uuid,uuid,text,integer) to service_role;
comment on function public.fulfill_single_use_access_checkout(uuid,uuid,text,integer) is 'Service-role-only idempotent fulfillment for paid single-use access after verified Stripe checkout.';
