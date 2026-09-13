
create or replace function public.enterprise_create_partner_network(
  p_business_id uuid,
  p_name text
)
returns public.enterprise_partner_networks
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.enterprise_partner_networks;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_capability_allowed(p_business_id,'enterprise.enterprise_networks') then
    raise exception 'Enterprise network capability required';
  end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then
    raise exception 'Network name required';
  end if;

  insert into public.enterprise_partner_networks(owner_business_id,name)
  values(p_business_id,trim(p_name))
  returning * into v;

  return v;
end;
$$;

revoke all on function public.enterprise_create_partner_network(uuid,text) from public,anon;
grant execute on function public.enterprise_create_partner_network(uuid,text) to authenticated,service_role;

create or replace function public.create_enterprise_partner_network(p_name text)
returns public.enterprise_partner_networks
language plpgsql
security definer
set search_path=''
as $$
declare
  v_business_ids uuid[];
  v_business_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select array_agg(bm.business_id order by bm.business_id)
    into v_business_ids
  from public.business_members bm
  where bm.user_id=auth.uid()
    and lower(bm.role::text) in ('owner','admin')
    and public.business_capability_allowed(bm.business_id,'enterprise.enterprise_networks');

  if coalesce(cardinality(v_business_ids),0)=0 then
    raise exception 'Enterprise network capability required';
  end if;
  if cardinality(v_business_ids)>1 then
    raise exception 'Multiple Enterprise businesses available; use enterprise_create_partner_network(business_id, name)';
  end if;

  v_business_id:=v_business_ids[1];
  return public.enterprise_create_partner_network(v_business_id,p_name);
end;
$$;

revoke all on function public.create_enterprise_partner_network(text) from public,anon;
grant execute on function public.create_enterprise_partner_network(text) to authenticated,service_role;

create or replace function public.create_enterprise_partner_campaign(
  p_network_id uuid,
  p_name text,
  p_campaign_type text default 'engagement',
  p_goal text default null
)
returns public.enterprise_partner_campaigns
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.enterprise_partner_campaigns;
  v_business_id uuid;
begin
  select n.owner_business_id into v_business_id
  from public.enterprise_partner_networks n
  where n.id=p_network_id;

  if v_business_id is null then raise exception 'Network not found'; end if;
  if not public.business_capability_allowed(v_business_id,'enterprise.partner_campaigns') then
    raise exception 'Enterprise partner campaign capability required';
  end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then
    raise exception 'Campaign name required';
  end if;

  insert into public.enterprise_partner_campaigns(network_id,name,campaign_type,goal)
  values(p_network_id,trim(p_name),coalesce(nullif(trim(p_campaign_type),''),'engagement'),p_goal)
  returning * into v;

  return v;
end;
$$;

create or replace function public.activate_enterprise_partner_campaign(p_campaign_id uuid)
returns public.enterprise_partner_campaigns
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.enterprise_partner_campaigns;
  v_business_id uuid;
begin
  select n.owner_business_id into v_business_id
  from public.enterprise_partner_campaigns c
  join public.enterprise_partner_networks n on n.id=c.network_id
  where c.id=p_campaign_id;

  if v_business_id is null then raise exception 'Campaign not found'; end if;
  if not public.business_capability_allowed(v_business_id,'enterprise.partner_campaigns') then
    raise exception 'Enterprise partner campaign capability required';
  end if;

  update public.enterprise_partner_campaigns
     set status='active',
         activated_at=coalesce(activated_at,now()),
         paused_at=null
   where id=p_campaign_id
   returning * into v;

  return v;
end;
$$;

create or replace function public.pause_enterprise_partner_campaign(p_campaign_id uuid)
returns public.enterprise_partner_campaigns
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.enterprise_partner_campaigns;
  v_business_id uuid;
