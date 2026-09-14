type OperatorPortal='business'|'fleet'|'owner';

const OPERATOR_OAUTH_RETURN_KEY='kleenest.operator.oauth.return';
const OPERATOR_OAUTH_MAX_AGE_MS=15*60*1000;
const OPERATOR_PORTALS=new Set<OperatorPortal>(['business','fleet','owner']);

function clearRelayState(){
  try{window.localStorage.removeItem(OPERATOR_OAUTH_RETURN_KEY)}catch{}
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

export function relayOperatorOAuthCallback(){
  const location=getBrowserLocation();
  if(!location||!callbackPresent(location))return false;

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
  location.replace(destination);
  return true;
}
