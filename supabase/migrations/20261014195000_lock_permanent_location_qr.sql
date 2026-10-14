-- One permanent, location-owned QR. A business claim may edit presentation,
-- never the code, check-in destination, or physical placement identity.
create or replace function public.guard_permanent_location_qr()
returns trigger language plpgsql security definer set search_path=''
as $$
declare operator_id uuid;
begin
  if tg_op='DELETE' then
    if coalesce(old.canonical_location_identity,false) then
      raise exception 'PERMANENT_QR_CANNOT_BE_DELETED';
    end if;
    return old;
  end if;
  if not coalesce(old.canonical_location_identity,false) then return new; end if;
  if new.id is distinct from old.id
     or new.code is distinct from old.code
     or new.location_id is distinct from old.location_id
     or new.canonical_location_identity is distinct from true
     or new.active is distinct from true
     or new.single_use is distinct from false
     or new.max_redemptions is not null
     or new.purpose is distinct from old.purpose
     or new.action_type is distinct from old.action_type
     or new.action_payload is distinct from old.action_payload then
    raise exception 'PERMANENT_QR_IDENTITY_LOCKED';
  end if;
  if new.label is distinct from old.label
     or new.customization is distinct from old.customization then
    select coalesce(l.claimed_business_id,l.business_id) into operator_id
    from public.locations l where l.id=old.location_id and coalesce(l.is_active,true);
    if operator_id is null or auth.uid() is null
       or not public.business_can_manage(operator_id)
       or not exists (
         select 1 from public.location_claims c
         join public.businesses b on b.id=c.business_id
         where c.location_id=old.location_id
           and c.business_id=operator_id
           and c.status='approved'
           and b.verification_status::text='verified'
       ) then
       raise exception 'VERIFIED_LOCATION_CLAIM_REQUIRED_FOR_QR_CUSTOMIZATION';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_permanent_location_qr() from public,anon,authenticated;
drop trigger if exists guard_permanent_location_qr on public.qr_codes;
create trigger guard_permanent_location_qr
before update or delete on public.qr_codes
for each row execute function public.guard_permanent_location_qr();
