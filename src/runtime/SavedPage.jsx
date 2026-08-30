import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listFavoriteLocations } from '../services/favorites.js';

export default function SavedPage() {
  const navigate=useNavigate();
  const [status,setStatus]=useState('loading');
  const [places,setPlaces]=useState([]);
  const [error,setError]=useState('');

  useEffect(()=>{let active=true;listFavoriteLocations().then((rows)=>{if(active){setPlaces(rows);setStatus('ready');}}).catch((err)=>{if(active){setError(err?.message||'Saved places could not be loaded.');setStatus('error');}});return()=>{active=false;};},[]);

  if(status==='loading') return <section className="panel"><div className="eyebrow">SAVED</div><h1>Saved places</h1><p>Loading your saved restrooms…</p></section>;
  if(status==='error') return <section className="panel"><div className="eyebrow">SAVED</div><h1>Saved places</h1><div className="notice error">{error}</div></section>;
  return <><section className="panel"><div className="eyebrow">SAVED</div><h1>Saved places</h1><p>Your saved locations come from Kleenest's canonical favorite RPC authority.</p></section><section className="results">{places.length===0?<div className="notice">You have no saved locations yet.</div>:places.map((place)=><article className="place-card" key={place.id}><div className="place-main"><h2>{place.name||'Restroom location'}</h2><p>{[place.address,place.city,place.state].filter(Boolean).join(', ')||'Address unavailable'}</p></div><div className="card-actions"><button className="secondary" onClick={()=>navigate(`/location/${place.id}`)}>Details</button><button className="primary" onClick={()=>navigate(`/route?add=${place.id}`)}>Add to route</button></div></article>)}</section></>;
}