begin
  select n.owner_business_id into v_business_id
  from public.enterprise_partner_campaigns c
  join public.enterprise_partner_networks n on n.id=c.network_id
  where c.id=p_campaign_id;

  if v_business_id is null then raise exception 'Campaign not found'; end if;
  if not public.business_capability_allowed(v_business_id,'enterprise.partner_campaigns') then
    raise exception 'Enterprise partner campaign capability required';
  end if;

  update public.enterprise_partner_campaigns
     set status='paused',paused_at=now()
   where id=p_campaign_id
   returning * into v;

  return v;
end;
$$;

create or replace function public.invite_enterprise_partner(
  p_network_id uuid,
  p_partner_business_id uuid
)
returns public.enterprise_partner_network_members
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.enterprise_partner_network_members;
  v_business_id uuid;
begin
  select owner_business_id into v_business_id
  from public.enterprise_partner_networks
  where id=p_network_id;

  if v_business_id is null then raise exception 'Network unavailable'; end if;
  if not public.business_capability_allowed(v_business_id,'enterprise.enterprise_networks') then
    raise exception 'Enterprise network capability required';
  end if;
  if p_partner_business_id=v_business_id then
    raise exception 'Owner business cannot invite itself';
  end if;
  if not exists(select 1 from public.businesses where id=p_partner_business_id) then
    raise exception 'Partner business unavailable';
  end if;

  insert into public.enterprise_partner_network_members(network_id,partner_business_id,status)
  values(p_network_id,p_partner_business_id,'invited')
  on conflict(network_id,partner_business_id) do update set status='invited'
  returning * into v;

  return v;
end;
$$;

create or replace function public.set_enterprise_partner_status(
  p_membership_id uuid,
  p_status text
)
returns public.enterprise_partner_network_members
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.enterprise_partner_network_members;
  v_business_id uuid;
  v_status text:=lower(trim(coalesce(p_status,'')));
begin
  if v_status not in ('active','paused','removed') then
    raise exception 'Invalid partner status';
  end if;

  select n.owner_business_id into v_business_id
  from public.enterprise_partner_network_members m
  join public.enterprise_partner_networks n on n.id=m.network_id
  where m.id=p_membership_id;

  if v_business_id is null then raise exception 'Partner membership unavailable'; end if;
  if not public.business_capability_allowed(v_business_id,'enterprise.enterprise_networks') then
    raise exception 'Enterprise network capability required';
  end if;

  update public.enterprise_partner_network_members
     set status=v_status
   where id=p_membership_id
   returning * into v;

  return v;
end;
$$;

create or replace function public.create_partner_allocation(
  p_network_id uuid,
  p_partner_business_id uuid,
  p_campaign_id uuid,
  p_type text,
  p_quantity numeric,
  p_budget_cents bigint,
  p_rationale text
)
returns public.enterprise_partner_allocations
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.enterprise_partner_allocations;
  v_business_id uuid;
begin
  select owner_business_id into v_business_id
  from public.enterprise_partner_networks
  where id=p_network_id;

  if v_business_id is null then raise exception 'Network unavailable'; end if;
  if not public.business_capability_allowed(v_business_id,'enterprise.allocations') then
    raise exception 'Enterprise allocation capability required';
  end if;
  if not exists(
    select 1 from public.enterprise_partner_network_members
    where network_id=p_network_id
      and partner_business_id=p_partner_business_id
      and status='active'
  ) then raise exception 'Partner not active'; end if;
  if p_campaign_id is not null and not exists(
    select 1 from public.enterprise_partner_campaigns
    where id=p_campaign_id and network_id=p_network_id
  ) then raise exception 'Campaign not in network'; end if;

  insert into public.enterprise_partner_allocations(
    network_id,partner_business_id,campaign_id,allocation_type,quantity,budget_cents,rationale
  )
  values(
    p_network_id,p_partner_business_id,p_campaign_id,p_type,
    greatest(0,coalesce(p_quantity,0)),
    greatest(0,coalesce(p_budget_cents,0)),
    p_rationale
  )
  returning * into v;

  return v;
