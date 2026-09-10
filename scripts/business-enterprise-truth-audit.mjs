import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const contractPath=path.join(root,'config/business-enterprise-acceptance.json');
const seedPath=path.join(root,'supabase/migrations/20260910180500_enterprise_truth_demo_seed.sql');
const authorityPath=path.join(root,'supabase/migrations/20260910181500_business_enterprise_truth_authority.sql');
const failures=[];

if(!fs.existsSync(contractPath)) failures.push('missing Business/Enterprise acceptance contract');
const contract=fs.existsSync(contractPath)?JSON.parse(fs.readFileSync(contractPath,'utf8')):null;
const migrationDir=path.join(root,'supabase/migrations');
const migrationSql=fs.existsSync(migrationDir)?fs.readdirSync(migrationDir).filter(name=>name.endsWith('.sql')).map(name=>fs.readFileSync(path.join(migrationDir,name),'utf8')).join('\n'):'';
const seedSql=fs.existsSync(seedPath)?fs.readFileSync(seedPath,'utf8'):'';
const authoritySql=fs.existsSync(authorityPath)?fs.readFileSync(authorityPath,'utf8'):'';

if(contract){
  if(contract.canonicalDatabaseMatrix!=='business_tier_capability_matrix') failures.push('acceptance contract must use business_tier_capability_matrix as the canonical database matrix');
  for(const capability of contract.capabilities||[]){
    for(const source of capability.sources||[]){
      const sourcePath=path.join(root,source.path);
      if(!fs.existsSync(sourcePath)){failures.push(`${capability.id}: missing source ${source.path}`);continue;}
      const text=fs.readFileSync(sourcePath,'utf8');
      for(const token of source.tokens||[]) if(!text.includes(token)) failures.push(`${capability.id}: source ${source.path} missing ${token}`);
    }
    for(const rpc of capability.rpcs||[]) if(!migrationSql.includes(rpc)) failures.push(`${capability.id}: no source-controlled migration evidence for RPC ${rpc}`);
    if(capability.demoProof&&!seedSql.includes(capability.demoProof)) failures.push(`${capability.id}: deterministic demo proof missing ${capability.demoProof}`);
    if(capability.databaseCapability&&!authoritySql.includes(capability.databaseCapability)) failures.push(`${capability.id}: authority migration missing capability key ${capability.databaseCapability}`);
  }
}

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
