import fs from 'node:fs';
const path='supabase/migrations/20260831101000_business_legacy_analytics_authority_convergence.sql';
const sql=fs.readFileSync(path,'utf8');
const required=['business_analytics_authorized','business_benchmark_analytics','business_campaign_detail','business_event_detail','business_media_detail','business_occupancy_analytics','business_partner_analytics','business_partner_detail','business_roi_analytics','business_visitors_analytics'];
for(const name of required){if(!sql.includes(`public.${name}`))throw new Error(`missing ${name}`)}
for(const name of required.slice(1)){if(!sql.includes(`if not public.business_analytics_authorized(p_business_id)`))throw new Error('legacy analytics functions must enforce canonical business analytics authorization')}
if(!sql.includes("set search_path = ''")&&!sql.includes("set search_path=''"))throw new Error('missing empty search_path authority');
if(!sql.includes("lower(bm.role::text) in ('owner','admin','manager','analyst')"))throw new Error('analytics role scope missing');
if(!sql.includes('revoke execute on function public.business_benchmark_analytics'))throw new Error('legacy analytics execute revokes missing');
console.log('Business legacy analytics authority audit passed.');
