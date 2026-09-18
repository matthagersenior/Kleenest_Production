alter table public.qr_codes add column if not exists business_id uuid references public.businesses(id);
update public.qr_codes q set business_id=l.business_id from public.locations l where q.business_id is null and q.location_id=l.id;
alter table public.qr_codes alter column location_id drop not null;
alter table public.qr_codes alter column business_id set not null;
create index if not exists qr_codes_business_id_idx on public.qr_codes(business_id);
create index if not exists qr_codes_business_location_idx on public.qr_codes(business_id,location_id);

drop policy if exists qr_codes_member_advanced_all on public.qr_codes;
create policy qr_codes_member_advanced_all on public.qr_codes for all to authenticated using (exists (select 1 from public.business_members bm join public.businesses b on b.id=qr_codes.business_id where bm.business_id=qr_codes.business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin','manager') and b.business_tier <> 'standard')) with check (exists (select 1 from public.business_members bm join public.businesses b on b.id=qr_codes.business_id where bm.business_id=qr_codes.business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin','manager') and b.business_tier <> 'standard'));

create or replace function public.business_create_custom_qr(p_business_id uuid,p_location_id uuid,p_label text,p_purpose text default 'checkin',p_action_type text default 'checkin',p_action_payload jsonb default '{}'::jsonb,p_customization jsonb default '{}'::jsonb) returns public.qr_codes language plpgsql security definer set search_path=public,pg_temp as $function$
declare v public.qr_codes;
begin
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
 if p_location_id is not null and not exists(select 1 from public.locations l where l.id=p_location_id and l.business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
 insert into public.qr_codes(business_id,location_id,code,label,active,customization,purpose,action_type,action_payload) values(p_business_id,p_location_id,encode(gen_random_bytes(12),'hex'),nullif(trim(p_label),''),true,coalesce(p_customization,'{}'::jsonb),coalesce(nullif(trim(p_purpose),''),'custom'),coalesce(nullif(trim(p_action_type),''),'custom'),coalesce(p_action_payload,'{}'::jsonb)) returning * into v;
 return v;
end;$function$;

create or replace function public.business_update_custom_qr(p_business_id uuid,p_qr_id uuid,p_label text,p_purpose text,p_action_type text,p_action_payload jsonb,p_customization jsonb,p_active boolean default true) returns public.qr_codes language plpgsql security definer set search_path=public,pg_temp as $function$
declare v public.qr_codes;
begin
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
 update public.qr_codes q set label=nullif(trim(p_label),''),purpose=coalesce(nullif(trim(p_purpose),''),'custom'),action_type=coalesce(nullif(trim(p_action_type),''),'custom'),action_payload=coalesce(p_action_payload,'{}'::jsonb),customization=coalesce(p_customization,'{}'::jsonb),active=p_active where q.id=p_qr_id and q.business_id=p_business_id returning q.* into v;
 if v.id is null then raise exception 'QR code not found'; end if;
 return v;
end;$function$;

create or replace function public.business_delete_qr(p_business_id uuid,p_qr_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $function$
begin
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
 delete from public.qr_codes q where q.id=p_qr_id and q.business_id=p_business_id;
 return found;
end;$function$;

create or replace function public.business_set_qr_active(p_business_id uuid,p_qr_id uuid,p_active boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
begin
 if not public.business_admin_allowed(p_business_id) then raise exception 'Admin access required'; end if;
 update public.qr_codes q set active=p_active where q.id=p_qr_id and q.business_id=p_business_id;
 return (select to_jsonb(q) from public.qr_codes q where q.id=p_qr_id and q.business_id=p_business_id);
end;$function$;

create or replace function public.business_manage_qr(p_business_id uuid,p_qr_id uuid,p_location_id uuid,p_action text,p_label text default null,p_active boolean default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v jsonb;
begin
 if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and lower(role) in('owner','admin')) and not exists(select 1 from public.profiles where id=auth.uid() and is_admin=true) then raise exception 'Admin authorization required'; end if;
 if p_action='create' then
   if p_location_id is not null and not exists(select 1 from public.locations where id=p_location_id and business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
   insert into public.qr_codes(business_id,location_id,code,label,active) values(p_business_id,p_location_id,encode(gen_random_bytes(12),'hex'),coalesce(p_label,'Business QR'),coalesce(p_active,true)) returning to_jsonb(qr_codes.*) into v;
 elsif p_action='update' then update public.qr_codes q set label=coalesce(p_label,q.label),active=coalesce(p_active,q.active) where q.id=p_qr_id and q.business_id=p_business_id returning to_jsonb(q.*) into v;
 elsif p_action='activate' then update public.qr_codes q set active=true where q.id=p_qr_id and q.business_id=p_business_id returning to_jsonb(q.*) into v;
 elsif p_action='deactivate' then update public.qr_codes q set active=false where q.id=p_qr_id and q.business_id=p_business_id returning to_jsonb(q.*) into v;
 else raise exception 'Unsupported QR action'; end if;
 if v is null then raise exception 'QR code not found'; end if;
 return v;
end;$function$;
