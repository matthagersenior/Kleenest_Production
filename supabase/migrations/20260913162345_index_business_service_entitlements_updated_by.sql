
    create index if not exists business_service_entitlements_updated_by_idx
      on public.business_service_entitlements(updated_by)
      where updated_by is not null;
  