end;
$$;

create or replace function public.activate_partner_allocation(p_allocation_id uuid)
returns public.enterprise_partner_allocations
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.enterprise_partner_allocations;
  v_business_id uuid;
begin
  select n.owner_business_id into v_business_id
  from public.enterprise_partner_allocations a
  join public.enterprise_partner_networks n on n.id=a.network_id
  where a.id=p_allocation_id;

  if v_business_id is null then raise exception 'Allocation unavailable'; end if;
  if not public.business_capability_allowed(v_business_id,'enterprise.allocations') then
    raise exception 'Enterprise allocation capability required';
  end if;

  update public.enterprise_partner_allocations
     set status='active',activated_at=now()
   where id=p_allocation_id and status='planned'
   returning * into v;

  if v.id is null then raise exception 'Allocation is not planned'; end if;
  return v;
end;
$$;

create or replace function public.record_enterprise_partner_campaign_outcome(
  p_campaign_id uuid,
  p_partner_business_id uuid,
  p_visits bigint default 0,
  p_check_ins bigint default 0,
  p_reviews bigint default 0,
  p_preferred_uses bigint default 0,
  p_access_redemptions bigint default 0,
  p_promotion_redemptions bigint default 0,
  p_attributed_users bigint default 0,
  p_points_awarded bigint default 0
)
returns public.enterprise_partner_campaign_outcomes
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.enterprise_partner_campaign_outcomes;
  v_network_id uuid;
  v_business_id uuid;
begin
  select c.network_id,n.owner_business_id
    into v_network_id,v_business_id
  from public.enterprise_partner_campaigns c
  join public.enterprise_partner_networks n on n.id=c.network_id
  where c.id=p_campaign_id;

  if v_business_id is null then raise exception 'Campaign unavailable'; end if;
  if not public.business_capability_allowed(v_business_id,'enterprise.partner_campaigns') then
    raise exception 'Enterprise partner campaign capability required';
  end if;
  if not exists(
    select 1 from public.enterprise_partner_network_members
    where network_id=v_network_id
      and partner_business_id=p_partner_business_id
      and status='active'
  ) then raise exception 'Partner is not active in network'; end if;

  insert into public.enterprise_partner_campaign_outcomes(
    campaign_id,partner_business_id,visits,check_ins,reviews,preferred_uses,
    access_redemptions,promotion_redemptions,attributed_users,points_awarded
  )
  values(
    p_campaign_id,p_partner_business_id,
    greatest(coalesce(p_visits,0),0),
    greatest(coalesce(p_check_ins,0),0),
    greatest(coalesce(p_reviews,0),0),
    greatest(coalesce(p_preferred_uses,0),0),
    greatest(coalesce(p_access_redemptions,0),0),
    greatest(coalesce(p_promotion_redemptions,0),0),
    greatest(coalesce(p_attributed_users,0),0),
    greatest(coalesce(p_points_awarded,0),0)
  )
  on conflict(campaign_id,partner_business_id,metric_date) do update set
    visits=excluded.visits,
    check_ins=excluded.check_ins,
    reviews=excluded.reviews,
    preferred_uses=excluded.preferred_uses,
    access_redemptions=excluded.access_redemptions,
    promotion_redemptions=excluded.promotion_redemptions,
    attributed_users=excluded.attributed_users,
    points_awarded=excluded.points_awarded
  returning * into v;

  return v;
end;
$$;

create or replace function public.get_enterprise_partner_network(
  p_network_id uuid,
  p_start date default (current_date-30),
  p_end date default current_date
)
returns table(
  network_id uuid,
  network_name text,
  partner_count bigint,
  visits bigint,
  check_ins bigint,
  reviews bigint,
  preferred_uses bigint,
  access_redemptions bigint,
  promotion_redemptions bigint
)
language sql
stable
security definer
set search_path=''
as $$
select
  n.id,n.name,
  count(distinct m.partner_business_id),
  coalesce(sum(x.visits),0),
  coalesce(sum(x.check_ins),0),
  coalesce(sum(x.reviews),0),
  coalesce(sum(x.preferred_uses),0),
  coalesce(sum(x.access_redemptions),0),
  coalesce(sum(x.promotion_redemptions),0)
