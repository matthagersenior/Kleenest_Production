
do $$
declare
  v_def text;
  v_old text := $old$
        select 1
        from public.qr_codes q
        where q.id=p_qr_id
          and q.business_id=p_business_id
          and lower(coalesce(q.action_type,'')) in ('checkin','check_in','check-in')
          and lower(coalesce(q.purpose,'')) in ('checkin','check_in','check-in')
          and coalesce(q.single_use,false)=false
          and q.max_redemptions is null
          and coalesce(q.customization->>'brand_mode','kleenest')='kleenest'
          and coalesce((q.customization->>'custom_logo_locked')::boolean,true)=true
$old$;
  v_new text := $new$
        select 1
        from public.qr_codes qc
        where qc.id=p_qr_id
          and qc.business_id=p_business_id
          and lower(coalesce(qc.action_type,'')) in ('checkin','check_in','check-in')
          and lower(coalesce(qc.purpose,'')) in ('checkin','check_in','check-in')
          and coalesce(qc.single_use,false)=false
          and qc.max_redemptions is null
          and coalesce(qc.customization->>'brand_mode','kleenest')='kleenest'
          and coalesce((qc.customization->>'custom_logo_locked')::boolean,true)=true
$new$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='qr_studio_upsert_asset'
    and pg_get_function_identity_arguments(p.oid)=
      'p_business_id uuid, p_qr_id uuid, p_location_id uuid, p_patch jsonb, p_change_summary text';

  if v_def is null or position(v_old in v_def)=0 then
    raise exception 'QR basic-lifecycle alias repair anchor not found';
  end if;

  execute replace(v_def,v_old,v_new);
end $$;
