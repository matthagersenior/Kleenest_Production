const productPrefixes=['apps/','packages/','supabase/migrations/','supabase/functions/','mcp/'];
const field=(body,name)=>{
  const match=String(body||'').match(new RegExp(`^${name}\\s*:\\s*(.+)$`,'im'));
  return match?.[1]?.trim()||'';
};

export function auditPullRequestFeatureMetadata({registry,prNumber,body,changedFiles}){
  const failures=[];
  if(Number(prNumber)<=Number(registry?.enforcement?.afterPullRequest||0))return failures;
  const productChange=(changedFiles||[]).some(path=>productPrefixes.some(prefix=>path.startsWith(prefix)));
  if(!productChange)return failures;

  const featureField=field(body,'Feature-ID');
  const target=field(body,'Target-State');
  const userFlow=field(body,'User-Flow');
  const verification=field(body,'Verification');
  if(!featureField)failures.push('PR requires Feature-ID for product-changing work');
  if(!target)failures.push('PR requires Target-State for product-changing work');
  if(!userFlow)failures.push('PR requires User-Flow for product-changing work');
  if(!verification)failures.push('PR requires Verification for product-changing work');
  if(failures.length)return failures;

  const states=new Set(registry?.states||[]);
  if(!states.has(target))failures.push(`Target-State ${target} is not a valid lifecycle state`);
  const ids=featureField.split(',').map(x=>x.trim()).filter(Boolean);
  const byId=new Map((registry?.features||[]).map(x=>[x.id,x]));
  for(const id of ids){
    if(id.startsWith('internal:')){
      if(target!=='internal')failures.push(`${id}: internal work must use Target-State: internal`);
      continue;
    }
    const feature=byId.get(id);
    if(!feature){failures.push(`${id}: Feature-ID is not registered`);continue;}
    if(feature.status!==target)failures.push(`${id}: Target-State ${target} does not match registry status ${feature.status}`);
    if(target==='live'&&feature.status!=='live')failures.push(`${id}: cannot target live until the registry certifies complete vertical-slice evidence`);
  }
  return failures;
}
