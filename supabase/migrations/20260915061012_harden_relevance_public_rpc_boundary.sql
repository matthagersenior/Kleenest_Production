create policy organic_hero_policy_public_read
on public.organic_hero_policies
for select
to anon,authenticated
using (active=true);

grant select(surface_code,active,max_cards,allowed_kinds,weights,swipe_enabled,dot_indicators,autoplay)
on public.organic_hero_policies
to anon,authenticated;

alter function public.consumer_hero_policy(text) security invoker;

revoke execute on function public.consumer_ads_enabled(uuid) from anon;
revoke execute on function public.consumer_sponsored_cards(text,jsonb) from anon;
