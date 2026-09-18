create or replace function public.check_preferred_eligibility(p_location_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_tier subscription_tier; v_program uuid; v_reason text;
begin
 if v_user is null then return jsonb_build_object('eligible',false,'reason','not_authenticated'); end if;
 select subscription_tier into v_tier from public.profiles where id=v_user;
 if v_tier is null or v_tier not in ('premium','fleet','enterprise') then return jsonb_build_object('eligible',false,'reason','tier_not_eligible'); end if;
 select p.id into v_program
 from public.partner_programs p
 join public.partner_program_locations ppl on ppl.partner_program_id=p.id and ppl.location_id=p_location_id and ppl.status='active'
 join public.partner_agreements pa on pa.partner_program_id=p.id and pa.status='active'
 join public.partner_program_memberships ppm on ppm.partner_program_id=p.id and ppm.user_id=v_user and ppm.status='active'
 where p.enabled=true and p.preferred_access=true
 order by p.created_at desc limit 1;
 if v_program is null then return jsonb_build_object('eligible',false,'reason','no_active_partnership','tier',v_tier::text); end if;
 return jsonb_build_object('eligible',true,'reason','active_partner_program','tier',v_tier::text,'partner_program_id',v_program);
end;$$;
grant execute on function public.check_preferred_eligibility(uuid) to authenticated;

create or replace function public.activate_preferred_location(p_location_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_check jsonb; v_program uuid; v_id uuid;
begin
 v_check:=public.check_preferred_eligibility(p_location_id);
 if coalesce((v_check->>'eligible')::boolean,false)=false then return v_check; end if;
 v_program:=(v_check->>'partner_program_id')::uuid;
 insert into public.preferred_location_activations(user_id,location_id,partner_program_id,activated_at,last_used_at,use_count)
 values(v_user,p_location_id,v_program,now(),null,0)
 on conflict (user_id,location_id) do update set partner_program_id=excluded.partner_program_id,activated_at=now(),deactivated_at=null
 returning id into v_id;
 insert into public.analytics_events(event_type,business_id,location_id,user_id,metadata)
 select 'location_view'::analytics_event_type,b.business_id,p_location_id,v_user,jsonb_build_object('preferred_activation_id',v_id,'partner_program_id',v_program)
 from public.locations b where b.id=p_location_id;
 return v_check||jsonb_build_object('activation_id',v_id);
end;$$;
grant execute on function public.activate_preferred_location(uuid) to authenticated;
