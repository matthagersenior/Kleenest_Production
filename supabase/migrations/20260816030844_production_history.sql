CREATE OR REPLACE FUNCTION public.admin_crud_gateway(p_resource text,p_action text,p_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp AS $function$
declare v_table text; v_sql text; v_cols text; v_select_cols text; v_result jsonb;
begin
if auth.uid() is null then raise exception 'authentication required'; end if;
if not exists(select 1 from public.profiles where id=auth.uid() and is_admin=true) then raise exception 'admin authorization required'; end if;
v_table:=lower(p_resource);
if v_table not in ('profiles','businesses','locations','events','campaigns','contests','partnerships','promotions','reviews','social_posts','badges','reports') then raise exception 'admin resource not allowed: %',p_resource; end if;
if lower(p_action) not in ('list','create','update','delete') then raise exception 'admin action not allowed: %',p_action; end if;
if lower(p_action)='list' then v_sql:=format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from (select * from public.%I limit 100) x',v_table); execute v_sql into v_result; return v_result; end if;
if lower(p_action)='delete' then if p_id is null then raise exception 'record id required'; end if; v_sql:=format('delete from public.%I where id=$1 returning to_jsonb(%I.*)',v_table,v_table); execute v_sql into v_result using p_id; if v_result is null then raise exception 'record not found'; end if; return v_result; end if;
if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'payload must be a JSON object'; end if;
if lower(p_action)='update' and p_id is null then raise exception 'record id required'; end if;
select string_agg(format('%I',key),', ' order by key) into v_cols from jsonb_object_keys(p_payload) key where key<>'id';
if v_cols is null then raise exception 'no editable fields supplied'; end if;
if lower(p_action)='create' then v_sql:=format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) returning to_jsonb(%I.*)',v_table,v_cols,v_cols,v_table,v_table); execute v_sql into v_result using p_payload; return v_result; end if;
select string_agg(format('%I = r.%I',key,key),', ' order by key) into v_select_cols from jsonb_object_keys(p_payload) key where key<>'id';
v_sql:=format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 returning to_jsonb(t.*)',v_table,v_select_cols,v_table); execute v_sql into v_result using p_payload,p_id; if v_result is null then raise exception 'record not found'; end if; return v_result;
end;$function$;
REVOKE ALL ON FUNCTION public.admin_crud_gateway(text,text,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_crud_gateway(text,text,uuid,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_crud_gateway(text,text,uuid,jsonb) TO authenticated;
