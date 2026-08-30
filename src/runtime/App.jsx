import { useCallback, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { findNearbyRestrooms } from '../services/nearby.js';
import LocationPage from './LocationPage.jsx';
import ProfilePage from './ProfilePage.jsx';
import RoutePage from './RoutePage.jsx';
import SavedPage from './SavedPage.jsx';

const navItems = [['/', 'Home'], ['/nearby', 'Explore'], ['/route', 'Route'], ['/saved', 'Saved'], ['/profile', 'Profile']];

function Layout({ children }) {
  return <div className="app-shell"><header className="topbar"><div><div className="eyebrow">KLEENEST</div><div className="brand">Find a restroom. Get moving.</div></div></header><main>{children}</main><nav className="bottom-nav" aria-label="Primary navigation">{navItems.map(([to,label])=><NavLink key={to} to={to} end={to==='/' } className={({isActive})=>isActive?'nav-link active':'nav-link'}>{label}</NavLink>)}</nav></div>;
}

function Home() {
  const navigate=useNavigate();
  return <Layout><section className="hero panel"><div className="eyebrow">NEAREST-FIRST</div><h1>Find a bathroom without the detour.</h1><p>Kleenest starts with the fastest useful action: find nearby restroom options, choose one, and start navigation.</p><button className="primary" onClick={()=>navigate('/nearby')}>Find nearby restrooms</button></section><section className="panel compact"><h2>Simple by default</h2><p>Use Explore for one-stop discovery. Open Route when you actually need multiple ordered stops.</p></section></Layout>;
}

function Nearby() {
  const navigate=useNavigate(); const [status,setStatus]=useState('idle'); const [error,setError]=useState(''); const [places,setPlaces]=useState([]);
  const load=useCallback(()=>{ if(!navigator.geolocation){setError('Location is not available in this browser.');setStatus('error');return;} setStatus('loading');setError(''); navigator.geolocation.getCurrentPosition(async({coords})=>{try{setPlaces(await findNearbyRestrooms({latitude:coords.latitude,longitude:coords.longitude}));setStatus('ready');}catch(err){setError(err?.message||'Nearby restrooms could not be loaded.');setStatus('error');}},(geoError)=>{setError(geoError?.message||'Location permission is required to find nearby restrooms.');setStatus('error');},{enableHighAccuracy:true,timeout:12000,maximumAge:60000});},[]);
  return <Layout><section className="panel"><div className="eyebrow">EXPLORE</div><h1>Nearby restrooms</h1><p>Results come from Kleenest's canonical production map network.</p><button className="primary" onClick={load} disabled={status==='loading'}>{status==='loading'?'Finding nearby…':'Use my location'}</button>{status==='error'&&<div className="notice error">{error}</div>}{status==='ready'&&places.length===0&&<div className="notice">No nearby restrooms were returned. Try again from another location.</div>}</section><section className="results" aria-live="polite">{places.map((place)=>{const id=place.location_id||place.place_id;const miles=Number.isFinite(place.distance_meters)?`${(place.distance_meters/1609.344).toFixed(1)} mi`:null;return <article className="place-card" key={id||`${place.name}-${place.latitude}-${place.longitude}`}><div className="place-main"><h2>{place.name||'Restroom location'}</h2><p>{[place.address,place.city,place.state].filter(Boolean).join(', ')||'Address unavailable'}</p><div className="meta">{[miles,place.is_verified?'Verified':null,place.rating?`${place.rating} ★`:null].filter(Boolean).join(' · ')}</div></div><div className="card-actions"><button className="secondary" onClick={()=>navigate(`/location/${encodeURIComponent(id||'')}`)} disabled={!id}>Details</button><button className="primary" onClick={()=>navigate(`/route?add=${encodeURIComponent(id||'')}`)} disabled={!id}>Add to route</button></div></article>;})}</section></Layout>;
}

const WrappedLocation=()=> <Layout><LocationPage/></Layout>;
const WrappedRoute=()=> <Layout><RoutePage/></Layout>;
const WrappedSaved=()=> <Layout><SavedPage/></Layout>;
const WrappedProfile=()=> <Layout><ProfilePage/></Layout>;
function LegacyPlaceRedirect(){const {id}=useParams();return <Navigate to={`/location/${encodeURIComponent(id||'')}`} replace/>;}

export default function App(){return <Routes><Route path="/" element={<Home/>}/><Route path="/nearby" element={<Nearby/>}/><Route path="/map" element={<Navigate to="/nearby" replace/>}/><Route path="/discover" element={<Navigate to="/nearby" replace/>}/><Route path="/location/:id" element={<WrappedLocation/>}/><Route path="/place/:id" element={<LegacyPlaceRedirect/>}/><Route path="/route" element={<WrappedRoute/>}/><Route path="/saved" element={<WrappedSaved/>}/><Route path="/profile" element={<WrappedProfile/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>;}
