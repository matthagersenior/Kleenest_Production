import fs from 'node:fs';

const failures=[];
for(const path of ['apps/business-mobile/app/_layout.tsx','apps/fleet-mobile/app/_layout.tsx']){
  if(!fs.existsSync(path)){failures.push('missing '+path);continue;}
  const src=fs.readFileSync(path,'utf8');
  if(!src.includes("const activeRoute=String(segments.at(-1)||'');"))failures.push(path+' must resolve the leaf route segment');
  if(!src.includes("},[ready,signedIn,workspaceRevision]);"))failures.push(path+' gate loading must depend only on auth/workspace state');
  const routingDeps=path.includes('fleet-mobile')
    ? "},[ready,gateReady,signedIn,needsBusinessSetup,workspaceRole,onboardingRequired,onAuthRoute,activeRoute,router]);"
    : "},[ready,gateReady,signedIn,needsProvisioning,onboardingRequired,onAuthRoute,activeRoute,router]);";
  if(!src.includes(routingDeps))failures.push(path+' must enforce routing in a separate effect');
  if(src.includes("setGateReady(false);\n    void (async()=>")&&src.includes("activeRoute,workspaceRevision"))failures.push(path+' still tears down navigator on route changes');
  if(path.includes('fleet-mobile')){
    if(!src.includes("if(onboardingRequired&&!ONBOARDING_BYPASS.has(activeRoute))router.replace('/onboarding');"))failures.push(path+' must retain mandatory Fleet onboarding enforcement');
    if(!src.includes("if(needsBusinessSetup){"))failures.push(path+' must keep no-workspace Fleet users on the setup path');
  }else{
    if(src.includes("if(onboardingRequired&&!ONBOARDING_BYPASS.has(activeRoute))router.replace('/onboarding');"))failures.push(path+' must not globally lock Business behind the optional profile survey');
    if(!src.includes("if(activeRoute==='get-started'){router.replace('/');return;}"))failures.push(path+' must leave provisioning for usable Business home rather than mandatory survey');
    if(!src.includes("if(needsProvisioning){"))failures.push(path+' must route signed-in users without a Business workspace into provisioning');
  }
  if(!src.includes("if(onAuthRoute)return;"))failures.push(path+' must yield to the auth screen while OAuth/session handoff is being completed');
  const authPath=path.includes('fleet-mobile')?'apps/fleet-mobile/app/auth.tsx':'apps/business-mobile/app/auth.tsx';
  const authSrc=fs.readFileSync(authPath,'utf8');
  if(!authSrc.includes('getSession()'))failures.push(authPath+' must recover an already-persisted session on auth-route reload');
  if(path.includes('fleet-mobile')){
    if(!authSrc.includes("if(await hasFleetAccess())router.replace('/');")||!authSrc.includes('openBusinessSetup()'))failures.push(authPath+' must own Fleet post-auth access routing');
  }else{
    if(!authSrc.includes('finishAuthenticated()'))failures.push(authPath+' must own Business post-auth workspace/provisioning routing');
  }
}
if(failures.length){
 console.error('Onboarding navigation bounce audit failed:');
 failures.forEach(f=>console.error('- '+f));
 process.exit(1);
}
console.log('Onboarding navigation bounce audit passed with claim-first Business and mandatory Fleet setup boundaries.');
