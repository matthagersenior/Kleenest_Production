-- Creator Studio memberships are NOT KleenestOS administrator privileges.
create table if not exists public.creator_studio_accounts(
 id uuid primary key default gen_random_uuid(),
 email text not null unique check(email=lower(trim(email)) and email like '%@%'),
 display_name text not null,creator_handle text,
 user_id uuid unique references auth.users(id) on delete set null,
 status text not null default 'invited' check(status in ('invited','active','revoked')),
 invited_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.creator_studio_missions(
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.creator_studio_accounts(id) on delete restrict,
 title text not null,description text not null default '',
 requirements jsonb not null default '{}'::jsonb,
 status text not null default 'draft'
    check(status in ('draft','submitted','changes_requested','approved','rejected','archived')),
 review_note text,reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz,created_at timestamptz not null default now(),
 updated_at timestamptz not null default now());
create index if not exists creator_studio_missions_account_idx on public.creator_studio_missions(account_id,updated_at desc);
create index if not exists creator_studio_missions_status_idx on public.creator_studio_missions(status);
alter table public.creator_studio_accounts enable row level security;
alter table public.creator_studio_missions enable row level security;
revoke all on public.creator_studio_accounts from public,anon,authenticated;
revoke all on public.creator_studio_missions from public,anon,authenticated;

create or replace function public.creator_studio_claim() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); e text; a public.creator_studio_accounts;
begin
 if u is null then raise exception 'Sign in required'; end if;
 select lower(trim(email)) into e from auth.users where id=u and email_confirmed_at is not null;
 if e is null then raise exception 'Confirm your email before claiming access'; end if;
 update public.creator_studio_accounts set user_id=u,status='active',updated_at=now()
 where email=e and status in ('invited','active') and (user_id is null or user_id=u)
 returning * into a;
 if a.id is null then return jsonb_build_object('authorized',false); end if;
 return jsonb_build_object('authorized',true,'account_id',a.id);
end $$;

create or replace function public.creator_studio_dashboard() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); own boolean; a uuid;
begin
 if u is null then raise exception 'Sign in required'; end if;
 own:=public.is_platform_owner_session();
 select id into a from public.creator_studio_accounts where user_id=u and status='active';
 return jsonb_build_object('owner',own,'authorized',own or a is not null,'account_id',a,
 'accounts',case when own then
  coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.creator_studio_accounts x),'[]'::jsonb)
 else '[]'::jsonb end,
 'missions',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object(
   'creator_name',c.display_name,'creator_handle',c.creator_handle)
   order by m.updated_at desc)
 from public.creator_studio_missions m join public.creator_studio_accounts c on c.id=m.account_id
 where own or (m.account_id=a and c.user_id=u and c.status='active')),'[]'::jsonb));
end $$;

