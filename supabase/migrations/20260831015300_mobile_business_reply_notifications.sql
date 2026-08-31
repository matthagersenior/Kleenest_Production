create or replace function internal.notify_review_business_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then return new; end if;
  if nullif(trim(coalesce(new.business_reply, '')), '') is null then return new; end if;
  if nullif(trim(coalesce(old.business_reply, '')), '') is not null then return new; end if;
  if not coalesce((select np.community from public.notification_preferences np where np.user_id = new.user_id), true) then return new; end if;

  insert into public.notifications(user_id, type, title, body, data)
  values(
    new.user_id,
    'business_review_reply',
    'A business replied to your review',
    'Open your review to see the response.',
    jsonb_build_object(
      'review_id', new.id,
      'location_id', new.location_id,
      'type', 'business_review_reply'
    )
  );
  return new;
end;
$$;

revoke all on function internal.notify_review_business_reply() from public, anon, authenticated;

drop trigger if exists reviews_notify_business_reply on public.reviews;
create trigger reviews_notify_business_reply
after update of business_reply on public.reviews
for each row
when (new.business_reply is distinct from old.business_reply)
execute function internal.notify_review_business_reply();
