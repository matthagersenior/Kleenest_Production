insert into public.capability_function_classifications(function_signature,domain,classification,rationale) values
('ensure_current_user_profile()','account_profile','supporting','Idempotent current-user profile provisioning helper.'),
('ensure_signup_profile(text,text,text,text,boolean)','account_profile','canonical','Canonical signup profile provisioning.'),
('get_my_profile_preferences()','account_profile','canonical','Canonical profile preference retrieval.'),
('update_my_profile(text,text,text,text)','account_profile','canonical','Canonical consumer profile mutation.'),
('update_my_profile_preferences(jsonb)','account_profile','canonical','Canonical profile preference mutation.'),
('user_subscription_summary()','membership_billing','canonical','Canonical consumer subscription summary.')
on conflict(function_signature) do update set domain=excluded.domain,classification=excluded.classification,rationale=excluded.rationale,updated_at=now();
