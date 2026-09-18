create or replace function public.business_request_partner_agreement(p_partner_program_id uuid,p_partner_business_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_owner uuid;
begin
 select business_id into v_owner from public.partner_programs where id=p_partner_program_id;
 if v_owner is null or not exists(select 1 from public.business_members where business_id=v_owner and user_id=auth.uid()) then raise exception 'not authorized for program'; end if;
 if not exists(select 1 from public.business_members where business_id=p_partner_business_id) then raise exception 'partner business does not exist'; end if;
 insert into public.partner_agreements(partner_program_id,partner_business_id,status) values(p_partner_program_id,p_partner_business_id,'pending') returning id into v_id;
 return v_id;
end;$$;

create or replace function public.business_accept_partner_agreement(p_agreement_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_partner_business uuid;
begin
 select partner_business_id into v_partner_business from public.partner_agreements where id=p_agreement_id and status='pending';
 if v_partner_business is null then raise exception 'agreement not found'; end if;
 if not exists(select 1 from public.business_members where business_id=v_partner_business and user_id=auth.uid()) then raise exception 'not authorized for partner business'; end if;
 update public.partner_agreements set status='active' where id=p_agreement_id;
 return true;
end;$$;

grant execute on function public.business_request_partner_agreement(uuid,uuid) to authenticated;
grant execute on function public.business_accept_partner_agreement(uuid) to authenticated;
