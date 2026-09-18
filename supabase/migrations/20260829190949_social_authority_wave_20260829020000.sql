create or replace function public.create_social_post(p_content text,p_kind text default 'post',p_location_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_post jsonb;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if nullif(trim(p_content),'') is null then raise exception 'Post content cannot be empty'; end if;
 if length(trim(p_content))>1000 then raise exception 'Post content must be 1000 characters or fewer'; end if;
 if p_location_id is not null and not exists(select 1 from public.places where id=p_location_id) then raise exception 'Location not found'; end if;
 insert into public.social_posts(user_id,content,kind,location_id) values(v_user,trim(p_content),coalesce(nullif(trim(p_kind),''),'post'),p_location_id)
 returning jsonb_build_object('id',id,'user_id',user_id,'content',content,'kind',kind,'location_id',location_id,'created_at',created_at) into v_post;
 return v_post;
end $$;
revoke all on function public.create_social_post(text,text,uuid) from public;
grant execute on function public.create_social_post(text,text,uuid) to authenticated;
