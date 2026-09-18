create or replace function public.create_qr_engagement_program(p_qr_code_id uuid,p_program_type text,p_name text,p_description text default null,p_reward_config jsonb default '{}'::jsonb,p_trigger_count integer default 1)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_business uuid; v_id uuid;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_qr_code_id is null then raise exception 'QR code is required'; end if;
 if nullif(trim(p_name),'') is null then raise exception 'Program name is required'; end if;
 if p_trigger_count < 1 then raise exception 'Trigger count must be at least 1'; end if;
 select business_id into v_business from public.qr_codes where id=p_qr_code_id;
 if v_business is null then raise exception 'QR code not found'; end if;
 if not exists(select 1 from public.business_memberships where business_id=v_business and user_id=v_user and role in ('owner','admin','manager')) then raise exception 'Not authorized for this business'; end if;
 insert into public.qr_engagement_programs(qr_code_id,program_type,name,description,trigger_count,reward_config,active)
 values(p_qr_code_id,coalesce(nullif(trim(p_program_type),''),'engagement'),trim(p_name),nullif(trim(p_description),''),p_trigger_count,coalesce(p_reward_config,'{}'::jsonb),true)
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.create_qr_engagement_program(uuid,text,text,text,jsonb,integer) from public;
grant execute on function public.create_qr_engagement_program(uuid,text,text,text,jsonb,integer) to authenticated;
