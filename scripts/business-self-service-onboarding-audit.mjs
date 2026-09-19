import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const expect=(value,pattern,label)=>{if(!pattern.test(value))throw new Error('Self-service onboarding audit failed: '+label);};

const edge=read('supabase/functions/business-self-service-provision/index.ts');
const service=read('apps/business-mobile/services/provisioning.ts');
const page=read('apps/business-mobile/app/get-started.tsx');
const auth=read('apps/business-mobile/app/auth.tsx');
const layout=read('apps/business-mobile/app/_layout.tsx');
const fleetAuth=read('apps/fleet-mobile/app/auth.tsx');
const marketing=read('apps/consumer-mobile/components/MarketingSitePro.tsx');
const migration=read('supabase/migrations/20260913170815_business_member_self_service_visibility.sql');
const policyConvergence=read('supabase/migrations/20260913171236_converge_business_member_select_policy.sql');

expect(edge,/auth\.getUser\(\)/,'Edge Function must validate the caller JWT');
expect(edge,/SERVICE_ROLE_KEY/,'Edge Function must keep privileged bootstrap server-side');
expect(edge,/role:\s*'owner'/,'new workspace must assign the caller owner role');
expect(edge,/\.rpc\('claim_location_for_business'/,'self-service location claims must delegate to the canonical authenticated claim authority');
if(/from\('location_claims'\)[\s\S]*upsert\(/.test(edge))throw new Error('Self-service onboarding audit failed: Edge Function must not bypass canonical claim verification with a direct location_claims upsert');
expect(edge,/source:\s*'business_self_service'/,'new locations must preserve provenance');
expect(service,/functions\.invoke\('business-self-service-provision'/,'Business app must call the canonical bootstrap function');
expect(service,/\.is\('business_id',null\).*\.is\('claimed_business_id',null\)/s,'claim search must only offer unowned locations');
expect(page,/CREATE WORKSPACE & CONTINUE/,'Get Started must expose the provisioning action');
expect(page,/previewBusinessOnboarding/,'Get Started must seed targeted onboarding before navigation');
expect(page,/intent==='claim'/,'Get Started must preserve a dedicated claim-first path');
expect(page,/Claim this location for free/,'Get Started must expose the free claim action');
expect(page,/router\.replace\('\/verification-center'\)/,'Claim-first setup must continue into verification');
expect(auth,/\/get-started/,'Business auth must route no-workspace users into provisioning');
expect(layout,/needsProvisioning/,'Business layout must distinguish signed-in users without a workspace');
expect(layout,/get-started/,'Business layout must allow the provisioning route');
expect(fleetAuth,/intent=fleet/,'Fleet signup must hand no-workspace users to unified Business provisioning');
expect(marketing,/CLAIM YOUR LOCATION FREE/,'public For Business page must expose free claiming as the primary CTA');
expect(marketing,/openBusinessPortal\('signup','claim'\)/,'public free-claim CTA must preserve claim intent through auth');
expect(marketing,/BUSINESS SIGN IN/,'public For Business page must expose Business sign-in');
expect(migration,/businesses_member_select/,'pending Business rows must be visible to their authenticated members');
expect(migration,/bm\.user_id=\(select auth\.uid\(\)\)/,'member visibility must be scoped to the caller');
expect(policyConvergence,/drop policy if exists businesses_member_select/,'follow-up policy convergence must remove duplicate authenticated SELECT policy');
expect(policyConvergence,/verification_status='verified'/,'converged Business SELECT must retain verified visibility');
expect(policyConvergence,/is_platform_owner_session\(\)/,'converged Business SELECT must retain platform-owner visibility');
expect(policyConvergence,/bm\.user_id=\(select auth\.uid\(\)\)/,'converged Business SELECT must retain own-member visibility');

console.log('Self-service Business claim-first / Fleet / Enterprise onboarding convergence: OK');
