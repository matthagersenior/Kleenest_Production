import fs from 'node:fs';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const expect=(value,pattern,label)=>{if(!pattern.test(value))failures.push(label);};

const migration=read('supabase/migrations/20260913173000_business_claim_verification_center.sql');
const edge=read('supabase/functions/business-claim-verification/index.ts');
const business=read('apps/business-mobile/app/verification-center.tsx');
const locations=read('apps/business-mobile/app/locations.tsx');
const layout=read('apps/business-mobile/app/_layout.tsx');
const ownerService=read('apps/platform-mobile/services/ownerBusinesses.ts');
const ownerUi=read('apps/platform-mobile/app/businesses.tsx');

expect(migration,/requested_authority text not null default 'location_operator'/,'location claims must record requested authority');
expect(migration,/existing_operator_business_id uuid references public\.businesses/,'claims must retain the current operator separately from the claimant');
expect(migration,/risk_score integer not null default 60/,'claims must carry explicit risk scores');
expect(migration,/verified_evidence jsonb not null default '\[\]'/,'claims must retain verified evidence');
expect(migration,/business_claim_verification_challenges/,'DNS challenges must have canonical storage');
expect(migration,/business_claim_verification_events/,'claim verification must have append-only audit evidence');
expect(migration,/v_risk:=95[\s\S]*existing_operator_present/,'existing-operator claims must start high risk');
expect(migration,/if v_is_new and v_existing_operator is not null[\s\S]*insert into public\.notifications/,'current operators must be notified about first-time takeover requests');
expect(migration,/business_admin_guard\(p_business_id\)/,'existing-operator transfer approval must require owner/admin authority');
expect(migration,/approve_transfer[\s\S]*set business_id=c\.business_id,claimed_business_id=c\.business_id/,'only an explicit transfer resolution may move current authority');
expect(migration,/admin_resolve_location_claim_v2/,'KleenestOS must use a note-aware platform-owner claim resolution');
expect(migration,/business_search_claimable_locations_v2/,'Business search must distinguish managed and unclaimed locations');

expect(edge,/allowedCorsOrigin/,'sensitive claim verification must use an explicit web-origin allowlist');
expect(edge,/origin==='https:\/\/matthagersenior\.github\.io'/,'production GitHub Pages origin must be explicitly allowed');
expect(edge,/if\(!origin\)return new Response\(JSON\.stringify\(\{error:'Origin not allowed'\}\)/,'untrusted browser origins must be rejected before authentication or claim actions');
if(/const\s+origin\s*=\s*req\.headers\.get\(['"]origin['"]\)\s*\|\|\s*['"]\*['"]/.test(edge))failures.push('claim verification must not default arbitrary request Origin reflection to wildcard CORS');
if(/access-control-allow-origin['"]?:\s*req\.headers\.get\(['"]origin['"]\)/.test(edge))failures.push('claim verification must not write the raw request Origin directly into CORS');
expect(edge,/FREE_EMAIL_DOMAINS/,'generic email providers must not count as company-domain proof');
expect(edge,/user\.email_confirmed_at/,'company-domain proof must require confirmed account email');
expect(edge,/location\.website/,'automated domain evidence must be grounded in the canonical location website');
expect(edge,/cloudflare-dns\.com\/dns-query/,'DNS verification must use a fixed DNS-over-HTTPS authority instead of fetching arbitrary business sites');
expect(edge,/company_email_domain[\s\S]*dns_txt/,'automatic approval must require two independent domain-control signals');
expect(edge,/if\(ctx\.claim\.existing_operator_business_id\|\|!evidence\.includes/,'automatic approval must be impossible when an existing operator is present');
expect(edge,/\.is\('business_id',null\)\.is\('claimed_business_id',null\)/,'auto-approval must atomically require an unclaimed location');
expect(edge,/auto_approval_blocked_existing_operator/,'authority races must fall back to operator review');

expect(business,/Payment buys the workspace\. Evidence earns authority\./,'Business UI must separate payment from authority');
expect(business,/CURRENT OPERATOR PROTECTED/,'Business UI must clearly show protected operator conflicts');
expect(business,/Verify company email/,'Business UI must expose company-email evidence');
expect(business,/DNS TXT CHALLENGE/,'Business UI must expose DNS proof');
expect(business,/Only Business owners\/admins can approve a transfer/,'Business UI must disclose owner/admin-only transfer authority');
expect(locations,/managed_elsewhere/,'Location search must identify locations operated by another Business');
expect(locations,/Request authority/,'Location search must request rather than silently seize authority');
expect(locations,/verification-center/,'Location workflow must link into the Verification Center');
expect(layout,/name="verification-center"/,'Verification Center route must be registered');

expect(ownerService,/admin_resolve_location_claim_v2/,'KleenestOS must resolve claims through the v2 audited authority');
expect(ownerUi,/Payment is not ownership evidence/,'KleenestOS must keep commercial access independent from ownership verification');
expect(ownerUi,/RISK \{Number\(claim\.risk_score/,'KleenestOS must show claim risk');
expect(ownerUi,/Kleenest verification decision note/,'platform claim decisions must capture an audit note');

if(failures.length){
  console.error('Business claim verification authority audit failed:');
  failures.forEach(f=>console.error('- '+f));
  process.exit(1);
}
console.log('Business claim verification authority audit passed: workspace payment, identity evidence, operator protection, dispute review and platform authority are converged.');
