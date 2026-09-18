create or replace function public.list_single_use_access_purchases()
returns table(id uuid,offer_id uuid,status text,purchased_at timestamptz,redeemed_at timestamptz)
language sql stable security definer set search_path=public
as $$
  select p.id,p.offer_id,p.status,p.purchased_at,p.redeemed_at
  from public.single_use_access_purchases p
  where p.user_id = auth.uid()
  order by p.purchased_at desc;
$$;
revoke all on function public.list_single_use_access_purchases() from public;
grant execute on function public.list_single_use_access_purchases() to authenticated;
