const INTERNAL_FIELDS=new Set([
  'id','business_id','location_id','user_id','created_by','created_by_user_id','owner_id','scope_id','source_id','network_id','campaign_id','promotion_id','schedule_id','run_id',
]);
const LABELS:Record<string,string>={
  roi_status:'ROI status',cost_cents:'Cost',generated_at:'Updated',attributed_users:'Attributed users',priority_score:'Priority',suggested_action:'Suggested action',
  intelligence_score:'Intelligence score',cleanliness_pct:'Cleanliness',verification_count:'Verifications',observation_count:'Observations',check_ins:'Check-ins',demand_signal:'Demand signal',freshness_label:'Freshness',
};
const VALUE_LABELS:Record<string,string>={
  unavailable_without_revenue_source:'Revenue data not connected',unavailable_without_cost_source:'Cost data not connected',insufficient_data:'Not enough data yet',unknown:'Not available',
  current:'Current',stale:'Needs refresh',verified:'Verified',unverified:'Needs verification',active:'Active',inactive:'Inactive',open:'Open',completed:'Completed',dismissed:'Dismissed',
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
export function isBusinessInternalField(key:string){return INTERNAL_FIELDS.has(key)||key.endsWith('_uuid');}
export function formatBusinessIntelligenceLabel(key:string){return LABELS[key]||key.replace(/^business_/,'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());}
export function formatBusinessIntelligenceValue(value:unknown,key=''){
  if(value==null)return null;
  if(typeof value==='boolean')return value?'Yes':'No';
  if(typeof value==='number'){
    if(key.endsWith('_cents'))return new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(value/100);
    if(key.endsWith('_pct'))return `${Number(value).toLocaleString(undefined,{maximumFractionDigits:1})}%`;
    return Number(value).toLocaleString(undefined,{maximumFractionDigits:2});
  }
  if(typeof value!=='string')return null;
  const text=value.trim();if(!text)return null;
  if(UUID.test(text))return null;
  if(ISO_DATE.test(text)){const date=new Date(text);if(!Number.isNaN(date.getTime()))return date.toLocaleString();}
  const mapped=VALUE_LABELS[text.toLowerCase()];if(mapped)return mapped;
  const cleaned=text.includes('_')?text.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()):text;
  return cleaned.length>120?`${cleaned.slice(0,117)}…`:cleaned;
}
export function businessIntelligenceErrorMessage(error:unknown){
  const text=String(error||'').toLowerCase();
  if(text.includes('statement timeout')||text.includes('canceling statement')||text.includes('cancelling statement'))return 'This intelligence view is taking longer than expected. Other business signals remain available; pull to refresh in a moment.';
  if(text.includes('not authorized')||text.includes('access required'))return 'Your current Business role does not include this intelligence view.';
  return 'This intelligence view is temporarily unavailable. Other business signals remain active.';
}
