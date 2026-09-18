create or replace function public.send_prioritized_notification(p_scope text,p_business_id uuid default null,p_target text default null,p_title text default 'Kleenest update',p_message text default '',p_priority text default 'normal',p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid; v_target uuid; v_priority text:=case when lower(p_priority) in ('urgent','high','normal','low') then lower(p_priority) else 'normal' end; v_data jsonb; v_role text;
begin
 if nullif(trim(p_message),'') is null then raise exception 'Notification message is required'; end if;
 if p_scope is null or lower(p_scope) not in ('fleet','enterprise') then raise exception 'Unsupported notification scope'; end if;
 if p_business_id is null then raise exception 'Business scope is required'; end if;
 select lower(coalesce(role,'')) into v_role from public.business_memberships where business_id=p_business_id and user_id=auth.uid() and lower(coalesce(status,'active'))='active' limit 1;
 if v_role is null then raise exception 'Not authorized for business notification scope'; end if;
 if v_role not in ('owner','admin','manager','fleet_owner','fleet_manager','enterprise_owner','enterprise_admin','enterprise_manager') then raise exception 'Not authorized to send fleet notifications'; end if;
 if p_target is not null and p_target<>'fleet-network' then
   begin
     v_target:=p_target::uuid;
   exception when invalid_text_representation then
     v_target:=null;
   end;
 end if;
 if v_target is null then v_target:=auth.uid(); end if;
 if v_target<>auth.uid() and not exists(select 1 from public.business_memberships bm where bm.business_id=p_business_id and bm.user_id=v_target and lower(coalesce(bm.status,'active'))='active') then raise exception 'Notification target is outside the business scope'; end if;
 v_data:=coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('scope',lower(p_scope),'business_id',p_business_id,'priority',v_priority,'authorized_sender',auth.uid());
 insert into public.notifications(user_id,type,title,body,data,created_at) values(v_target,'fleet_operational',p_title,p_message,v_data,now()) returning id into v_id;
 return v_id;
end; $$;

grant execute on function public.send_prioritized_notification(text,uuid,text,text,text,text,jsonb) to authenticated;
revoke execute on function public.send_prioritized_notification(text,uuid,text,text,text,text,jsonb) from anon;
