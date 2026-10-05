-- Keep the audited Owner CRUD gateway aligned with the canonical table name.
-- The live catalog exposes enterprise_partner_campaign_outcomes; the gateway
-- still referenced the retired enterprise_partner_outcomes name.
-- Safe to replay when the live repair has already been applied.

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_crud_gateway'
    and pg_get_function_identity_arguments(p.oid) = 'p_resource text, p_action text, p_id uuid, p_payload jsonb'
  limit 1;

  if v_definition is null then
    raise exception 'public.admin_crud_gateway(text,text,uuid,jsonb) not found';
  end if;

  if position('enterprise_partner_campaign_outcomes' in v_definition) > 0 then
    return;
  end if;

  if position('enterprise_partner_outcomes' in v_definition) = 0 then
    raise exception 'expected enterprise_partner_outcomes resource marker not found';
  end if;

  v_definition := replace(
    v_definition,
    '''enterprise_partner_outcomes''',
    '''enterprise_partner_campaign_outcomes'''
  );

  execute v_definition;
end
$$;
