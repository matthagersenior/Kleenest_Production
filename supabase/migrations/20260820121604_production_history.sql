revoke execute on function public.business_manage_event(uuid,uuid,text,text,text,date,time without time zone) from authenticated;
revoke execute on function public.business_manage_event(uuid,uuid,text,text,text,date,text) from authenticated;
revoke execute on function public.business_manage_promotion(uuid,uuid,text,text,text,numeric,boolean,timestamptz,timestamptz) from authenticated;
revoke execute on function public.business_manage_qr(uuid,uuid,uuid,text,text,boolean) from authenticated;

-- Contest functions already use the canonical new-architecture authorization helpers.
-- Keep their return contracts unchanged while making the authorization boundary explicit.
create or replace function public.business_create_contest(p_business_id uuid,p_name text,p_description text default null,p_starts_at timestamptz default now(),p_ends_at timestamptz default null,p_scoring_rules jsonb default '{}'::jsonb,p_rewards jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare cid uuid;
begin
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
 if coalesce(trim(p_name),'')='' then raise exception 'Contest name is required'; end if;
 insert into public.contests(business_id,name,description,starts_at,ends_at,scoring_rules,rewards,status,created_by) values(p_business_id,trim(p_name),p_description,p_starts_at,p_ends_at,coalesce(p_scoring_rules,'{}'::jsonb),coalesce(p_rewards,'{}'::jsonb),case when p_starts_at>now() then 'scheduled' else 'active' end,auth.uid()) returning id into cid;
 return cid;
end $$;

create or replace function public.business_update_contest(p_business_id uuid,p_contest_id uuid,p_name text,p_description text default null,p_starts_at timestamptz default null,p_ends_at timestamptz default null,p_scoring_rules jsonb default '{}'::jsonb,p_rewards jsonb default '{}'::jsonb,p_status text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
 update public.contests set name=trim(p_name),description=p_description,starts_at=coalesce(p_starts_at,starts_at),ends_at=p_ends_at,scoring_rules=coalesce(p_scoring_rules,scoring_rules),rewards=coalesce(p_rewards,rewards),status=coalesce(nullif(trim(p_status),''),status),updated_at=now() where id=p_contest_id and business_id=p_business_id;
 return found;
end $$;

create or replace function public.business_delete_contest(p_business_id uuid,p_contest_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
 delete from public.contests where id=p_contest_id and business_id=p_business_id; return found;
end $$;
