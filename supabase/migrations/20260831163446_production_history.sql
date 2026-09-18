create or replace function public.business_get_profile(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v public.businesses;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) and not public.is_platform_owner_session() then raise exception 'Business management access required'; end if;
  select * into v from public.businesses where id=p_business_id;
  if v.id is null then raise exception 'Business not found'; end if;
  return jsonb_build_object('id',v.id,'name',v.name,'description',v.description,'website',v.website,'phone',v.phone,'email',v.email,'logo_url',v.logo_url,'business_tier',v.business_tier,'verification_status',v.verification_status,'updated_at',v.updated_at);
end;
$$;
revoke execute on function public.business_get_profile(uuid) from public, anon;
grant execute on function public.business_get_profile(uuid) to authenticated, service_role;
