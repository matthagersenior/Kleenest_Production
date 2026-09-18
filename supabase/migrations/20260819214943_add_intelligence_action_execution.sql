create or replace function public.execute_intelligence_action(p_action_id uuid)
returns public.intelligence_action_links language plpgsql security invoker set search_path=public as $$
declare v public.intelligence_action_links; v_claim uuid; v_uid uuid;
begin
 select * into v from public.intelligence_action_links where id=p_action_id for update;
 if v.id is null then raise exception 'Action not found'; end if;
 v_uid:=auth.uid();
 if v.business_id is not null and not exists(select 1 from public.business_members bm where bm.business_id=v.business_id and bm.user_id=v_uid) then raise exception 'Not authorized'; end if;
 if v.status <> 'suggested' then return v; end if;
 update public.intelligence_action_links set status='accepted',updated_at=now() where id=v.id returning * into v;
 if v.action_type='verify_location' then
   select lc.id into v_claim from public.location_claims lc where lc.location_id=v.location_id and lc.business_id=v.business_id and lc.status='active' order by lc.created_at desc limit 1;
   update public.intelligence_action_links set metadata=metadata||jsonb_build_object('claim_id',v_claim,'next_step','submit_location_verification'),updated_at=now() where id=v.id returning * into v;
 elsif v.action_type='create_promotion' then
   update public.intelligence_action_links set metadata=metadata||jsonb_build_object('next_step','create_promotion','promotion_context',jsonb_build_object('location_id',v.location_id,'reason',v.signal_type)),updated_at=now() where id=v.id returning * into v;
 elsif v.action_type='review_fleet_route' then
   update public.intelligence_action_links set metadata=metadata||jsonb_build_object('next_step','review_fleet_route','location_id',v.location_id),updated_at=now() where id=v.id returning * into v;
 else
   update public.intelligence_action_links set metadata=metadata||jsonb_build_object('next_step','review_intelligence'),updated_at=now() where id=v.id returning * into v;
 end if;
 return v;
end; $$;

create or replace function public.complete_intelligence_action(p_action_id uuid,p_metadata jsonb default '{}'::jsonb)
returns public.intelligence_action_links language plpgsql security invoker set search_path=public as $$
declare v public.intelligence_action_links;
begin
 select * into v from public.intelligence_action_links where id=p_action_id;
 if v.id is null then raise exception 'Action not found'; end if;
 if v.business_id is not null and not exists(select 1 from public.business_members bm where bm.business_id=v.business_id and bm.user_id=auth.uid()) then raise exception 'Not authorized'; end if;
 update public.intelligence_action_links set status='completed',metadata=metadata||coalesce(p_metadata,'{}'::jsonb),updated_at=now() where id=v.id returning * into v;
 return v;
end; $$;
