create or replace function public.record_review_amenity_inventory(p_review_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_uid uuid:=auth.uid(); v_location uuid; v_check_in uuid; v_check_method text; v_item jsonb; v_amenity uuid; v_sentiment text; v_qty integer; v_status text; v_count integer:=0; v_progression jsonb:=null; v_progression_error text:=null;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then raise exception 'AMENITY_INVENTORY_MUST_BE_ARRAY'; end if;
 select r.location_id,r.check_in_id,c.verification_method into v_location,v_check_in,v_check_method from public.reviews r join public.check_ins c on c.id=r.check_in_id and c.user_id=v_uid and c.location_id=r.location_id where r.id=p_review_id and r.user_id=v_uid and r.status='published';
 if v_location is null or v_check_in is null then raise exception 'VERIFIED_REVIEW_NOT_FOUND'; end if;
 delete from public.review_amenity_feedback where review_id=p_review_id;
 delete from public.location_amenity_observations where user_id=v_uid and location_id=v_location and check_in_id=v_check_in and metadata->>'review_id'=p_review_id::text and metadata->>'source'='review_amenity_inventory';
 for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
  v_amenity:=nullif(v_item->>'amenity_id','')::uuid; v_sentiment:=lower(coalesce(nullif(v_item->>'sentiment',''),'good')); v_qty:=case when v_item?'quantity' and nullif(v_item->>'quantity','') is not null then (v_item->>'quantity')::integer else null end;
  if v_amenity is null or not exists(select 1 from public.amenities where id=v_amenity) then raise exception 'AMENITY_NOT_FOUND'; end if;
  if v_sentiment not in ('good','needs_attention') then raise exception 'INVALID_AMENITY_SENTIMENT'; end if;
  if v_qty is not null and (v_qty<0 or v_qty>1000) then raise exception 'AMENITY_QUANTITY_OUT_OF_RANGE'; end if;
  insert into public.review_amenity_feedback(review_id,location_id,amenity_id,sentiment,observed_quantity) values(p_review_id,v_location,v_amenity,v_sentiment,v_qty);
  v_status:=case when v_qty=0 then 'absent' else 'present' end;
  insert into public.location_amenity_observations(location_id,user_id,amenity_id,status,observed_quantity,confidence,verification_method,check_in_id,notes,observed_at,metadata)
  values(v_location,v_uid,v_amenity,v_status,case when v_status='absent' then 0 else coalesce(v_qty,1) end,0.90,coalesce(nullif(v_check_method,''),'verified_review'),v_check_in,case when v_sentiment='needs_attention' then 'Needs attention reported in verified review' else null end,now(),jsonb_build_object('source','review_amenity_inventory','review_id',p_review_id,'sentiment',v_sentiment,'server_authoritative',true))
  on conflict (user_id,location_id,check_in_id,amenity_id,status) where check_in_id is not null do update set observed_quantity=excluded.observed_quantity,confidence=excluded.confidence,verification_method=excluded.verification_method,notes=excluded.notes,observed_at=excluded.observed_at,metadata=excluded.metadata;
  v_count:=v_count+1;
 end loop;
 if v_count>0 then begin v_progression:=public.award_review_amenity_progression(p_review_id); exception when others then v_progression_error:=sqlerrm; v_progression:=null; end; end if;
 return jsonb_build_object('review_id',p_review_id,'location_id',v_location,'check_in_id',v_check_in,'recorded',v_count,'canonical_observations',v_count,'progression',v_progression,'progression_error',v_progression_error);
end $function$;
revoke all on function public.record_review_amenity_inventory(uuid,jsonb) from public,anon;
grant execute on function public.record_review_amenity_inventory(uuid,jsonb) to authenticated,service_role;
