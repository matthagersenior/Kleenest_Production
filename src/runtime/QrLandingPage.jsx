import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {getSupabase} from '../lib/supabase.js';

function safeWebUrl(input){
  try{const url=new URL(String(input||''));return ['http:','https:'].includes(url.protocol)?url.href:null}catch{return null}
}
export default function QrLandingPage(){
  const [params]=useSearchParams();
  const code=String(params.get('code')||'').trim();
  const [qr,setQr]=useState(null),[status,setStatus]=useState('loading'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;setStatus('loading');setMessage('');
    if(!code||code.length>256){setStatus('invalid');return;}
    getSupabase().rpc('get_public_qr_landing',{p_qr_code:code})
      .then(({data,error})=>{if(!active)return;if(error||!data?.id){setStatus('invalid');return;}setQr(data);setStatus('ready')})
      .catch(()=>{if(active)setStatus('error')});
    return()=>{active=false};
  },[code]);
  const verify=()=>{
    if(!qr?.location_id||busy)return;
    if(!navigator.geolocation){setMessage('Precise location is required to verify a visit.');return;}
    setBusy(true);setMessage('Checking your on-site location…');
    navigator.geolocation.getCurrentPosition(async({coords})=>{
      try{const {error}=await getSupabase().rpc('verify_checkin',{p_qr_code:code,p_lat:coords.latitude,p_lng:coords.longitude,p_accuracy_m:coords.accuracy??null});if(error)throw error;
        setMessage('GPS/geofence check-in verified. You can now add a review on the location page.');
      }catch(error){setMessage(error?.message||'Visit could not be verified. Sign in and check your location permissions.');}
      finally{setBusy(false);}
    },()=>{setBusy(false);setMessage('Location access is needed for a verified visit. You can still view this location.');},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  };
  if(status!=='ready')return <section className="panel"><h1>Kleenest QR</h1><p role="status">{status==='loading'?'Opening QR…':'This QR is invalid, inactive, or unavailable.'}</p><Link to="/nearby">Explore nearby locations</Link></section>;
  const address=[qr.address,qr.city,qr.state].filter(Boolean).join(', ');
  const destination=qr.location_id?'/location/'+encodeURIComponent(qr.location_id):'/nearby';
  const custom=qr.customization&&typeof qr.customization==='object'?qr.customization:{};
  const brand=custom.brand&&typeof custom.brand==='object'?custom.brand:{};
  const external=safeWebUrl(brand.cta_url||custom.cta_url||qr.business_website);
  return <section className="panel" style={{maxWidth:700,margin:'16px auto'}}>
    <div className="eyebrow">KLEENEST QR · {qr.canonical_location_identity?'CANONICAL LOCATION':'BUSINESS ACTION'}</div>
    {qr.business_logo_url?<img src={qr.business_logo_url} alt="" width="72" height="72" style={{objectFit:'contain',marginTop:8}}/>:null}
    <h1>{qr.location_name||qr.business_name||'Kleenest QR'}</h1>
    {address?<p>{address}</p>:null}
    <p>{qr.business_name?'Business: '+qr.business_name:'Kleenest community listing · business not claimed'}</p>
    {brand.welcome_message?<p>{String(brand.welcome_message).slice(0,500)}</p>:null}
    {brand.offer_text?<p><strong>Business offer: </strong>{String(brand.offer_text).slice(0,400)}</p>:null}
    {qr.rating!=null?<p>{Number(qr.rating).toFixed(1)} ★ · {qr.review_count||0} reviews</p>:null}
    <p className="meta">Scan identifies the location. It does not by itself verify a visit or a physical QR placement.</p>
    <div className="card-actions">
      <Link className="primary" to={destination}>Open location & feedback</Link>
      {qr.location_id?<button type="button" className="secondary" disabled={busy} onClick={verify}>{busy?'Checking…':'Verify on-site visit'}</button>:null}
      {external?<a className="secondary" href={external} target="_blank" rel="noopener noreferrer">{String(brand.cta_label||custom.cta_label||'Business website').slice(0,90)}</a>:null}
    </div>
    {message?<p role="status" className="notice">{message}</p>:null}
    <p className="meta">A verified review still requires an eligible on-site check-in. Businesses can customize their approved experience without changing this canonical identity.</p>
  </section>;
}
