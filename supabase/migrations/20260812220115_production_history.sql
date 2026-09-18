create or replace function public.create_review(p_location_id uuid,p_check_in_id uuid,p_stars smallint,p_cleanliness_pct numeric,p_comment text)
returns public.reviews
language plpgsql
security invoker
set search_path = public
as $$
declare v_review public.reviews;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_stars < 1 or p_stars > 5 then raise exception 'Stars must be between 1 and 5'; end if;
 if p_cleanliness_pct is not null and (p_cleanliness_pct < 0 or p_cleanliness_pct > 100) then raise exception 'Cleanliness must be between 0 and 100'; end if;
 if p_check_in_id is not null and not exists (select 1 from public.check_ins c where c.id=p_check_in_id and c.user_id=auth.uid() and c.location_id=p_location_id) then raise exception 'Check-in does not belong to this user and location'; end if;
 if exists (select 1 from public.reviews r where r.user_id=auth.uid() and r.check_in_id=p_check_in_id and p_check_in_id is not null) then raise exception 'A review already exists for this check-in'; end if;
 insert into public.reviews(location_id,user_id,check_in_id,stars,cleanliness_pct,comment,status) values(p_location_id,auth.uid(),p_check_in_id,p_stars,p_cleanliness_pct,nullif(trim(p_comment),''),'published') returning * into v_review;
 return v_review;
end;
$$;
revoke execute on function public.create_review(uuid,uuid,smallint,numeric,text) from public;
grant execute on function public.create_review(uuid,uuid,smallint,numeric,text) to authenticated;
