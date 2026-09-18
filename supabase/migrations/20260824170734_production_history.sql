begin;
create or replace function public.create_qr_engagement_program(p_qr_code_id uuid,p_program_type text,p_name text,p_description text default null,p_reward_config jsonb default '{}'::jsonb,p_trigger_count integer default 1)
returns uuid language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare v_id uuid; v_business uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select coalesce(q.business_id,l.business_id) into v_business from public.qr_codes q left join public.locations l on l.id=q.location_id where q.id=p_qr_code_id;
 if v_business is null or not public.business_can_manage(v_business) then raise exception 'Business management access required'; end if;
 if not public.business_advanced_allowed(v_business) then raise exception 'Business Growth or Enterprise plan required'; end if;
 insert into public.qr_engagement_programs(qr_code_id,program_type,name,description,reward_config,trigger_count) values(p_qr_code_id,p_program_type,p_name,p_description,coalesce(p_reward_config,'{}'::jsonb),greatest(coalesce(p_trigger_count,1),1)) returning id into v_id;
 return v_id;
end; $$;
commit;
