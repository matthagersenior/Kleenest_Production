import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')??'';
const secretKeys=(()=>{try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}')}catch{return{}}})();
const publishableKeys=(()=>{try{return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')??'{}')}catch{return{}}})();
const SERVICE_KEY=secretKeys.default??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const PUBLISHABLE_KEY=publishableKeys.default??Deno.env.get('SUPABASE_ANON_KEY')??'';
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

const FREE_EMAIL_DOMAINS=new Set([
  'gmail.com','googlemail.com','yahoo.com','outlook.com','hotmail.com','live.com','icloud.com',
  'aol.com','proton.me','protonmail.com','pm.me','mail.com','gmx.com','gmx.net','msn.com'
]);

type Actor={userId:string;email:string;emailConfirmed:boolean};
type ClaimContext={
  claim:Record<string,any>;
  location:Record<string,any>;
  business:Record<string,any>;
  role:string;
  canonicalDomain:string|null;
};

class ClaimError extends Error{
  constructor(message:string,readonly status=400){super(message);this.name='ClaimError'}
}

function corsHeaders(req:Request){
  const origin=req.headers.get('origin')||'*';
  return{
    'access-control-allow-origin':origin,
    'access-control-allow-methods':'POST,OPTIONS',
    'access-control-allow-headers':'authorization,apikey,content-type,x-client-info',
    'access-control-max-age':'600',
    'vary':origin==='*'?'':'Origin',
  };
}
function json(req:Request,body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders(req),'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
function clean(value:unknown){return String(value??'').trim()}
function uuid(value:unknown,label:string){
  const v=clean(value);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw new ClaimError(`${label} is invalid`);
  return v;
}
function canonicalDomain(value:unknown){
  let raw=clean(value);
  if(!raw)return null;
  if(!/^https?:\/\//i.test(raw))raw='https://'+raw;
  try{
    const host=new URL(raw).hostname.toLowerCase().replace(/^www\./,'');
    if(!host.includes('.')||host==='localhost'||host.endsWith('.local')||host.endsWith('.internal'))return null;
    if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host)||host.includes(':'))return null;
    if(!/^[a-z0-9.-]+$/.test(host))return null;
    return host;
  }catch{return null}
}
function emailDomain(email:string){return email.toLowerCase().split('@').at(-1)||''}
function domainsMatch(email:string,website:string){
  const e=emailDomain(email),w=canonicalDomain(website);
  if(!e||!w||FREE_EMAIL_DOMAINS.has(e))return false;
  return e===w||w.endsWith('.'+e)||e.endsWith('.'+w);
}
async function actorFor(req:Request):Promise<Actor|null>{
  const authHeader=req.headers.get('authorization')??'';
  if(!authHeader.toLowerCase().startsWith('bearer ')||!PUBLISHABLE_KEY)return null;
  const userClient=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:authHeader}},
  });
  const{data,error}=await userClient.auth.getUser();
  const user=data.user;
  if(error||!user?.id||!user.email)return null;
  return{userId:user.id,email:user.email,emailConfirmed:Boolean(user.email_confirmed_at)};
}
async function sha256(value:string){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
function randomToken(){
  const bytes=new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return 'kleenest-verify='+Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function contextFor(actor:Actor,claimIdRaw:unknown):Promise<ClaimContext>{
  const claimId=uuid(claimIdRaw,'Claim');
  const{data:claim,error:claimError}=await admin.from('location_claims').select('*').eq('id',claimId).maybeSingle();
  if(claimError)throw claimError;
  if(!claim)throw new ClaimError('Claim not found',404);

  const{data:member,error:memberError}=await admin.from('business_members').select('role').eq('business_id',claim.business_id).eq('user_id',actor.userId).maybeSingle();
  if(memberError)throw memberError;
  if(!member||!['owner','admin','manager'].includes(String(member.role)))throw new ClaimError('Business management access required',403);

  const[{data:location,error:locationError},{data:business,error:businessError}]=await Promise.all([
    admin.from('locations').select('id,name,address,city,state,website,business_id,claimed_business_id,is_active').eq('id',claim.location_id).maybeSingle(),
    admin.from('businesses').select('id,name,verification_status').eq('id',claim.business_id).maybeSingle(),
  ]);
  if(locationError)throw locationError;
  if(businessError)throw businessError;
  if(!location||!business)throw new ClaimError('Claim context is incomplete',409);

  return{claim,location,business,role:String(member.role),canonicalDomain:canonicalDomain(location.website)};
}
function evidenceList(value:unknown){
  return Array.isArray(value)?value.map(String):[];
}
async function insertEvent(ctx:ClaimContext,actor:Actor,eventType:string,metadata:Record<string,unknown>={}){
  const{error}=await admin.from('business_claim_verification_events').insert({
    claim_id:ctx.claim.id,business_id:ctx.claim.business_id,location_id:ctx.claim.location_id,
    actor_user_id:actor.userId,event_type:eventType,metadata,
  });
  if(error)throw error;
}
async function maybeAutoApprove(ctx:ClaimContext,actor:Actor,evidence:string[]){
  if(ctx.claim.existing_operator_business_id||!evidence.includes('company_email_domain')||!evidence.includes('dns_txt'))return false;

  const{data:locationRows,error:locationError}=await admin.from('locations')
    .update({business_id:ctx.claim.business_id,claimed_business_id:ctx.claim.business_id,updated_at:new Date().toISOString()})
    .eq('id',ctx.claim.location_id).is('business_id',null).is('claimed_business_id',null).select('id');
  if(locationError)throw locationError;

  if((locationRows??[]).length){
    const now=new Date().toISOString();
    const{error:claimError}=await admin.from('location_claims').update({
      status:'approved',verification_state:'automated_approved',assurance_level:'location_operator_verified',
      risk_score:0,risk_reasons:[],verification_method:'company_email_domain+dns_txt',
      verified_at:now,last_evidence_at:now,resolved_by:actor.userId,
      resolution_note:'Automatically approved after confirmed company-domain email and canonical-domain DNS TXT verification.',
      updated_at:now,
    }).eq('id',ctx.claim.id);
    if(claimError)throw claimError;
    await insertEvent(ctx,actor,'automated_claim_approved',{evidence});
    await admin.from('notifications').insert({
      user_id:actor.userId,type:'business_claim',title:'Location authority verified',
      body:'Kleenest verified company email and DNS control. This location is now attached to your Business workspace.',
      data:{claim_id:ctx.claim.id,location_id:ctx.claim.location_id,action:'business_claim_update'},
    });
    return true;
  }

  const{data:latest}=await admin.from('locations').select('business_id,claimed_business_id').eq('id',ctx.claim.location_id).maybeSingle();
  const operator=latest?.business_id??latest?.claimed_business_id??null;
  if(operator){
    await admin.from('location_claims').update({
      existing_operator_business_id:operator,requested_authority:'location_transfer',
      verification_state:'review_required',risk_score:95,
      risk_reasons:['existing_operator_appeared_during_verification','authority_transfer_requested'],
      updated_at:new Date().toISOString(),
    }).eq('id',ctx.claim.id);
    await insertEvent(ctx,actor,'auto_approval_blocked_existing_operator',{existing_operator_business_id:operator});
  }
  return false;
}
async function recordEvidence(ctx:ClaimContext,actor:Actor,method:'company_email_domain'|'dns_txt',riskReduction:number){
  const evidence=[...new Set([...evidenceList(ctx.claim.verified_evidence),method])];
  const existingOperator=Boolean(ctx.claim.existing_operator_business_id);
  const currentRisk=Number(ctx.claim.risk_score??60);
  const risk=Math.max(existingOperator?80:10,currentRisk-riskReduction);
  const now=new Date().toISOString();
  const{error}=await admin.from('location_claims').update({
    verified_evidence:evidence,verification_method:method,verification_state:existingOperator?'review_required':'evidence_verified',
    assurance_level:'business_identity_verified',risk_score:risk,last_evidence_at:now,updated_at:now,
  }).eq('id',ctx.claim.id);
  if(error)throw error;
  ctx.claim={...ctx.claim,verified_evidence:evidence,risk_score:risk,verification_state:existingOperator?'review_required':'evidence_verified'};
  await insertEvent(ctx,actor,'claim_evidence_verified',{method,risk_score:risk});
  const autoApproved=await maybeAutoApprove(ctx,actor,evidence);
  return{evidence,riskScore:autoApproved?0:risk,autoApproved};
}
async function activeChallenge(claimId:string){
  const{data,error}=await admin.from('business_claim_verification_challenges')
    .select('id,method,status,expected_domain,destination_hint,expires_at,verified_at,created_at')
    .eq('claim_id',claimId).eq('status','pending').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;
  return data??null;
}
async function startDns(ctx:ClaimContext,actor:Actor){
  if(!ctx.canonicalDomain)throw new ClaimError('This canonical location does not have a usable business website domain. Use operator or Kleenest review instead.',409);
  const token=randomToken();
  const tokenHash=await sha256(token);
  const dnsName=`_kleenest-verification.${ctx.canonicalDomain}`;
  const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();

  await admin.from('business_claim_verification_challenges')
    .update({status:'cancelled',updated_at:new Date().toISOString()})
    .eq('claim_id',ctx.claim.id).eq('method','dns_txt').eq('status','pending');

  const{data,error}=await admin.from('business_claim_verification_challenges').insert({
    claim_id:ctx.claim.id,business_id:ctx.claim.business_id,location_id:ctx.claim.location_id,created_by:actor.userId,
    method:'dns_txt',status:'pending',token_hash:tokenHash,expected_domain:ctx.canonicalDomain,
    destination_hint:dnsName,expires_at:expiresAt,
  }).select('id').single();
  if(error||!data?.id)throw error??new Error('DNS challenge could not be created.');

  await admin.from('location_claims').update({
    verification_state:ctx.claim.existing_operator_business_id?'review_required':'evidence_pending',
    verification_method:'dns_txt',updated_at:new Date().toISOString(),
  }).eq('id',ctx.claim.id);
  await insertEvent(ctx,actor,'dns_challenge_started',{dns_name:dnsName,expires_at:expiresAt});
  return{challengeId:String(data.id),dnsName,token,expiresAt};
}
function normalizeTxt(value:unknown){
  let s=String(value??'').trim();
  if(s.startsWith('"')&&s.endsWith('"'))s=s.slice(1,-1);
  return s.replace(/\\"/g,'"').trim();
}
async function verifyDns(ctx:ClaimContext,actor:Actor,challengeIdRaw:unknown){
  const challengeId=uuid(challengeIdRaw,'Challenge');
  const{data:challenge,error}=await admin.from('business_claim_verification_challenges').select('*')
    .eq('id',challengeId).eq('claim_id',ctx.claim.id).eq('business_id',ctx.claim.business_id).maybeSingle();
  if(error)throw error;
  if(!challenge)throw new ClaimError('DNS verification challenge not found',404);
  if(challenge.status==='verified')return{verified:true,...await recordEvidence(ctx,actor,'dns_txt',35)};
  if(challenge.status!=='pending')throw new ClaimError('DNS verification challenge is no longer active',409);
  if(new Date(challenge.expires_at).getTime()<Date.now()){
    await admin.from('business_claim_verification_challenges').update({status:'expired',updated_at:new Date().toISOString()}).eq('id',challenge.id);
    throw new ClaimError('DNS verification challenge expired. Start a new challenge.',409);
  }

  const name=clean(challenge.destination_hint);
  const url=`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  let response:Response;
  try{
    response=await fetch(url,{headers:{accept:'application/dns-json'},signal:controller.signal});
  }finally{clearTimeout(timer)}
  if(!response.ok)throw new ClaimError('DNS verification lookup failed. Try again after DNS propagation.',502);
  const dns=await response.json().catch(()=>({}));
  const answers=Array.isArray(dns?.Answer)?dns.Answer:[];
  let matched=false;
  for(const answer of answers){
    const value=normalizeTxt(answer?.data);
    if(value&&await sha256(value)===challenge.token_hash){matched=true;break}
  }

  const attempts=Number(challenge.attempts??0)+1;
  if(!matched){
    await admin.from('business_claim_verification_challenges').update({
      attempts,status:attempts>=8?'failed':'pending',updated_at:new Date().toISOString(),
    }).eq('id',challenge.id);
    await insertEvent(ctx,actor,'dns_challenge_check_failed',{dns_name:name,attempts});
    throw new ClaimError('The Kleenest TXT value is not visible yet. DNS changes can take time to propagate.',409);
  }

  const now=new Date().toISOString();
  await admin.from('business_claim_verification_challenges').update({
    attempts,status:'verified',verified_at:now,updated_at:now,
  }).eq('id',challenge.id);
  const result=await recordEvidence(ctx,actor,'dns_txt',35);
  return{verified:true,...result};
}
async function verifyEmail(ctx:ClaimContext,actor:Actor){
  if(!actor.emailConfirmed)throw new ClaimError('Confirm your Kleenest account email before using company-domain verification.',409);
  if(!ctx.canonicalDomain)throw new ClaimError('This canonical location has no usable website domain for company-email matching.',409);
  if(!domainsMatch(actor.email,String(ctx.location.website??''))){
    throw new ClaimError(`Your confirmed email domain does not match the canonical location domain ${ctx.canonicalDomain}.`,409);
  }
  return{verified:true,domain:ctx.canonicalDomain,...await recordEvidence(ctx,actor,'company_email_domain',20)};
}
async function statusFor(ctx:ClaimContext,actor:Actor){
  const challenge=await activeChallenge(String(ctx.claim.id));
  const eDomain=emailDomain(actor.email);
  return{
    claimId:ctx.claim.id,status:ctx.claim.status,verificationState:ctx.claim.verification_state,
    assuranceLevel:ctx.claim.assurance_level,riskScore:ctx.claim.risk_score,riskReasons:ctx.claim.risk_reasons,
    existingOperatorPresent:Boolean(ctx.claim.existing_operator_business_id),
    verifiedEvidence:evidenceList(ctx.claim.verified_evidence),
    canonicalDomain:ctx.canonicalDomain,
    companyEmail:{confirmed:actor.emailConfirmed,domain:eDomain,eligible:actor.emailConfirmed&&Boolean(ctx.canonicalDomain)&&domainsMatch(actor.email,String(ctx.location.website??''))},
    dns:{eligible:Boolean(ctx.canonicalDomain),challenge},
    role:ctx.role,
  };
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{status:204,headers:corsHeaders(req)});
  if(req.method!=='POST')return json(req,{error:'POST required'},405);
  if(!SUPABASE_URL||!SERVICE_KEY||!PUBLISHABLE_KEY)return json(req,{error:'Service unavailable'},503);

  const actor=await actorFor(req);
  if(!actor)return json(req,{error:'Unauthorized'},401);

  try{
    const body=await req.json().catch(()=>({}));
    const action=clean(body?.action||'status');
    const ctx=await contextFor(actor,body?.claimId);
    if(action==='status')return json(req,await statusFor(ctx,actor));
    if(action==='verify_email_domain')return json(req,await verifyEmail(ctx,actor));
    if(action==='start_dns_txt')return json(req,await startDns(ctx,actor));
    if(action==='verify_dns_txt')return json(req,await verifyDns(ctx,actor,body?.challengeId));
    throw new ClaimError('Unsupported verification action',400);
  }catch(error){
    if(error instanceof ClaimError)return json(req,{error:error.message},error.status);
    console.error('business-claim-verification failed',error instanceof Error?error.name:'unknown_error');
    return json(req,{error:'Claim verification could not be completed.'},400);
  }
});
