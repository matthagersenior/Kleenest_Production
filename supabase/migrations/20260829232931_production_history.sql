create or replace function public.purchase_single_use_access(p_offer_id uuid)
returns public.single_use_access_purchases
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions', 'pg_temp'
as $function$
declare
  o public.single_use_access_offers;
  p public.single_use_access_purchases;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into o
  from public.single_use_access_offers
  where id=p_offer_id
    and enabled=true
    and (expires_at is null or expires_at>now());
  if not found then raise exception 'offer unavailable'; end if;

  if coalesce(o.price_cents,0) > 0 then
    raise exception 'paid access requires verified checkout';
  end if;

  if exists(
    select 1 from public.single_use_access_purchases
    where offer_id=p_offer_id and user_id=auth.uid() and status='purchased'
  ) then raise exception 'already purchased'; end if;

  insert into public.single_use_access_purchases(offer_id,user_id)
  values(p_offer_id,auth.uid())
  returning * into p;

  perform public.record_data_feature_event(
    'access_offer_purchased',
    'access_offers',
    'user',
    auth.uid(),
    null,
    o.business_id,
    null,
    'single_use_access_purchases',
    p.id,
    o.price_cents,
    o.name,
    jsonb_build_object('offer_id',o.id,'partner_program_id',o.partner_program_id,'commerce_mode','free_claim')
  );

  return p;
end
$function$;
