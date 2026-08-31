alter table public.business_restroom_preventive_work_orders
  add column if not exists due_soon_notified_at timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists escalation_level integer not null default 0;

create or replace function public.notify_preventive_work_order_lifecycle()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_type text;
  v_title text;
  v_body text;
  v_location_name text;
  v_amenity_name text;
begin
  if tg_op='INSERT' then v_type:='preventive_work_created'; v_title:='Preventive restroom work created';
  elsif new.status is distinct from old.status and new.status='assigned' then v_type:='preventive_work_assigned'; v_title:='Preventive restroom work assigned';
  elsif new.status is distinct from old.status and new.status='in_progress' then v_type:='preventive_work_started'; v_title:='Preventive restroom work started';
  elsif new.status is distinct from old.status and new.status='completed' then v_type:='preventive_work_completed'; v_title:='Preventive work completed — verification pending';
  elsif new.status is distinct from old.status and new.status='dismissed' then v_type:='preventive_work_dismissed'; v_title:='Preventive restroom work dismissed';
  elsif old.status='dismissed' and new.status='planned' then v_type:='preventive_work_reopened'; v_title:='Preventive restroom work reopened';
  else return new; end if;

  select l.name,a.name into v_location_name,v_amenity_name from public.locations l join public.amenities a on a.id=new.amenity_id where l.id=new.location_id;
  v_body:=coalesce(v_location_name,'A restroom')||' · '||coalesce(v_amenity_name,'Amenity')||' · '||replace(new.recommendation_action,'_',' ');

  insert into public.notifications(user_id,type,title,body,data)
  select distinct x.user_id,v_type,v_title,v_body,
    jsonb_build_object('business_id',new.business_id,'work_order_id',new.id,'location_id',new.location_id,'amenity_id',new.amenity_id,'priority',new.priority,'status',new.status,'due_at',new.due_at,'proof_media_id',new.proof_media_id,'verification_status',new.verification_status,'destination','/location/'||new.location_id::text,'web_destination','/workspace/business?business='||new.business_id::text||'&focus=prevention&work_order='||new.id::text)
  from (
    select bm.user_id from public.business_members bm where bm.business_id=new.business_id and lower(bm.role::text) in ('owner','admin','manager')
    union select new.assigned_to where new.assigned_to is not null
  ) x;
  return new;
end;
$$;
revoke all on function public.notify_preventive_work_order_lifecycle() from public,anon,authenticated;
grant execute on function public.notify_preventive_work_order_lifecycle() to service_role;

drop trigger if exists trg_preventive_work_order_lifecycle_notification on public.business_restroom_preventive_work_orders;
create trigger trg_preventive_work_order_lifecycle_notification after insert or update on public.business_restroom_preventive_work_orders for each row execute function public.notify_preventive_work_order_lifecycle();

create or replace function public.process_preventive_work_order_slas()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare r record; v_due_soon integer:=0; v_escalated integer:=0; v_target integer;
begin
  for r in
    select w.*,l.name location_name,a.name amenity_name
    from public.business_restroom_preventive_work_orders w
    join public.locations l on l.id=w.location_id
    join public.amenities a on a.id=w.amenity_id
    where w.status in ('planned','assigned','in_progress') and w.due_at is not null and w.due_at<=now()+interval '4 hours'
  loop
    if r.due_at>now() and r.due_soon_notified_at is null then
      update public.business_restroom_preventive_work_orders set due_soon_notified_at=now(),updated_at=now() where id=r.id and due_soon_notified_at is null;
      insert into public.notifications(user_id,type,title,body,data)
      select distinct x.user_id,'preventive_work_due_soon','Preventive restroom work due soon',coalesce(r.location_name,'A restroom')||' · '||coalesce(r.amenity_name,'Amenity')||' is due within 4 hours.',jsonb_build_object('business_id',r.business_id,'work_order_id',r.id,'location_id',r.location_id,'amenity_id',r.amenity_id,'priority',r.priority,'due_at',r.due_at,'destination','/location/'||r.location_id::text,'web_destination','/workspace/business?business='||r.business_id::text||'&focus=prevention&work_order='||r.id::text)
      from (select bm.user_id from public.business_members bm where bm.business_id=r.business_id and lower(bm.role::text) in ('owner','admin','manager') union select r.assigned_to where r.assigned_to is not null) x;
      v_due_soon:=v_due_soon+1;
    elsif r.due_at<=now() then
      v_target:=case when now()>=r.due_at+interval '24 hours' then 2 else 1 end;
      if coalesce(r.escalation_level,0)<v_target then
        update public.business_restroom_preventive_work_orders set escalation_level=v_target,escalated_at=now(),updated_at=now() where id=r.id and coalesce(escalation_level,0)<v_target;
        insert into public.notifications(user_id,type,title,body,data)
        select distinct x.user_id,case when v_target>=2 then 'preventive_work_critical_overdue' else 'preventive_work_overdue' end,case when v_target>=2 then 'Critical preventive restroom work overdue' else 'Preventive restroom work overdue' end,coalesce(r.location_name,'A restroom')||' · '||coalesce(r.amenity_name,'Amenity')||' is past its preventive-work deadline.',jsonb_build_object('business_id',r.business_id,'work_order_id',r.id,'location_id',r.location_id,'amenity_id',r.amenity_id,'priority',r.priority,'due_at',r.due_at,'escalation_level',v_target,'destination','/location/'||r.location_id::text,'web_destination','/workspace/business?business='||r.business_id::text||'&focus=prevention&work_order='||r.id::text)
        from (select bm.user_id from public.business_members bm where bm.business_id=r.business_id and lower(bm.role::text) in ('owner','admin','manager') union select r.assigned_to where r.assigned_to is not null) x;
        v_escalated:=v_escalated+1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('due_soon_notified',v_due_soon,'escalated',v_escalated,'processed_at',now());
end;
$$;
revoke all on function public.process_preventive_work_order_slas() from public,anon,authenticated;
grant execute on function public.process_preventive_work_order_slas() to service_role;

do $$ declare j record; begin
  for j in select jobid from cron.job where jobname='kleenest-preventive-work-sla' loop perform cron.unschedule(j.jobid); end loop;
  perform cron.schedule('kleenest-preventive-work-sla','*/15 * * * *','select public.process_preventive_work_order_slas();');
end $$;
