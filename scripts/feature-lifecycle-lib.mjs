const requiredLiveStates=['loading','empty','error','success'];
const nonEmpty=v=>typeof v==='string'&&v.trim().length>0;
const nonEmptyArray=v=>Array.isArray(v)&&v.length>0&&v.every(nonEmpty);

export function auditFeatureLifecycle({parity,registry,exists=()=>true}){
  const failures=[];
  const fail=m=>failures.push(m);
  const allowed=new Set(registry?.states||[]);
  const features=registry?.features||[];
  const byId=new Map();

  if(registry?.version!==1)fail('feature lifecycle: unsupported registry version');
  for(const state of ['legacy-unverified','idea','data','backend','wired','discoverable','usable','persistent','verified','live','internal']){
    if(!allowed.has(state))fail(`feature lifecycle: missing state ${state}`);
  }

  for(const feature of features){
    const id=feature?.id||'<missing-id>';
    if(!nonEmpty(feature?.id)){fail('feature lifecycle: feature id is required');continue;}
    if(byId.has(feature.id))fail(`${id}: duplicate feature id`);
    byId.set(feature.id,feature);
    if(!allowed.has(feature.status))fail(`${id}: invalid status ${String(feature.status)}`);
    if(feature.status==='legacy-unverified'&&!(registry.grandfatheredUnverified||[]).includes(id))fail(`${id}: legacy-unverified is reserved for grandfathered capabilities`);
    if(feature.status!=='live'&&feature.status!=='internal'&&!nonEmpty(feature.gap))fail(`${id}: incomplete feature requires a concrete gap`);

    if(feature.status==='live'){
      if(feature.kind!=='user')fail(`${id}: live features must be kind=user`);
      if(!nonEmpty(feature.userJourney?.actor))fail(`${id}: live feature requires userJourney.actor`);
      if(!nonEmpty(feature.userJourney?.entryPoint))fail(`${id}: live feature requires userJourney.entryPoint`);
      if(!nonEmpty(feature.userJourney?.successOutcome))fail(`${id}: live feature requires userJourney.successOutcome`);
      if(!nonEmptyArray(feature.evidence?.ui))fail(`${id}: live feature requires UI evidence`);
      if(!nonEmptyArray(feature.evidence?.logic))fail(`${id}: live feature requires service/local logic evidence`);
      if(!nonEmptyArray(feature.evidence?.discoverability))fail(`${id}: live feature requires discoverability evidence`);
      const mode=feature.evidence?.state?.mode;
      if(!['persistent','stateless'].includes(mode))fail(`${id}: live feature requires state.mode persistent|stateless`);
      if(mode==='persistent'&&!nonEmptyArray(feature.evidence?.state?.proof))fail(`${id}: persistent live feature requires state proof`);
      const states=new Set(feature.evidence?.states||[]);
      for(const state of requiredLiveStates)if(!states.has(state))fail(`${id}: live feature requires ${state} state evidence`);
      if(!nonEmptyArray(feature.evidence?.verification?.automated))fail(`${id}: live feature requires automated verification evidence`);
      if(!nonEmptyArray(feature.evidence?.verification?.production))fail(`${id}: live feature requires production verification evidence`);
      for(const path of [...(feature.evidence?.ui||[]),...(feature.evidence?.logic||[]),...(feature.evidence?.discoverability||[]),...(feature.evidence?.state?.proof||[])]){
        if(!exists(path))fail(`${id}: evidence path does not exist: ${path}`);
      }
    }
    if(feature.status==='internal'){
      if(feature.kind!=='internal')fail(`${id}: internal status requires kind=internal`);
      if(!nonEmpty(feature.reason))fail(`${id}: internal feature requires reason`);
      if(!nonEmptyArray(feature.evidence?.verification?.automated))fail(`${id}: internal feature requires automated verification evidence`);
    }
  }

  for(const [product,app] of Object.entries(parity?.apps||{})){
    for(const capability of app.requiredCapabilities||[]){
      const id=`${product}.${capability}`;
      const feature=byId.get(id);
      if(!feature){fail(`${id}: required product capability is missing from feature lifecycle registry`);continue;}
      if(feature.product!==product)fail(`${id}: product must be ${product}`);
      if(feature.capability!==capability)fail(`${id}: capability must be ${capability}`);
    }
  }

  for(const id of registry?.grandfatheredUnverified||[]){
    if(!byId.has(id))fail(`${id}: grandfathered capability has no registry entry`);
  }
  return failures;
}
