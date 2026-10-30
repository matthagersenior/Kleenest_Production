# Kleenest consumer signup and organic growth plan

## Baseline (October 29, 2026)
- Actual registered accounts: **24**; new in seven days: **0**; last new signup: October 6.
- Historical tracked events: **692** landing views, **180** installation-intent actions, **79** Continue as Guest actions, **3** installation-success events. These are events, not independent people.
- Last seven days: **26** Continue as Guest actions.
- Do not inflate registrations with fake users or represent clicks as installs.

## Release 1: earn more real signups without restricting public-service guest access
1. Public homepage: primary action **Create Free Account**, adjacent **Try as Guest**, installation remains clearly available.
2. Signup screen: clearly explain real value—saved restrooms, trust history, check-ins, XP and continuity across visits. Prioritize registration only when the visitor has chosen signup; guest discovery still works.
3. Legacy PWA: allow registration, confirm-email resend, hosted-base redirect handling.
4. After useful discovery: voluntary referral sharing with tagged link. No automatic unsolicited invites or unearned referral points.
5. Existing acquisition RPC: instrument privacy-safe stages (view, submit, confirmation required, session created, error reason, Google start/fail) without collecting contact details or precise location.

## Owner measurement and guardrails
- Owner-only conversion RPC aggregates distinct instrumented sessions, at rolling seven- or thirty-day windows.
- Track signup stages, shares, guest actions, install intent and installed-app evidence independently.
- The registered-account count comes from the database and cannot be replaced with client-reported signup successes.
- Funnel reporting errors must not hide the authoritative account tally.
- Preserve guest use and never make restroom discovery conditional on account creation.

## Growth distribution once code is published
- Reuse existing free, approved listings and partner/community channels. Share practical examples of useful restroom discovery near St. Louis and existing Missouri/Illinois coverage.
- Encourage creator mission links and QR codes only with creator consent and operational readiness; tag sources to distinguish effective distribution.
- Provide optional sharing at moments of demonstrated usefulness, not intrusive account nags while navigating a map.
- Prioritize resolving zero-results, slow maps, broken Google OAuth and confusing installation over buying impressions.
- Respond to inbound interest from businesses, pilots, creators and community groups; do not send bulk unsolicited outreach.

## Release verification
- Run signup-growth contracts, web preview, consumer typechecks, existing CI and Supabase owner auth checks.
- Verify guest discovery, email signup, confirmation and existing-account sign-in on a real mobile browser/device. Verify Google OAuth separately. No fake user registrations in production.
- Deploy via main and existing publication/OTA gates, and verify an actual public page; a passing code test alone does not establish publication.

## Follow-through: seven and thirty days
- Review actual new registered accounts, form views, submitted signups, confirmation handoffs, errors, guest selections, shares, install intentions, installed-use evidence and retention.
- If views do not become submissions, investigate messaging and form usability. If submissions do not become registered accounts, investigate auth and email verification. If installs stall, investigate browser guidance.
- Judge success by net growth from 24 actual accounts and useful repeat engagement, not view counts or fabricated conversion rates.
