
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='business_manage_restroom_remediation'
  limit 1;

  v_def:=replace(
    v_def,
    'select p.storage_path into v_proof_path from public.location_photos p join public.locations l on l.id=p.location_id where p.id=p_proof_media_id and p.location_id=c.location_id and l.business_id=p_business_id;',
    'select p.storage_path into v_proof_path from public.location_photos p where p.id=p_proof_media_id and p.location_id=c.location_id and p.origin=''business'' and p.business_id=p_business_id and p.moderation_status=''visible'';'
  );
  v_def:=replace(
    v_def,
    'left join public.location_photos lp on lp.id=rc.resolution_media_id where rc.id=c.id',
    'left join public.location_photos lp on lp.id=rc.resolution_media_id and lp.moderation_status=''visible'' where rc.id=c.id'
  );
  execute v_def;
end $$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='mobile_location_detail_v1'
    and pg_get_function_identity_arguments(p.oid)='p_location_id uuid'
  limit 1;

  v_def:=replace(
    v_def,
    'where ph.location_id=l.id',
    'where ph.location_id=l.id and ph.moderation_status=''visible'''
  );
  execute v_def;
end $$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_location_recovery_history'
    and pg_get_function_identity_arguments(p.oid)='p_location_id uuid'
  limit 1;

  v_def:=replace(
    v_def,
    'left join public.location_photos lp on lp.id=c.resolution_media_id',
    'left join public.location_photos lp on lp.id=c.resolution_media_id and lp.moderation_status=''visible'''
  );
  v_def:=replace(
    v_def,
    '''proof_available'',resolution_media_id is not null',
    '''proof_available'',proof_storage_path is not null'
  );
  execute v_def;
end $$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_location_preventive_verification_opportunities'
    and pg_get_function_identity_arguments(p.oid)='p_location_id uuid'
  limit 1;

  v_def:=replace(
    v_def,
    'left join public.location_photos lp on lp.id=w.proof_media_id',
    'left join public.location_photos lp on lp.id=w.proof_media_id and lp.moderation_status=''visible'''
  );
  v_def:=replace(
    v_def,
    '''proof_available'',proof_media_id is not null',
    '''proof_available'',proof_storage_path is not null'
  );
  execute v_def;
end $$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_location_remediation_confirmation_opportunities'
    and pg_get_function_identity_arguments(p.oid)='p_location_id uuid'
  limit 1;

  v_def:=replace(
    v_def,
    'left join public.location_photos lp on lp.id=c.resolution_media_id',
    'left join public.location_photos lp on lp.id=c.resolution_media_id and lp.moderation_status=''visible'''
  );
  v_def:=replace(
    v_def,
    '''proof_available'',resolution_media_id is not null',
    '''proof_available'',proof_storage_path is not null'
  );
  execute v_def;
end $$;
