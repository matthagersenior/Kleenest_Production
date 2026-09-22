import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')??'';
const secretKeys=(()=>{try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}')}catch{return{}}})();
const publishableKeys=(()=>{try{return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')??'{}')}catch{return{}}})();
const SERVICE_KEY=secretKeys.default??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const PUBLISHABLE_KEY=publishableKeys.default??Deno.env.get('SUPABASE_ANON_KEY')??'';
const PRODUCT_ID='kleenest_remove_ads_lifetime';
const DEFAULT_PACKAGE='com.kleenest.app';
const DEFAULT_BUNDLE='com.kleenest.app';
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

type PurchaseInput={productId?:unknown;transactionId?:unknown;purchaseToken?:unknown;transactionDate?:unknown;store?:unknown};
type IapConfig={
  product_id?:string;
  apple?:{issuer_id?:string;key_id?:string;private_key?:string;bundle_id?:string};
  google?:{client_email?:string;private_key?:string;token_uri?:string;package_name?:string};
};
class VerifyError extends Error{constructor(message:string,readonly status=400,readonly code='verification_failed'){super(message)}}
const enc=new TextEncoder();

function json(req:Request,body:unknown,status=200){const origin=req.headers.get('origin')||'*';return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':origin,'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'authorization,apikey,content-type,x-client-info',vary:origin==='*'?'':'Origin'}})}
function text(v:unknown){return String(v??'').trim()}
function config():IapConfig{try{return JSON.parse(Deno.env.get('KLEENEST_IAP_CREDENTIALS_JSON')??'{}')}catch{return{}}}
function b64url(value:Uint8Array|string){const bytes=typeof value==='string'?enc.encode(value):value;let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
function pemBytes(pem:string){const raw=pem.replace(/\\n/g,'\n').replace(/-----BEGIN [^-]+-----/g,'').replace(/-----END [^-]+-----/g,'').replace(/\s/g,'');if(!raw)throw new VerifyError('Store verification key is missing.',503,'store_verifier_not_configured');return Uint8Array.from(atob(raw),c=>c.charCodeAt(0))}
function decodeJwsPayload(jws:string){const part=jws.split('.')[1]||'';const padded=(part.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((part.length+3)%4));return JSON.parse(atob(padded))}
async function sha256Hex(value:string){const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)));return Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('')}
async function signJwt(header:Record<string,unknown>,payload:Record<string,unknown>,pem:string,kind:'apple'|'google'){
  const signingInput=`${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key=await crypto.subtle.importKey('pkcs8',pemBytes(pem),kind==='apple'?{name:'ECDSA',namedCurve:'P-256'}:{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign(kind==='apple'?{name:'ECDSA',hash:'SHA-256'}:{name:'RSASSA-PKCS1-v1_5'},key,enc.encode(signingInput));
  return `${signingInput}.${b64url(new Uint8Array(signature))}`;
}
async function actor(req:Request){
  const authHeader=req.headers.get('authorization')??'';
  if(!authHeader.toLowerCase().startsWith('bearer ')||!PUBLISHABLE_KEY)throw new VerifyError('Authentication required.',401,'unauthorized');
  const client=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authHeader}}});
  const{data,error}=await client.auth.getUser();
  if(error||!data.user?.id)throw new VerifyError('Authentication required.',401,'unauthorized');
  return data.user;
}
function platformOf(input:PurchaseInput){
  const store=text(input.store).toLowerCase();
  if(store.includes('apple')||store.includes('ios')||store.includes('app_store'))return'apple';
  if(store.includes('google')||store.includes('android')||store.includes('play'))return'google';
  if(text(input.purchaseToken))return'google';
  if(text(input.transactionId))return'apple';
  throw new VerifyError('Store platform could not be determined.');
}
async function googleAccessToken(cfg:NonNullable<IapConfig['google']>){
  const clientEmail=text(cfg.client_email),privateKey=text(cfg.private_key),tokenUri=text(cfg.token_uri)||'https://oauth2.googleapis.com/token';
  if(!clientEmail||!privateKey)throw new VerifyError('Google Play verifier is not configured.',503,'store_verifier_not_configured');
  const now=Math.floor(Date.now()/1000);
  const assertion=await signJwt({alg:'RS256',typ:'JWT'},{iss:clientEmail,scope:'https://www.googleapis.com/auth/androidpublisher',aud:tokenUri,iat:now,exp:now+3600},privateKey,'google');
  const response=await fetch(tokenUri,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  const data=await response.json();
  if(!response.ok||!data?.access_token)throw new VerifyError('Google Play verifier could not authenticate.',503,'store_verifier_unavailable');
  return String(data.access_token);
}
async function verifyGoogle(input:PurchaseInput,userId:string,cfg:IapConfig){
  const productId=text(input.productId),token=text(input.purchaseToken);
  const product=cfg.product_id||PRODUCT_ID,packageName=cfg.google?.package_name||DEFAULT_PACKAGE;
  if(productId!==product||!token)throw new VerifyError('Google Play purchase data is incomplete.');
  const access=await googleAccessToken(cfg.google||{});
  const url=`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  const response=await fetch(url,{headers:{authorization:`Bearer ${access}`}});
  const data=await response.json();
  if(!response.ok)throw new VerifyError('Google Play could not verify this purchase.',400,'store_rejected');
  if(Number(data.purchaseState)!==0)throw new VerifyError('Google Play reports that this purchase is not completed.',400,'store_rejected');
  if(data.obfuscatedExternalAccountId&&String(data.obfuscatedExternalAccountId)!==userId)throw new VerifyError('This Google Play purchase belongs to a different Kleenest account.',409,'account_mismatch');
  const transactionId=text(data.orderId)||text(input.transactionId)||await sha256Hex(token);
  return{platform:'google',productId,transactionId,environment:Number(data.purchaseType)===0?'test':'production',tokenHash:await sha256Hex(token),summary:{order_id:text(data.orderId)||null,purchase_time_millis:text(data.purchaseTimeMillis)||null,acknowledgement_state:data.acknowledgementState??null,purchase_state:data.purchaseState??null}};
}
async function appleJwt(cfg:NonNullable<IapConfig['apple']>){
  const issuer=text(cfg.issuer_id),kid=text(cfg.key_id),privateKey=text(cfg.private_key),bundle=text(cfg.bundle_id)||DEFAULT_BUNDLE;
  if(!issuer||!kid||!privateKey)throw new VerifyError('Apple App Store verifier is not configured.',503,'store_verifier_not_configured');
  const now=Math.floor(Date.now()/1000);
  return signJwt({alg:'ES256',kid,typ:'JWT'},{iss:issuer,iat:now,exp:now+600,aud:'appstoreconnect-v1',bid:bundle},privateKey,'apple');
}
async function fetchAppleTransaction(transactionId:string,token:string){
  const hosts=['https://api.storekit.itunes.apple.com','https://api.storekit-sandbox.itunes.apple.com'];
  let lastStatus=0;
  for(const host of hosts){
    const response=await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,{headers:{authorization:`Bearer ${token}`}});
    lastStatus=response.status;
    if(response.ok)return{data:await response.json(),environment:host.includes('sandbox')?'sandbox':'production'};
    if(![400,404].includes(response.status))break;
  }
  throw new VerifyError(`Apple App Store could not verify this purchase (status ${lastStatus}).`,400,'store_rejected');
}
async function verifyApple(input:PurchaseInput,userId:string,cfg:IapConfig){
  const productId=text(input.productId),transactionId=text(input.transactionId),product=cfg.product_id||PRODUCT_ID,bundle=cfg.apple?.bundle_id||DEFAULT_BUNDLE;
  if(productId!==product||!transactionId)throw new VerifyError('Apple purchase data is incomplete.');
  const token=await appleJwt(cfg.apple||{});
  const verified=await fetchAppleTransaction(transactionId,token);
  const signed=text(verified.data?.signedTransactionInfo);
  if(!signed)throw new VerifyError('Apple did not return signed transaction information.',400,'store_rejected');
  const payload=decodeJwsPayload(signed);
  if(text(payload.productId)!==product)throw new VerifyError('Apple verified a different product.',400,'store_rejected');
  if(text(payload.bundleId)!==bundle)throw new VerifyError('Apple verified a different app bundle.',400,'store_rejected');
  if(payload.revocationDate)throw new VerifyError('This Apple purchase has been revoked.',400,'store_rejected');
  if(payload.appAccountToken&&text(payload.appAccountToken)!==userId)throw new VerifyError('This Apple purchase belongs to a different Kleenest account.',409,'account_mismatch');
  return{platform:'apple',productId:product,transactionId:text(payload.transactionId)||transactionId,environment:text(payload.environment)||verified.environment,tokenHash:await sha256Hex(signed),summary:{original_transaction_id:text(payload.originalTransactionId)||null,purchase_date:payload.purchaseDate??null,ownership_type:text(payload.inAppOwnershipType)||null,app_account_token:text(payload.appAccountToken)||null}};
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return json(req,{ok:true});
  if(req.method!=='POST')return json(req,{verified:false,error:'Method not allowed.'},405);
  try{
    const user=await actor(req);
    const body=await req.json().catch(()=>({}));
    const purchase=(body?.purchase||{}) as PurchaseInput;
    const cfg=config();
    const platform=platformOf(purchase);
    const result=platform==='google'?await verifyGoogle(purchase,user.id,cfg):await verifyApple(purchase,user.id,cfg);
    const{error}=await admin.rpc('grant_mobile_store_premium',{
      p_user_id:user.id,
      p_platform:result.platform,
      p_product_id:result.productId,
      p_transaction_id:result.transactionId,
      p_purchase_token_sha256:result.tokenHash,
      p_store_environment:result.environment,
      p_verification_summary:result.summary,
    });
    if(error)throw new VerifyError(error.message||'Kleenest could not grant the verified purchase.',500,'entitlement_grant_failed');
    return json(req,{verified:true,platform:result.platform,productId:result.productId,entitlement:'premium'});
  }catch(error){
    const known=error instanceof VerifyError?error:new VerifyError(error instanceof Error?error.message:'Purchase verification failed.',500,'verification_failed');
    return json(req,{verified:false,error:known.message,code:known.code},known.status);
  }
});
