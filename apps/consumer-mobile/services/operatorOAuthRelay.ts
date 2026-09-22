type OperatorPortal='business'|'fleet'|'owner';

const OPERATOR_OAUTH_RETURN_KEY='kleenest.operator.oauth.return';
const OPERATOR_OAUTH_MAX_AGE_MS=15*60*1000;
const OPERATOR_PORTALS=new Set<OperatorPortal>(['business','fleet','owner']);
const OWNER_GMAIL_OAUTH_RETURN_KEY='kleenest.native.owner.gmail.oauth.return';
const KLEENEST_SUPABASE_ORIGIN='https://ssgesjzdvdsqacdtasje.supabase.co';

function clearRelayState(){
  try{window.localStorage.removeItem(OPERATOR_OAUTH_RETURN_KEY)}catch{}
}

function clearOwnerGmailRelayState(){
  try{window.localStorage.removeItem(OWNER_GMAIL_OAUTH_RETURN_KEY)}catch{}
}

function getBrowserLocation(){
  if(typeof window==='undefined')return null;
  const location=window.location;
  if(!location
    || typeof location.search!=='string'
    || typeof location.hash!=='string'
    || typeof location.origin!=='string'
    || typeof location.replace!=='function')return null;
  return location;
}

function callbackPresent(location:Location){
  const search=new URLSearchParams(location.search);
  const hash=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
  return search.has('code')
    || search.has('error')
    || search.has('error_code')
    || hash.has('access_token')
    || hash.has('refresh_token')
    || hash.has('error')
    || hash.has('error_code');
}

function relayOwnerGmailOAuthStart(location:Location){
  const search=new URLSearchParams(location.search);
  if(search.get('kleenest_oauth_start')!=='owner-gmail')return false;
  const authorize=String(search.get('authorize')||'');
  try{
    const destination=new URL(authorize);
    if(destination.origin!==KLEENEST_SUPABASE_ORIGIN||destination.pathname!=='/auth/v1/authorize')throw new Error('Untrusted Owner Gmail OAuth start URL.');
    window.localStorage.setItem(OWNER_GMAIL_OAUTH_RETURN_KEY,JSON.stringify({createdAt:Date.now()}));
    window.location.replace(destination.toString());
    return true;
  }catch{
    clearOwnerGmailRelayState();
    return false;
  }
}

function relayOwnerGmailOAuthCallback(location:Location){
  if(!callbackPresent(location))return false;
  let target:{createdAt?:number}|null=null;
  try{
    const raw=window.localStorage.getItem(OWNER_GMAIL_OAUTH_RETURN_KEY);
    target=raw?JSON.parse(raw):null;
  }catch{
    target=null;
  }
  const createdAt=Number(target?.createdAt||0);
  const age=Date.now()-createdAt;
  if(!Number.isFinite(age)||age<0||age>OPERATOR_OAUTH_MAX_AGE_MS){
    clearOwnerGmailRelayState();
    return false;
  }

  clearOwnerGmailRelayState();
  const search=new URLSearchParams(location.search);
  search.delete('kleenest_oauth_start');
  search.delete('authorize');
  const query=search.toString();
  const destination='kleenest-owner://communications'+(query?'?'+query:'')+(location.hash||'');
  window.location.replace(destination);
  return true;
}

export function relayOperatorOAuthCallback(){
  const location=getBrowserLocation();
  if(!location)return false;
  if(relayOwnerGmailOAuthStart(location))return true;
  if(!callbackPresent(location))return false;
  if(relayOwnerGmailOAuthCallback(location))return true;

  let target:{portal?:string;intent?:string;createdAt?:number}|null=null;
  try{
    const raw=window.localStorage.getItem(OPERATOR_OAUTH_RETURN_KEY);
    target=raw?JSON.parse(raw):null;
  }catch{
    target=null;
  }

  const portal=String(target?.portal||'') as OperatorPortal;
  const createdAt=Number(target?.createdAt||0);
  const age=Date.now()-createdAt;
  if(!OPERATOR_PORTALS.has(portal)||!Number.isFinite(age)||age<0||age>OPERATOR_OAUTH_MAX_AGE_MS){
    clearRelayState();
    return false;
  }

  const search=new URLSearchParams(location.search);
  const intent=portal==='business'?String(target?.intent||'').trim():'';
  if(intent&&!search.has('intent'))search.set('intent',intent);

  clearRelayState();
  const query=search.toString();
  const destination=location.origin+'/Kleenest_Production/'+portal+'/auth/'+(query?'?'+query:'')+(location.hash||'');
  window.location.replace(destination);
  return true;
}
