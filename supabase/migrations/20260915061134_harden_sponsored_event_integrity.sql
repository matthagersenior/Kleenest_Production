alter table public.sponsored_campaigns
  drop constraint if exists sponsored_campaign_destination_https_check;
alter table public.sponsored_campaigns
  add constraint sponsored_campaign_destination_https_check
  check (destination_url ~* '^https://');

drop policy if exists sponsored_events_insert_own on public.sponsored_events;
revoke insert on public.sponsored_events from authenticated;

create or replace function public.record_sponsored_event(
  p_campaign_id uuid,
  p_placement_code text,
  p_event_type text,
  p_context_class text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then
    raise exception 'authentication required' using errcode='42501';
  end if;
  if p_event_type not in ('impression','click','dismiss') then
    raise exception 'invalid sponsored event type' using errcode='22023';
  end if;
  if not exists(
    select 1
    from public.sponsored_campaign_placements cp
    join public.sponsored_campaigns c on c.id=cp.campaign_id
    join public.ad_placements p on p.placement_code=cp.placement_code
    where cp.campaign_id=p_campaign_id
      and cp.placement_code=p_placement_code
      and p.active=true and p.owner_enabled=true
      and c.status='active'
      and (c.starts_at is null or c.starts_at<=now())
      and (c.ends_at is null or c.ends_at>now())
  ) then
    raise exception 'sponsored campaign placement is not active' using errcode='22023';
  end if;
  if p_event_type='impression' and exists(
    select 1 from public.sponsored_events e
    where e.user_id=v_user and e.campaign_id=p_campaign_id and e.placement_code=p_placement_code
      and e.event_type='impression' and e.created_at>=now()-interval '60 seconds'
  ) then return; end if;
  insert into public.sponsored_events(campaign_id,placement_code,user_id,event_type,context_class)
  values(p_campaign_id,p_placement_code,v_user,p_event_type,left(coalesce(p_context_class,''),80));
end;
$$;
revoke all on function public.record_sponsored_event(uuid,text,text,text) from public;
grant execute on function public.record_sponsored_event(uuid,text,text,text) to authenticated;
