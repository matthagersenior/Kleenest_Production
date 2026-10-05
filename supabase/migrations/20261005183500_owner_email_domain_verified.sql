-- Keep the database source of truth aligned with the verified Resend domain.
-- Resend reports kleenest.us as verified with both sending and receiving enabled.
update public.owner_email_center_settings
set domain_status='verified',
    updated_at=now()
where provider='resend'
  and provider_domain_id='bc21c395-4091-4af8-9810-91ee37bc93e8'
  and lower(inbox_address)='support@kleenest.us'
  and domain_status is distinct from 'verified';
