create or replace function public.create_business_for_current_user(p_name text, p_address text, p_phone text default '', p_website text default '', p_place_type text default 'other')
returns uuid
language plpgsql
security definer
set search_path=public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_name text := nullif(trim(p_name),'');
  v_address text := nullif(trim(p_address),'');
  v_phone text := nullif(trim(p_phone),'');
  v_website text := nullif(trim(p_website),'');
  v_place_type text := nullif(trim(p_place_type),'');
  v_business uuid;
  v_location uuid;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if v_name is null then raise exception 'business_name_required'; end if;
  select email into v_email from auth.users where id=v_user;
  perform public.ensure_current_user_profile();

  select b.id into v_business
  from public.businesses b
  join public.business_members bm on bm.business_id=b.id
  where bm.user_id=v_user and bm.role='owner' and lower(trim(b.name))=lower(v_name)
  order by b.created_at desc
  limit 1;

  if v_business is null then
    insert into public.businesses(name,website,phone,email,business_tier,verification_status,is_demo_test)
    values(v_name,v_website,v_phone,v_email,'standard','pending',false)
    returning id into v_business;
    insert into public.business_members(business_id,user_id,role)
    values(v_business,v_user,'owner');
  else
    update public.businesses
    set website=coalesce(v_website,website), phone=coalesce(v_phone,phone), email=coalesce(v_email,email), is_demo_test=false, updated_at=now()
    where id=v_business;
  end if;

  update public.profiles
  set is_business_user=true, updated_at=now()
  where id=v_user;

  if v_address is not null then
    select l.id into v_location
    from public.locations l
    where l.business_id=v_business
      and lower(trim(coalesce(l.address,'')))=lower(v_address)
      and lower(trim(l.name))=lower(v_name)
    order by l.created_at desc
    limit 1;

    if v_location is null then
      insert into public.locations(
        business_id,name,address,place_type,phone,website,owner_name,owner_email,
        verification_status,source,is_premium,is_active,created_by
      )
      values(
        v_business,v_name,v_address,v_place_type,v_phone,v_website,
        (select display_name from public.profiles where id=v_user),v_email,
        'pending','business',false,true,v_user
      )
      returning id into v_location;
    else
      update public.locations
      set phone=coalesce(v_phone,phone),website=coalesce(v_website,website),place_type=coalesce(v_place_type,place_type),updated_at=now()
      where id=v_location;
    end if;
  end if;

  return v_business;
end;
$$;

revoke execute on function public.create_business_for_current_user(text,text,text,text,text) from anon, public;
grant execute on function public.create_business_for_current_user(text,text,text,text,text) to authenticated;
