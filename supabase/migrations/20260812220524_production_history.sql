create or replace function public.business_create_promotion(p_business_id uuid,p_location_id uuid,p_title text,p_description text,p_discount text,p_starts_at timestamptz,p_ends_at timestamptz)
returns public.promotions language plpgsql security invoker set search_path=public
as $$ declare v public.promotions; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and coalesce(bm.role,'') in ('owner','admin','manager')) and not exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.is_admin=true) then raise exception 'Not authorized for this business'; end if;
 if p_location_id is not null and not exists(select 1 from public.locations l where l.id=p_location_id and l.business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
 if p_title is null or trim(p_title)='' then raise exception 'Promotion title is required'; end if;
 if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then raise exception 'Promotion end must be after start'; end if;
 insert into public.promotions(business_id,location_id,title,description,discount,starts_at,ends_at,active) values(p_business_id,p_location_id,trim(p_title),nullif(trim(p_description),''),nullif(trim(p_discount),''),p_starts_at,p_ends_at,true) returning * into v;
 return v; end; $$;
revoke execute on function public.business_create_promotion(uuid,uuid,text,text,text,timestamptz,timestamptz) from public; grant execute on function public.business_create_promotion(uuid,uuid,text,text,text,timestamptz,timestamptz) to authenticated;

create or replace function public.business_set_promotion_active(p_promotion_id uuid,p_active boolean)
returns public.promotions language plpgsql security invoker set search_path=public
as $$ declare v public.promotions; v_business uuid; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select business_id into v_business from public.promotions where id=p_promotion_id;
 if v_business is null then raise exception 'Promotion not found'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=v_business and bm.user_id=auth.uid() and coalesce(bm.role,'') in ('owner','admin','manager')) and not exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.is_admin=true) then raise exception 'Not authorized for this business'; end if;
 update public.promotions set active=p_active where id=p_promotion_id returning * into v; return v; end; $$;
revoke execute on function public.business_set_promotion_active(uuid,boolean) from public; grant execute on function public.business_set_promotion_active(uuid,boolean) to authenticated;