create or replace function public.creator_studio_owner_invite(
 p_email text,p_display_name text,p_handle text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e text:=lower(trim(coalesce(p_email,''))); n text:=trim(coalesce(p_display_name,'')); a public.creator_studio_accounts;
begin
 if auth.uid() is null or not public.is_platform_owner_session() then raise exception 'Owner authorization required'; end if;
 if e !~ '^[^ @]+@[^ @]+[.][^ @]+$' or length(e)>320 then raise exception 'Valid email required'; end if;
 if length(n)<2 or length(n)>100 then raise exception 'Creator name must be 2–100 characters'; end if;
 insert into public.creator_studio_accounts(email,display_name,creator_handle,invited_by)
 values(e,n,nullif(trim(p_handle),''),auth.uid())
 on conflict(email) do update set display_name=excluded.display_name,
  creator_handle=excluded.creator_handle,
  status=case when creator_studio_accounts.status='revoked' then 'invited' else creator_studio_accounts.status end,
  updated_at=now() returning * into a;
 return jsonb_build_object('id',a.id,'email',a.email,'status',a.status,'has_login',a.user_id is not null);
end $$;

create or replace function public.creator_studio_owner_revoke(p_account_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_platform_owner_session() then raise exception 'Owner only'; end if;
 update public.creator_studio_accounts set status='revoked',updated_at=now() where id=p_account_id;
 return found;
end $$;

create or replace function public.creator_studio_save(
 p_id uuid,p_title text,p_description text,p_requirements jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid; m public.creator_studio_missions; r jsonb:=coalesce(p_requirements,'{}'::jsonb);
 t text:=trim(coalesce(p_title,'')); d text:=trim(coalesce(p_description,''));
 kind text:=coalesce(r->>'type','mixed');p integer;f integer;ph integer;xp integer;
begin
 select id into a from public.creator_studio_accounts where user_id=auth.uid() and status='active';
 if a is null then raise exception 'Creator Studio access required'; end if;
 if length(t)<5 or length(t)>120 or length(d)<12 or length(d)>1500 then
  raise exception 'Title requires 5–120 characters and description 12–1500'; end if;
 if jsonb_typeof(r)<>'object' or kind not in ('places','amenities','feedback','photos','mixed') then
  raise exception 'Unsupported mission type'; end if;
 if coalesce(r->>'places','0') !~ '^[0-9]{1,2}$'
 or coalesce(r->>'feedback','0') !~ '^[0-9]{1,2}$'
 or coalesce(r->>'photos','0') !~ '^[0-9]{1,2}$'
 or coalesce(r->>'xp','0') !~ '^[0-9]{1,3}$' then raise exception 'Counts must be whole numbers'; end if;
 p:=coalesce((r->>'places')::int,0);f:=coalesce((r->>'feedback')::int,0);
 ph:=coalesce((r->>'photos')::int,0);xp:=coalesce((r->>'xp')::int,0);
 if p>25 or f>25 or ph>25 or xp>500 then raise exception 'Mission exceeds preview limits'; end if;
 if jsonb_typeof(coalesce(r->'amenities','[]'::jsonb))<>'array'
 or jsonb_array_length(coalesce(r->'amenities','[]'::jsonb))>12 then raise exception 'Invalid amenities'; end if;
 if exists(select 1 from jsonb_array_elements_text(coalesce(r->'amenities','[]'::jsonb)) e
 where e not in ('family_restroom','wheelchair_accessible','baby_changing','toilet_seat_covers','hands_free_doors',
 'gender_neutral','showers','soap','paper_towels','accessible_parking')) then raise exception 'Unsupported amenity'; end if;
 if p+f+ph=0 and jsonb_array_length(coalesce(r->'amenities','[]'::jsonb))=0 then
  raise exception 'Add a measurable objective'; end if;
 if p=0 and jsonb_array_length(coalesce(r->'amenities','[]'::jsonb))>0 then
  raise exception 'Amenity discovery needs at least one place'; end if;
 if p_id is null then
  insert into public.creator_studio_missions(account_id,title,description,requirements)
  values(a,t,d,r) returning * into m;
 else
  update public.creator_studio_missions set title=t,description=d,requirements=r,status='draft',
   review_note=null,reviewed_by=null,reviewed_at=null,updated_at=now()
  where id=p_id and account_id=a and status in ('draft','changes_requested','rejected')
  returning * into m;
 end if;
 if m.id is null then raise exception 'This mission cannot be edited'; end if;
 return to_jsonb(m);
end $$;

create or replace function public.creator_studio_submit(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid; m public.creator_studio_missions;
begin
 select id into a from public.creator_studio_accounts where user_id=auth.uid() and status='active';
 if a is null then raise exception 'Creator account required'; end if;
 update public.creator_studio_missions set status='submitted',review_note=null,updated_at=now()
 where id=p_id and account_id=a and status in ('draft','changes_requested','rejected')
 returning * into m;
 if m.id is null then raise exception 'Only your editable drafts may be submitted'; end if;
 return to_jsonb(m);
end $$;

create or replace function public.creator_studio_owner_review(p_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.creator_studio_missions;
begin
 if auth.uid() is null or not public.is_platform_owner_session() then raise exception 'Owner approval required'; end if;
 if p_decision not in ('approve','request_changes','reject') then raise exception 'Unknown decision'; end if;
 if p_decision<>'approve' and length(trim(coalesce(p_note,'')))<3 then
 raise exception 'Please explain the review decision'; end if;
 update public.creator_studio_missions
 set status=case p_decision when 'approve' then 'approved' when 'request_changes'
 then 'changes_requested' else 'rejected' end,review_note=nullif(trim(p_note),''),
 reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
 where id=p_id and status='submitted' returning * into m;
 if m.id is null then raise exception 'Only submitted missions can be reviewed'; end if;
 return to_jsonb(m);
end $$;

-- Public display is restricted to owner-approved missions; no unverified automatic XP awards.
create or replace function public.creator_studio_public_mission(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
select to_jsonb(m)||jsonb_build_object('creator_name',a.display_name,'creator_handle',a.creator_handle)
from public.creator_studio_missions m join public.creator_studio_accounts a on a.id=m.account_id
where m.id=p_id and m.status='approved' and a.status='active' limit 1;
$$;

revoke all on function public.creator_studio_claim() from public,anon;
revoke all on function public.creator_studio_dashboard() from public,anon;
revoke all on function public.creator_studio_owner_invite(text,text,text) from public,anon;
revoke all on function public.creator_studio_owner_revoke(uuid) from public,anon;
revoke all on function public.creator_studio_save(uuid,text,text,jsonb) from public,anon;
revoke all on function public.creator_studio_submit(uuid) from public,anon;
revoke all on function public.creator_studio_owner_review(uuid,text,text) from public,anon;
revoke all on function public.creator_studio_public_mission(uuid) from public,anon,authenticated;
grant execute on function public.creator_studio_claim() to authenticated;
grant execute on function public.creator_studio_dashboard() to authenticated;
grant execute on function public.creator_studio_owner_invite(text,text,text) to authenticated;
grant execute on function public.creator_studio_owner_revoke(uuid) to authenticated;
grant execute on function public.creator_studio_save(uuid,text,text,jsonb) to authenticated;
grant execute on function public.creator_studio_submit(uuid) to authenticated;
grant execute on function public.creator_studio_owner_review(uuid,text,text) to authenticated;
grant execute on function public.creator_studio_public_mission(uuid) to anon,authenticated;
