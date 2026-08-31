create or replace function public.business_update_profile(
  p_business_id uuid,
  p_name text default null,
  p_description text default null,
  p_website text default null,
  p_phone text default null,
  p_email text default null,
  p_logo_url text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v public.businesses;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  update public.businesses
     set name=coalesce(nullif(trim(p_name),''),name),
         description=case when p_description is null then description else nullif(trim(p_description),'') end,
         website=case when p_website is null then website else nullif(trim(p_website),'') end,
         phone=case when p_phone is null then phone else nullif(trim(p_phone),'') end,
         email=case when p_email is null then email else nullif(trim(p_email),'') end,
         logo_url=case when p_logo_url is null then logo_url else nullif(trim(p_logo_url),'') end,
         updated_at=now()
   where id=p_business_id
   returning * into v;
  if v.id is null then raise exception 'Business not found or not authorized'; end if;
  return jsonb_build_object('id',v.id,'name',v.name,'description',v.description,'website',v.website,'phone',v.phone,'email',v.email,'logo_url',v.logo_url,'business_tier',v.business_tier,'verification_status',v.verification_status,'updated_at',v.updated_at);
end;
$$;
revoke execute on function public.business_update_profile(uuid,text,text,text,text,text,text) from public, anon;
grant execute on function public.business_update_profile(uuid,text,text,text,text,text,text) to authenticated, service_role;
