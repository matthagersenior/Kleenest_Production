import fs from 'node:fs';

const failures=[];
for(const path of ['apps/business-mobile/app/_layout.tsx','apps/fleet-mobile/app/_layout.tsx']){
  if(!fs.existsSync(path)){failures.push('missing '+path);continue;}
  const src=fs.readFileSync(path,'utf8');
  if(!src.includes("const activeRoute=String(segments.at(-1)||'');"))failures.push(path+' must resolve the leaf route segment');
  if(!src.includes("},[ready,signedIn,workspaceRevision]);"))failures.push(path+' gate loading must depend only on auth/workspace state');
  const routingDeps=path.includes('fleet-mobile')
    ? "},[ready,gateReady,signedIn,workspaceRole,onboardingRequired,onAuthRoute,activeRoute,router]);"
    : "},[ready,gateReady,signedIn,onboardingRequired,onAuthRoute,activeRoute,router]);";
  if(!src.includes(routingDeps))failures.push(path+' must enforce routing in a separate effect');
  if(src.includes("setGateReady(false);\n    void (async()=>")&&src.includes("activeRoute,workspaceRevision"))failures.push(path+' still tears down navigator on route changes');
  if(!src.includes("if(onboardingRequired&&!ONBOARDING_BYPASS.has(activeRoute))router.replace('/onboarding');"))failures.push(path+' must retain mandatory onboarding enforcement');
  if(!/if\s*\(onAuthRoute\)\s*\{?[\s\S]{0,120}?router\.replace\(onboardingRequired\?'\/onboarding':'\/'\)/.test(src))failures.push(path+' must retain post-auth routing');
}
if(failures.length){
 console.error('Onboarding navigation bounce audit failed:');
 failures.forEach(f=>console.error('- '+f));
 process.exit(1);
}
console.log('Onboarding navigation bounce audit passed.');
