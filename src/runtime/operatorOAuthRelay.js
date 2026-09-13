const OPERATOR_OAUTH_RETURN_KEY='kleenest.operator.oauth.return';
const OPERATOR_PORTALS=new Set(['business','fleet','owner']);

function callbackPresent(){
  const search=new URLSearchParams(window.location.search);
  const hash=new URLSearchParams(String(window.location.hash||'').replace(/^#/,''));
  return search.has('code')
    || search.has('error')
    || search.has('error_code')
    || hash.has('access_token')
    || hash.has('refresh_token')
    || hash.has('error')
    || hash.has('error_code');
}

export function relayOperatorOAuthCallback(){
  if(typeof window==='undefined'||!callbackPresent())return false;
  let target=null;
  try{
    const raw=window.localStorage.getItem(OPERATOR_OAUTH_RETURN_KEY);
    target=raw?JSON.parse(raw):null;
  }catch{target=null;}
  const portal=String(target?.portal||'');
  if(!OPERATOR_PORTALS.has(portal))return false;
  const search=new URLSearchParams(window.location.search);
  const intent=portal==='business'?String(target?.intent||'').trim():'';
  if(intent&&!search.has('intent'))search.set('intent',intent);
  try{window.localStorage.removeItem(OPERATOR_OAUTH_RETURN_KEY)}catch{}
  const query=search.toString();
  const destination=window.location.origin+'/Kleenest_Production/'+portal+'/auth/'+(query?'?'+query:'')+(window.location.hash||'');
  window.location.replace(destination);
  return true;
}
