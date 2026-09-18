create or replace function public.business_enroll_program_user(p_partner_program_id uuid,p_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_tier text;
begin
 if not exists(select 1 from public.partner_programs pp join public.business_members bm on bm.business_id=pp.business_id where pp.id=p_partner_program_id and bm.user_id=auth.uid()) then raise exception 'not authorized'; end if;
 select lower(subscription_tier) into v_tier from public.profiles where id=p_user_id;
 if v_tier not in ('premium','fleet','enterprise') then raise exception 'user tier is not eligible'; end if;
 insert into public.partner_program_memberships(partner_program_id,user_id,status,source) values(p_partner_program_id,p_user_id,'active','business_program') on conflict(partner_program_id,user_id) do update set status='active',expires_at=null returning id into v_id;
 return v_id;
end;$$;
grant execute on function public.business_enroll_program_user(uuid,uuid) to authenticated;
