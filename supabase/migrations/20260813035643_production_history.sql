create or replace function public.check_preferred_eligibility(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_tier text; v_program uuid; v_name text; v_partner uuid;
begin
 if v_user is null then return jsonb_build_object('eligible',false,'reason','not_authenticated'); end if;
 select subscription_tier::text into v_tier from public.profiles where id=v_user;
 if v_tier is null or v_tier not in ('premium','fleet','enterprise') then return jsonb_build_object('eligible',false,'reason','tier_not_eligible'); end if;
 select p.id,p.name,p.business_id into v_program,v_name,v_partner
 from public.partner_programs p
 join public.partner_program_memberships ppm on ppm.partner_program_id=p.id and ppm.user_id=v_user and ppm.status='active' and (ppm.expires_at is null or ppm.expires_at>now())
 join public.partner_agreements pa on pa.partner_program_id=p.id and pa.status='active'
 join public.partner_program_locations ppl on ppl.partner_program_id=p.id and ppl.location_id=p_location_id and ppl.status='active' and ppl.benefit_type='preferred_location'
 where p.enabled=true and p.preferred_access=true
 order by p.created_at desc limit 1;
 if v_program is null then return jsonb_build_object('eligible',false,'reason','no_scoped_preferred_program','tier',v_tier); end if;
 return jsonb_build_object('eligible',true,'reason','eligible','tier',v_tier,'partner_program_id',v_program,'program_name',v_name,'partner_business_id',v_partner);
end;
$$;
revoke execute on function public.check_preferred_eligibility(uuid) from anon;
grant execute on function public.check_preferred_eligibility(uuid) to authenticated;

create or replace function public.activate_preferred_location(p_location_id uuid,p_partner_program_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_check jsonb; v_program uuid; v_id uuid; v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'authentication required'; end if;
 v_check:=public.check_preferred_eligibility(p_location_id);
 if coalesce((v_check->>'eligible')::boolean,false)=false then return v_check; end if;
 v_program:=(v_check->>'partner_program_id')::uuid;
 if p_partner_program_id is not null and p_partner_program_id<>v_program then raise exception 'invalid partner program for this location'; end if;
 insert into public.preferred_location_activations(user_id,location_id,partner_program_id)
 values(v_user,p_location_id,v_program)
 on conflict(user_id,location_id,partner_program_id) do update set deactivated_at=null;
 select id into v_id from public.preferred_location_activations where user_id=v_user and location_id=p_location_id and partner_program_id=v_program and deactivated_at is null order by activated_at desc limit 1;
 return v_check||jsonb_build_object('activation_id',v_id);
end;
$$;
revoke execute on function public.activate_preferred_location(uuid,uuid) from anon;
grant execute on function public.activate_preferred_location(uuid,uuid) to authenticated;

create or replace function public.record_preferred_location_use(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_check jsonb; v_activation uuid; v_program uuid;
begin
 v_check:=public.check_preferred_eligibility(p_location_id);
 if coalesce((v_check->>'eligible')::boolean,false)=false then return v_check; end if;
 v_program:=(v_check->>'partner_program_id')::uuid;
 select id into v_activation from public.preferred_location_activations where user_id=auth.uid() and location_id=p_location_id and partner_program_id=v_program and deactivated_at is null order by activated_at desc limit 1;
 if v_activation is null then return jsonb_build_object('ok',false,'reason','preferred_not_activated'); end if;
 update public.preferred_location_activations set last_used_at=now(),use_count=coalesce(use_count,0)+1 where id=v_activation;
 perform public.record_preferred_usage(v_activation,'visited',jsonb_build_object('location_id',p_location_id));
 return jsonb_build_object('ok',true,'activation_id',v_activation,'partner_program_id',v_program);
end;
$$;
revoke execute on function public.record_preferred_location_use(uuid) from anon;
grant execute on function public.record_preferred_location_use(uuid) to authenticated;
