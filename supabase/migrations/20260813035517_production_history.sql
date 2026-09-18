create or replace function public.join_partner_program(p_program_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_user uuid := auth.uid(); v_enabled boolean;
begin
 if v_user is null then raise exception 'not_authenticated'; end if;
 select enabled into v_enabled from public.partner_programs where id=p_program_id;
 if not found or coalesce(v_enabled,false) is not true then raise exception 'program_unavailable'; end if;
 insert into public.partner_program_memberships(partner_program_id,user_id,status,source,granted_at)
 values(p_program_id,v_user,'active','self_enrolled',now())
 on conflict (partner_program_id,user_id) do update set status='active',expires_at=null;
 select id into v_id from public.partner_program_memberships where partner_program_id=p_program_id and user_id=v_user;
 return v_id;
end;
$$;
grant execute on function public.join_partner_program(uuid) to authenticated;

create or replace function public.accept_partner_agreement(p_agreement_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_partner_business uuid; v_id uuid; v_user uuid := auth.uid();
begin
 if v_user is null then raise exception 'not_authenticated'; end if;
 select partner_business_id into v_partner_business from public.partner_agreements where id=p_agreement_id and status='pending';
 if not found then raise exception 'agreement_not_pending'; end if;
 if not exists(select 1 from public.business_members where business_id=v_partner_business and user_id=v_user and role in ('owner','admin')) then raise exception 'business_admin_required'; end if;
 update public.partner_agreements set status='active' where id=p_agreement_id and status='pending' returning id into v_id;
 if v_id is null then raise exception 'agreement_not_pending'; end if;
 return v_id;
end;
$$;
grant execute on function public.accept_partner_agreement(uuid) to authenticated;

create or replace function public.list_my_partner_memberships()
returns table(id uuid,partner_program_id uuid,status text,source text,granted_at timestamptz,expires_at timestamptz)
language sql
security invoker
as $$
 select id,partner_program_id,status,source,granted_at,expires_at
 from public.partner_program_memberships
 where user_id=auth.uid()
 order by created_at desc;
$$;
grant execute on function public.list_my_partner_memberships() to authenticated;
