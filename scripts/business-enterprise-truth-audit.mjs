import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const contractPath=path.join(root,'config/business-enterprise-acceptance.json');
const seedPath=path.join(root,'supabase/migrations/20260910180500_enterprise_truth_demo_seed.sql');
const authorityPath=path.join(root,'supabase/migrations/20260910181500_business_enterprise_truth_authority.sql');
const portfolioPath=path.join(root,'supabase/migrations/20260910182500_enterprise_portfolio_capability_convergence.sql');
const failures=[];

if(!fs.existsSync(contractPath)) failures.push('missing Business/Enterprise acceptance contract');
const contract=fs.existsSync(contractPath)?JSON.parse(fs.readFileSync(contractPath,'utf8')):null;
const seedSql=fs.existsSync(seedPath)?fs.readFileSync(seedPath,'utf8'):'';
const authoritySql=[authorityPath,portfolioPath].filter(fs.existsSync).map(file=>fs.readFileSync(file,'utf8')).join('\n');

if(contract){
  if(contract.canonicalDatabaseMatrix!=='business_tier_capability_matrix') failures.push('acceptance contract must use business_tier_capability_matrix as the canonical database matrix');
  for(const capability of contract.capabilities||[]){
    let sourceText='';
    for(const source of capability.sources||[]){
      const sourcePath=path.join(root,source.path);
      if(!fs.existsSync(sourcePath)){failures.push(`${capability.id}: missing source ${source.path}`);continue;}
      const text=fs.readFileSync(sourcePath,'utf8');
      sourceText+=`\n${text}`;
      for(const token of source.tokens||[]) if(!text.includes(token)) failures.push(`${capability.id}: source ${source.path} missing ${token}`);
    }
    for(const rpc of capability.rpcs||[]) if(!sourceText.includes(rpc)) failures.push(`${capability.id}: production service seam does not call RPC ${rpc}`);
    if(capability.demoProof&&!seedSql.includes(capability.demoProof)) failures.push(`${capability.id}: deterministic demo proof missing ${capability.demoProof}`);
    if(capability.databaseCapability&&!authoritySql.includes(capability.databaseCapability)) failures.push(`${capability.id}: authority migration missing capability key ${capability.databaseCapability}`);
  }
}

const memberServicePath=path.join(root,'apps/business-mobile/services/capabilityWorkflows.ts');
const memberScreenPath=path.join(root,'apps/business-mobile/app/members.tsx');
const workspaceScreenPath=path.join(root,'apps/business-mobile/app/workspaces.tsx');
const memberService=fs.existsSync(memberServicePath)?fs.readFileSync(memberServicePath,'utf8'):'';
const memberScreen=fs.existsSync(memberScreenPath)?fs.readFileSync(memberScreenPath,'utf8'):'';
const workspaceScreen=fs.existsSync(workspaceScreenPath)?fs.readFileSync(workspaceScreenPath,'utf8'):'';
for(const token of ["select('business_id,user_id,role,created_at')","business_invite_member","business_change_member_role","business_transfer_ownership"]) if(!memberService.includes(token)) failures.push(`Business team read/write seam missing: ${token}`);
if(memberService.includes("select('id,business_id,user_id,role,created_at,updated_at')")) failures.push('Business team read path still requests nonexistent business_members.id/updated_at columns');
for(const token of ["const roles=['admin','manager','dispatcher','analyst','staff']","inviteBusinessMember(id,userId,'dispatcher')","inviteBusinessMember(id,userId,'staff')","row.role==='owner'","String(row.business_id)+'-'+String(row.user_id)"]) if(!memberScreen.includes(token)) failures.push(`Business team screen is not aligned to canonical business_member_role schema: ${token}`);
if(/business_(owner|admin|manager|analyst|marketing|staff)/.test(memberScreen)) failures.push('Business team screen still emits prefixed role values that the live business_member_role enum rejects');
for(const token of ["p_include_demo:true","row?.is_demo_test?-100000:5"]) if(!memberService.includes(token)) failures.push(`Demo Enterprise workspace discovery is not explicit/safe: ${token}`);
for(const token of ["row.is_demo_test","DEMO","never auto-selected over a real workspace"]) if(!workspaceScreen.includes(token)) failures.push(`Demo workspace UI contract missing: ${token}`);

for(const token of [
  'create or replace function public.business_capability_allowed(',
  "public.business_tier_capability_matrix(p_business_id)",
  'create or replace function public.enterprise_partner_capability_guard()',
  'enterprise_partner_networks_enterprise_guard',
  'enterprise_partner_network_members_enterprise_guard',
  'enterprise_partner_campaigns_enterprise_guard',
  'enterprise_partner_allocations_enterprise_guard',
  'enterprise_partner_campaign_outcomes_enterprise_guard',
  'enterprise_partner_network_metrics_enterprise_guard',
  'create or replace function public.business_enterprise_truth_demo_snapshot(',
  'revoke all on function public.qr_studio_archive_template',
  'revoke all on function public.qr_studio_upsert_asset',
  'revoke all on function public.qr_studio_versions',
]) if(!authoritySql.includes(token)) failures.push(`authority migration missing: ${token}`);

for(const token of [
  "public.business_capability_allowed(p_business_id,'enterprise.enterprise_networks')",
  "public.business_capability_allowed(n.owner_business_id,'enterprise.partner_campaigns')",
  "public.business_capability_allowed(n.owner_business_id,'enterprise.allocations')",
  "public.business_capability_allowed(p_business_id,'enterprise.portfolio_fleet')",
]) if(!authoritySql.includes(token)) failures.push(`Enterprise read authority is not matrix-backed: ${token}`);

for(const token of [
  'Matt Test Business',
  "source_dataset='enterprise_truth_demo'",
  'enterprise_truth_remediation',
  'enterprise_truth_preventive',
  'enterprise_truth_route_active',
  'enterprise_truth_allocation',
]) if(!seedSql.includes(token)) failures.push(`demo seed missing: ${token}`);

if(failures.length){
  console.error('Business/Enterprise truth gate failed:');
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Business/Enterprise truth gate passed for ${contract.capabilities.length} promised capability groups.`);
