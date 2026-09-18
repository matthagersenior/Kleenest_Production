create or replace function public.redeem_qr_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  q record;
  r integer;
  ci jsonb;
  v_attribution_id uuid;
begin
  if u is null then raise exception 'Authentication required'; end if;

  select * into q
  from public.qr_codes
  where code=trim(p_code) and active=true
  limit 1;
  if q.id is null then raise exception 'Invalid or inactive QR code'; end if;

  select count(*) into r
  from public.qr_redemptions
  where qr_code_id=q.id;
  if q.max_redemptions is not null and r>=q.max_redemptions then
    raise exception 'QR redemption limit reached';
  end if;

  if q.single_use and exists(
    select 1 from public.qr_redemptions
    where qr_code_id=q.id and user_id=u
  ) then
    return jsonb_build_object(
      'ok',true,
      'already_redeemed',true,
      'qr_code_id',q.id
    );
  end if;

  ci := public.create_check_in(
    (select id from public.places where location_id=q.location_id and is_active=true limit 1),
    q.code
  );

  insert into public.qr_redemptions(qr_code_id,user_id,check_in_id,metadata)
  values(q.id,u,(ci->>'check_in_id')::uuid,jsonb_build_object('action_type',q.action_type));

  v_attribution_id := public.record_qr_attribution(
    q.code,
    coalesce(nullif(trim(q.action_type),''),'check_in'),
    'qr_redeem',
    jsonb_build_object(
      'qr_code_id',q.id,
      'check_in_id',(ci->>'check_in_id')::uuid,
      'redemption_id',q.id
    )
  );

  return ci || jsonb_build_object(
    'qr_code_id',q.id,
    'redeemed',true,
    'attribution_id',v_attribution_id
  );
end;
$function$;
