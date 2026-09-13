
create or replace function public.is_platform_owner_session()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id=auth.uid()
      and (
        coalesce(p.is_platform_owner,false)
        or coalesce(p.is_admin,false)
        or lower(coalesce(p.role::text,'')) in ('admin','platform_admin','super_admin')
      )
  );
$$;

do $$
declare
  v_name text;
  v_def text;
  v_names text[]:=array[
    'admin_authorization_v1',
    'admin_crud_capability_catalog',
    'admin_crud_schema',
    'admin_data_integrity_summary',
    'admin_get_overview',
    'admin_notification_native_push_delivery_health',
    'admin_notification_push_delivery_summary',
    'admin_set_business_tier',
    'admin_user_search'
  ];
begin
  foreach v_name in array v_names loop
    for v_def in
      select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=v_name
    loop
      v_def:=replace(v_def,
        '(''admin'',''owner'',''platform_admin'',''super_admin'')',
        '(''admin'',''platform_admin'',''super_admin'')');
      v_def:=replace(v_def,
        '(''admin'',''owner'',''platform_admin'')',
        '(''admin'',''platform_admin'')');
      v_def:=replace(v_def,
        '(''owner'',''platform_admin'',''super_admin'',''admin'')',
        '(''platform_admin'',''super_admin'',''admin'')');
      execute v_def;
    end loop;
  end loop;
end $$;
