
create or replace function public.business_manage_restroom_preventive_work_order(
  p_business_id uuid,
  p_work_order_id uuid,
  p_action text,
  p_assigned_to uuid default null,
  p_notes text default null,
  p_proof_media_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  w public.business_restroom_preventive_work_orders;
  act text:=lower(trim(coalesce(p_action,'')));
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;

  select * into w
  from public.business_restroom_preventive_work_orders
  where id=p_work_order_id and business_id=p_business_id
  for update;
  if not found then raise exception 'Preventive work order not found'; end if;

  if act='assign' then
    if p_assigned_to is null or not exists(
      select 1 from public.business_members
      where business_id=p_business_id and user_id=p_assigned_to
    ) then raise exception 'Valid business team member required'; end if;

    update public.business_restroom_preventive_work_orders
       set status='assigned',assigned_to=p_assigned_to,assigned_at=now(),updated_at=now()
     where id=w.id;

  elsif act='claim' then
    update public.business_restroom_preventive_work_orders
       set status='assigned',assigned_to=uid,assigned_at=now(),updated_at=now()
     where id=w.id;

  elsif act='start' then
    update public.business_restroom_preventive_work_orders
       set status='in_progress',
           assigned_to=coalesce(assigned_to,uid),
           assigned_at=coalesce(assigned_at,now()),
           started_at=coalesce(started_at,now()),
           updated_at=now()
     where id=w.id;

  elsif act='complete' then
    if length(trim(coalesce(p_notes,'')))<3 then
      raise exception 'Completion notes are required';
    end if;

    if p_proof_media_id is not null and not exists(
      select 1
      from public.location_photos p
      where p.id=p_proof_media_id
        and p.location_id=w.location_id
        and p.origin='business'
        and p.business_id=p_business_id
        and p.moderation_status='visible'
    ) then
      raise exception 'Preventive proof must be visible business-owned media for this work-order location';
    end if;

    update public.business_restroom_preventive_work_orders
       set status='completed',
           completion_notes=p_notes,
           proof_media_id=p_proof_media_id,
           completed_at=now(),
           verification_status='pending',
           verification_outcome=null,
           verification_observation_id=null,
           verified_by=null,
           verified_at=null,
           followup_work_order_id=null,
           updated_at=now()
     where id=w.id;

  elsif act='dismiss' then
    update public.business_restroom_preventive_work_orders
       set status='dismissed',completion_notes=p_notes,dismissed_at=now(),updated_at=now()
     where id=w.id;

  elsif act='reopen' then
    update public.business_restroom_preventive_work_orders
       set status='planned',
           assigned_to=null,
           assigned_at=null,
           started_at=null,
           completed_at=null,
           dismissed_at=null,
           completion_notes=null,
           proof_media_id=null,
           verification_status=null,
           verification_outcome=null,
           verification_observation_id=null,
           verified_by=null,
           verified_at=null,
           followup_work_order_id=null,
           updated_at=now()
     where id=w.id;

  else
    raise exception 'Unsupported preventive work-order action';
  end if;

  select * into w
  from public.business_restroom_preventive_work_orders
  where id=p_work_order_id;

  return to_jsonb(w);
end;
$$;

revoke all on function public.business_manage_restroom_preventive_work_order(uuid,uuid,text,uuid,text,uuid) from public,anon;
grant execute on function public.business_manage_restroom_preventive_work_order(uuid,uuid,text,uuid,text,uuid) to authenticated,service_role;
