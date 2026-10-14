import { useEffect,useState } from 'react';
import { Link,useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { getSupabase } from '../lib/supabase.js';
import { canonicalLocationQrCode,canonicalLocationQrUrl } from '../services/locationQr.js';

export default function LocationQrPage(){
  const {id}=useParams();
  const code=canonicalLocationQrCode(id),url=canonicalLocationQrUrl(id);
  const [image,setImage]=useState('');
  const [place,setPlace]=useState(null);
  const [state,setState]=useState('loading');
  const [message,setMessage]=useState('');
  useEffect(()=>{
    let current=true;
    if(!url){setState('invalid');return;}
    Promise.all([
      QRCode.toDataURL(url,{width:340,margin:4,errorCorrectionLevel:'M',color:{dark:'#173f2d',light:'#FFFFFF'}}),
      getSupabase().from('locations').select('id,name,address,city,state,is_active').eq('id',id).eq('is_active',true).maybeSingle()
    ]).then(([png,result])=>{
      if(!current)return;
      if(result.error)throw result.error;
      if(!result.data){setState('invalid');return;}
      setImage(png);setPlace(result.data);setState('ready');
    }).catch(error=>{if(current){setState('error');setMessage(error?.message||'Location QR unavailable.');}});
    return()=>{current=false};
  },[id,url]);
  if(state!=='ready')return <section className="panel"><h1>Kleenest location QR</h1><p role="status">{state==='loading'?'Preparing QR…':state==='invalid'?'This location is not available.':message}</p></section>;
  const title=place?.name||'Kleenest location';
  const address=[place?.address,place?.city,place?.state].filter(Boolean).join(', ');
  return <section className="panel" style={{maxWidth:600,margin:'16px auto',textAlign:'center'}}>
    <div className="eyebrow">KLEENEST LOCATION IDENTITY</div>
    <h1>{title}</h1><p>{address}</p>
    <p><strong>QR ready · digital identity</strong></p>
    <div style={{background:'#fff',padding:14,display:'inline-block',borderRadius:16}}>
      <img src={image} width={340} height={340} style={{maxWidth:'100%',height:'auto'}} alt={'Scannable Kleenest location QR for '+title}/>
    </div>
    <p style={{overflowWrap:'anywhere',fontSize:12}}>{url}</p>
    <p className="meta">The QR links to the existing Kleenest location. A digital QR is not proof that a printed sticker is installed or that anyone is physically here.</p>
    <div className="card-actions" style={{justifyContent:'center'}}>
      <a className="primary" href={image} download={'kleenest-'+code+'.png'}>Save QR image</a>
      <button className="secondary" type="button" onClick={()=>{if(navigator.share)void navigator.share({title,url}).catch(()=>{});else if(navigator.clipboard)void navigator.clipboard.writeText(url).then(()=>setMessage('QR link copied.')).catch(()=>setMessage('Copy the QR link shown above.'));}}>Share / copy link</button>
      <Link className="secondary" to={'/location/'+id}>Location details</Link>
    </div>
    {message?<p role="status">{message}</p>:null}
  </section>;
}
