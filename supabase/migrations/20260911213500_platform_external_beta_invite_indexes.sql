-- Cover audit-user foreign keys identified by Supabase performance advisors.
create index if not exists platform_partner_invites_claimed_by_idx
  on public.platform_partner_invites(claimed_by)
  where claimed_by is not null;

create index if not exists platform_partner_invites_created_by_idx
  on public.platform_partner_invites(created_by)
  where created_by is not null;
