alter table public.capability_feature_contracts enable row level security;

drop policy if exists capability_feature_contracts_service_role on public.capability_feature_contracts;
create policy capability_feature_contracts_service_role
on public.capability_feature_contracts
for all
to service_role
using (true)
with check (true);
