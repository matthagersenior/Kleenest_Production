import { useEffect,useState } from 'react';
import { Link,useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { getSupabase } from '../lib/supabase.js';
import { canonicalLocationQrCode,canonicalLocationQrUrl } from '../services/locationQr.js';

async function buildStickerQr(url,place){
 const canvas=document.createElement('canvas');
 await QRCode.toCanvas(canvas,url,{width:600,margin:4,errorCorrectionLevel:'H',color:{dark:'#173f2d',light:'#ffffff'}});
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Could not prepare QR.');
 const box=Math.round(canvas.width*.12),x=Math.round((canvas.width-box)/2);
 const glyph=String(place.brand||place.name||'K').trim().slice(0,1).toUpperCase()||'K';
 ctx.fillStyle='#ffffff';ctx.fillRect(x-4,x-4,box+8,box+8);
 ctx.fillStyle='#173f2d';ctx.beginPath();ctx.roundRect(x,x,box,box,12);ctx.fill();
 ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.font='900 '+Math.round(box*.6)+'px system-ui,sans-serif';
 ctx.fillText(glyph,x+box/2,x+box/2);
 return canvas.toDataURL('image/png');
}

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
    getSupabase().from('locations').select('id,name,brand,address,city,state,is_active').eq('id',id).eq('is_active',true).maybeSingle()
    .then(async({data,error})=>{
      if(!current)return;
      if(error)throw error;
      if(!data){setState('invalid');return;}
      const png=await buildStickerQr(url,data);
      if(!current)return;
      setImage(png);setPlace(data);setState('ready');
    }).catch(error=>{if(current){setState('error');setMessage(error?.message||'Location QR unavailable.');}});
    return()=>{current=false};
  },[id,url]);
  if(state!=='ready')return <section className="panel"><h1>Kleenest location QR</h1><p role="status">{state==='loading'?'Preparing QR…':state==='invalid'?'This location is not available.':message}</p></section>;
  const title=place?.name||'Kleenest location';
  const address=[place?.address,place?.city,place?.state].filter(Boolean).join(', ');
  return <section className="panel kleenest-printable-sticker" style={{maxWidth:600,margin:'16px auto',textAlign:'center'}}>
    <style>{`@media print {body *{visibility:hidden!important}.kleenest-printable-sticker,.kleenest-printable-sticker *{visibility:visible!important}.kleenest-printable-sticker{position:absolute;left:0;top:0;width:100%;border:0;box-shadow:none}.kleenest-qr-actions,.kleenest-print-note{display:none!important}}`}</style>
    <div className="eyebrow">KLEENEST LOCATION IDENTITY</div>
    <h1>{title}</h1><p>{address}</p>
    <p><strong>QR ready · digital identity</strong></p>
    <div style={{background:'#fff',padding:14,display:'inline-block',borderRadius:16}}>
      <img src={image} width={340} height={340} style={{maxWidth:'100%',height:'auto'}} alt={'Scannable Kleenest location QR for '+title}/>
    </div>
    <p style={{overflowWrap:'anywhere',fontSize:12}}>{url}</p>
    <p className="meta kleenest-print-note">The QR links to the existing Kleenest location. A digital QR is not proof that a printed sticker is installed or that anyone is physically here.</p>
    <div className="card-actions kleenest-qr-actions" style={{justifyContent:'center'}}>
      <a className="primary" href={image} download={'kleenest-'+code+'.png'}>Save QR image</a><button className="secondary" type="button" onClick={()=>window.print()}>Print sticker</button>
      <button className="secondary" type="button" onClick={()=>{if(navigator.share)void navigator.share({title,url}).catch(()=>{});else if(navigator.clipboard)void navigator.clipboard.writeText(url).then(()=>setMessage('QR link copied.')).catch(()=>setMessage('Copy the QR link shown above.'));}}>Share / copy link</button>
      <Link className="secondary" to={'/location/'+id}>Location details</Link>
    </div>
    {message?<p role="status">{message}</p>:null}
  </section>;
}