from public.enterprise_partner_networks n
left join public.enterprise_partner_network_members m
  on m.network_id=n.id and m.status='active'
left join public.enterprise_partner_network_metrics x
  on x.network_id=n.id and x.metric_date between p_start and p_end
where n.id=p_network_id
  and public.business_capability_allowed(n.owner_business_id,'enterprise.enterprise_networks')
group by n.id,n.name;
$$;

create or replace function public.enterprise_update_network(
  p_network_id uuid,
  p_name text,
  p_enabled boolean
)
returns public.enterprise_partner_networks
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.enterprise_partner_networks;
  v_business_id uuid;
begin
  select owner_business_id into v_business_id
  from public.enterprise_partner_networks
  where id=p_network_id;

  if v_business_id is null then raise exception 'Network not found'; end if;
  if not public.business_capability_allowed(v_business_id,'enterprise.enterprise_networks') then
    raise exception 'Enterprise network capability required';
  end if;

  update public.enterprise_partner_networks
     set name=coalesce(nullif(trim(coalesce(p_name,'')),''),name),
         enabled=coalesce(p_enabled,enabled)
   where id=p_network_id
   returning * into v;

  return v;
end;
$$;

create or replace function public.enterprise_delete_network(p_network_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_business_id uuid;
begin
  select owner_business_id into v_business_id
  from public.enterprise_partner_networks
  where id=p_network_id;

  if v_business_id is null then raise exception 'Network not found'; end if;
  if not public.business_capability_allowed(v_business_id,'enterprise.enterprise_networks') then
    raise exception 'Enterprise network capability required';
  end if;

  update public.enterprise_partner_networks
     set enabled=false
   where id=p_network_id;

  return found;
end;
$$;

create or replace function public.enterprise_update_campaign(
  p_campaign_id uuid,
  p_name text,
  p_campaign_type text,
  p_goal text,
  p_status text
)
returns public.enterprise_partner_campaigns
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.enterprise_partner_campaigns;
  v_business_id uuid;
begin
  select n.owner_business_id into v_business_id
  from public.enterprise_partner_campaigns c
  join public.enterprise_partner_networks n on n.id=c.network_id
  where c.id=p_campaign_id;

  if v_business_id is null then raise exception 'Campaign not found'; end if;
  if not public.business_capability_allowed(v_business_id,'enterprise.partner_campaigns') then
    raise exception 'Enterprise partner campaign capability required';
  end if;

  update public.enterprise_partner_campaigns
     set name=coalesce(nullif(trim(coalesce(p_name,'')),''),name),
         campaign_type=coalesce(nullif(trim(coalesce(p_campaign_type,'')),''),campaign_type),
         goal=coalesce(p_goal,goal),
         status=coalesce(nullif(trim(coalesce(p_status,'')),''),status)
   where id=p_campaign_id
   returning * into v;

  return v;
end;
$$;

create or replace function public.enterprise_delete_campaign(p_campaign_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_business_id uuid;
begin
  select n.owner_business_id into v_business_id
  from public.enterprise_partner_campaigns c
  join public.enterprise_partner_networks n on n.id=c.network_id
  where c.id=p_campaign_id;

  if v_business_id is null then raise exception 'Campaign not found'; end if;
  if not public.business_capability_allowed(v_business_id,'enterprise.partner_campaigns') then
    raise exception 'Enterprise partner campaign capability required';
  end if;

  update public.enterprise_partner_campaigns
     set status='cancelled',paused_at=coalesce(paused_at,now())
   where id=p_campaign_id;

  return found;
end;
$$;

create or replace function public.reporting_schedule_scope_authorized(
  p_owner_id uuid,
  p_scope_type text,
  p_scope_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
select case
  when p_owner_id is null then false
  when public.is_platform_owner(p_owner_id) then true

  when lower(coalesce(p_scope_type,''))='business' and p_scope_id is not null then
    exists(
      select 1
      from public.business_members bm
      join public.businesses b on b.id=bm.business_id
      left join public.business_service_entitlements e on e.business_id=b.id
      where bm.business_id=p_scope_id
        and bm.user_id=p_owner_id
        and lower(bm.role::text) in ('owner','admin','manager','analyst')
        and coalesce(e.plan,b.business_tier) in ('growth','fleet','enterprise')
    )

  when lower(coalesce(p_scope_type,''))='fleet' and p_scope_id is not null then
    exists(
      select 1
      from public.business_members bm
      join public.businesses b on b.id=bm.business_id
      left join public.business_service_entitlements e on e.business_id=b.id
      where bm.business_id=p_scope_id
        and bm.user_id=p_owner_id
        and lower(bm.role::text) in (
          'owner','admin','manager','dispatcher',
          'fleet_owner','fleet_manager','fleet_dispatcher',
          'enterprise_owner','enterprise_admin','enterprise_manager'
        )
        and coalesce(e.fleet_enabled,b.business_tier='fleet')
    )

  when lower(coalesce(p_scope_type,''))='enterprise' and p_scope_id is not null then
    exists(
      select 1
      from public.enterprise_partner_networks n
      join public.businesses b on b.id=n.owner_business_id
      left join public.business_service_entitlements e on e.business_id=b.id
      join public.business_members bm on bm.business_id=b.id
      where n.id=p_scope_id
        and bm.user_id=p_owner_id
        and lower(bm.role::text) in (
          'owner','admin','manager',
          'enterprise_owner','enterprise_admin','enterprise_manager'
        )
        and coalesce(e.enterprise_enabled,b.business_tier='enterprise')
    )
  else false
end;
$$;

create or replace function public.publish_live_network_event(
  p_event_type text,
  p_location_id uuid default null,
  p_actor_type text default 'user',
  p_actor_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_user uuid:=auth.uid();
  v_actor_id uuid;
  v_type text:=lower(trim(coalesce(p_actor_type,'user')));
  v_event text:=trim(coalesce(p_event_type,''));
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_event='' then raise exception 'event_type is required'; end if;
  if v_type not in ('user','business','fleet','enterprise') then
    raise exception 'Invalid actor type';
  end if;

  if v_type='user' then
    if p_actor_id is not null and p_actor_id<>v_user then
      raise exception 'Actor identity mismatch';
    end if;
    if v_event not like 'user.%' then
      raise exception 'User actor cannot publish non-user event';
    end if;
    v_actor_id:=v_user;

  elsif v_type='business' then
    if p_actor_id is null or not exists(
      select 1 from public.business_members bm
      where bm.business_id=p_actor_id
        and bm.user_id=v_user
        and lower(bm.role::text) in ('owner','admin','manager')
    ) then raise exception 'Business actor access denied'; end if;
    if v_event not like 'business.%' then
      raise exception 'Business actor cannot publish non-business event';
    end if;
    v_actor_id:=p_actor_id;

  elsif v_type='fleet' then
    if p_actor_id is null
       or not public.fleet_product_enabled(p_actor_id)
       or not public.fleet_actor_is_manager(p_actor_id) then
      raise exception 'Fleet actor access denied';
    end if;
    if v_event not like 'fleet.%' then
      raise exception 'Fleet actor cannot publish non-fleet event';
    end if;
    v_actor_id:=p_actor_id;

  elsif v_type='enterprise' then
    if p_actor_id is null
       or not public.business_enterprise_authorized(p_actor_id)
       or not exists(
         select 1 from public.business_members bm
         where bm.business_id=p_actor_id
           and bm.user_id=v_user
           and lower(bm.role::text) in (
             'owner','admin','manager',
             'enterprise_owner','enterprise_admin','enterprise_manager'
           )
       ) then
      raise exception 'Enterprise actor access denied';
    end if;
    if v_event not like 'enterprise.%' then
      raise exception 'Enterprise actor cannot publish non-enterprise event';
    end if;
    v_actor_id:=p_actor_id;
  end if;

  if p_location_id is not null
     and v_type in ('business','fleet','enterprise')
     and not public.location_belongs_to_business(v_actor_id,p_location_id) then
    raise exception 'Location does not belong to actor business';
  end if;

  insert into public.live_network_events(event_type,location_id,actor_type,actor_id,payload)
  values(v_event,p_location_id,v_type,v_actor_id,coalesce(p_payload,'{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.enterprise_create_partner_network(uuid,text) from public,anon;
revoke all on function public.create_enterprise_partner_network(text) from public,anon;
revoke all on function public.create_enterprise_partner_campaign(uuid,text,text,text) from public,anon;
revoke all on function public.activate_enterprise_partner_campaign(uuid) from public,anon;
revoke all on function public.pause_enterprise_partner_campaign(uuid) from public,anon;
revoke all on function public.invite_enterprise_partner(uuid,uuid) from public,anon;
revoke all on function public.set_enterprise_partner_status(uuid,text) from public,anon;
revoke all on function public.create_partner_allocation(uuid,uuid,uuid,text,numeric,bigint,text) from public,anon;
revoke all on function public.activate_partner_allocation(uuid) from public,anon;
revoke all on function public.record_enterprise_partner_campaign_outcome(uuid,uuid,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint) from public,anon;
revoke all on function public.get_enterprise_partner_network(uuid,date,date) from public,anon;
revoke all on function public.enterprise_update_network(uuid,text,boolean) from public,anon;
revoke all on function public.enterprise_delete_network(uuid) from public,anon;
revoke all on function public.enterprise_update_campaign(uuid,text,text,text,text) from public,anon;
revoke all on function public.enterprise_delete_campaign(uuid) from public,anon;
revoke all on function public.reporting_schedule_scope_authorized(uuid,text,uuid) from public,anon;
revoke all on function public.publish_live_network_event(text,uuid,text,uuid,jsonb) from public,anon;

grant execute on function public.enterprise_create_partner_network(uuid,text) to authenticated,service_role;
grant execute on function public.create_enterprise_partner_network(text) to authenticated,service_role;
grant execute on function public.create_enterprise_partner_campaign(uuid,text,text,text) to authenticated,service_role;
grant execute on function public.activate_enterprise_partner_campaign(uuid) to authenticated,service_role;
grant execute on function public.pause_enterprise_partner_campaign(uuid) to authenticated,service_role;
grant execute on function public.invite_enterprise_partner(uuid,uuid) to authenticated,service_role;
grant execute on function public.set_enterprise_partner_status(uuid,text) to authenticated,service_role;
grant execute on function public.create_partner_allocation(uuid,uuid,uuid,text,numeric,bigint,text) to authenticated,service_role;
grant execute on function public.activate_partner_allocation(uuid) to authenticated,service_role;
grant execute on function public.record_enterprise_partner_campaign_outcome(uuid,uuid,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint) to authenticated,service_role;
grant execute on function public.get_enterprise_partner_network(uuid,date,date) to authenticated,service_role;
grant execute on function public.enterprise_update_network(uuid,text,boolean) to authenticated,service_role;
grant execute on function public.enterprise_delete_network(uuid) to authenticated,service_role;
grant execute on function public.enterprise_update_campaign(uuid,text,text,text,text) to authenticated,service_role;
grant execute on function public.enterprise_delete_campaign(uuid) to authenticated,service_role;
grant execute on function public.reporting_schedule_scope_authorized(uuid,text,uuid) to authenticated,service_role;
grant execute on function public.publish_live_network_event(text,uuid,text,uuid,jsonb) to authenticated,service_role;
