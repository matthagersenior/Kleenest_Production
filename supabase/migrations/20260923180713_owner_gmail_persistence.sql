create table if not exists public.owner_gmail_connections (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  email_address text,
  google_client_id text not null,
  provider_refresh_token text not null,
  provider_access_token text,
  granted_scopes text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  last_error text
);

alter table public.owner_gmail_connections enable row level security;

revoke all on table public.owner_gmail_connections from anon, authenticated;
grant select, insert, update, delete on table public.owner_gmail_connections to service_role;

comment on table public.owner_gmail_connections is
  'Service-only persistence for the Owner Gmail OAuth connection. User-facing access stays behind owner-email-gateway authorization.';
