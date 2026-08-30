import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLocations } from '../services/locations.js';
import { buildRoute, navigationUrl, persistRoute } from '../services/routing.js';

const OSM_RASTER='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const STORAGE_KEY='kleenest.routeStops';
const readStored=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]').filter(Boolean).map(String);}catch{return [];}};

function RoutePreview({route}){
  const host=useRef(null),mapRef=useRef(null);
  useEffect(()=>{if(!host.current||!route?.geometry)return;const map=new maplibregl.Map({container:host.current,style:{version:8,sources:{osm:{type:'raster',tiles:[OSM_RASTER],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]},center:route.originCoordinates,zoom:12,renderWorldCopies:false,dragRotate:false,touchPitch:false});map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-left');map.on('load',()=>{map.addSource('route',{type:'geojson',data:{type:'Feature',properties:{},geometry:route.geometry}});map.addLayer({id:'route-line',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#173d2b','line-width':6,'line-opacity':.9}});const coords=route.geometry.coordinates||[];if(coords.length){const bounds=new maplibregl.LngLatBounds(coords[0],coords[0]);coords.slice(1).forEach(point=>bounds.extend(point));map.fitBounds(bounds,{padding:48,maxZoom:16,duration:0});}new maplibregl.Marker().setLngLat(route.originCoordinates).addTo(map);route.stopCoordinates.forEach((point,index)=>{const el=document.createElement('div');el.className='route-stop-marker';el.textContent=String(index+1);new maplibregl.Marker({element:el}).setLngLat(point).addTo(map);});});mapRef.current=map;return()=>{map.remove();mapRef.current=null;};},[route]);
  return <div className="map-frame"><div ref={host} className="route-map map-canvas" aria-label="Route preview"/></div>;
}

export default function RoutePage() {
  const navigate=useNavigate();
  const params=useMemo(()=>new URLSearchParams(window.location.search),[]);
  const seededStop=params.get('add');
  const [start,setStart]=useState('My Location');
  const [stopIds,setStopIds]=useState(()=>{const ids=readStored();if(seededStop&&!ids.includes(seededStop))ids.push(seededStop);return ids;});
  const [stops,setStops]=useState([]);
  const [route,setRoute]=useState(null);
  const [status,setStatus]=useState('idle');
  const [message,setMessage]=useState('');

  useEffect(()=>{localStorage.setItem(STORAGE_KEY,JSON.stringify(stopIds));let active=true;getLocations(stopIds).then(rows=>{if(active){const byId=new Map(rows.map(row=>[String(row.id),row]));setStops(stopIds.map(id=>byId.get(String(id))).filter(Boolean));}}).catch(err=>active&&setMessage(err?.message||'Stops could not be loaded.'));return()=>{active=false;};},[stopIds.join('|')]);

  const move=(index,offset)=>{const target=index+offset;if(target<0||target>=stopIds.length)return;setStopIds(current=>{const next=[...current];[next[index],next[target]]=[next[target],next[index]];return next;});setRoute(null);};
  const remove=(id)=>{setStopIds(current=>current.filter(value=>value!==id));setRoute(null);};
  const resolveOrigin=async()=>{if(start.trim().toLowerCase()!=='my location')return start.trim();if(!navigator.geolocation)throw new Error('Location is unavailable in this browser.');return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(({coords})=>resolve(`${coords.latitude},${coords.longitude}`),err=>reject(new Error(err?.message||'Location permission is required.')),{enableHighAccuracy:true,timeout:12000,maximumAge:30000}));};
  const build=async()=>{setStatus('loading');setMessage('');try{const origin=await resolveOrigin();const next=await buildRoute({origin,stopLocationIds:stopIds});setRoute(next);setStatus('ready');}catch(err){setMessage(err?.message||'Route could not be built.');setStatus('error');}};
  const save=async()=>{if(!route)return;setStatus('loading');setMessage('');try{const saved=await persistRoute(route);setRoute(saved);setStatus('ready');setMessage('Route saved.');}catch(err){setStatus('error');setMessage(err?.message||'Route could not be saved.');}};
  const launch=()=>{const href=navigationUrl(route);if(href)window.open(href,'_blank','noopener,noreferrer');};

  return <>
    <section className="panel"><div className="eyebrow">ROUTE</div><h1>Starting location + ordered stops</h1><label>Starting location<input value={start} onChange={event=>{setStart(event.target.value);setRoute(null);}} placeholder="My Location or enter a starting place"/></label><div className="card-actions route-actions"><button className="secondary" onClick={()=>navigate('/nearby')}>Add stops from Explore</button><button className="primary" onClick={build} disabled={!stopIds.length||status==='loading'}>{status==='loading'?'Building…':'Build route'}</button></div>{message&&<div className={status==='error'?'notice error':'notice'}>{message}</div>}</section>
    <section className="panel compact"><h2>Stops</h2>{stops.length===0?<p>No stops yet. Add locations from Explore.</p>:stops.map((stop,index)=><div className="stop-row" key={stop.id}><span><strong>{index+1}.</strong> {stop.name||'Restroom location'}<small>{[stop.city,stop.state].filter(Boolean).join(', ')}</small></span><span className="stop-actions"><button onClick={()=>move(index,-1)} disabled={index===0}>↑</button><button onClick={()=>move(index,1)} disabled={index===stops.length-1}>↓</button><button onClick={()=>remove(String(stop.id))}>Remove</button></span></div>)}</section>
    {route&&<><section className="panel compact route-summary"><div><div className="eyebrow">ROUTE READY</div><h2>{route.distanceMiles} mi · {route.durationMinutes} min</h2><p>{route.stopLocationIds.length} ordered stop{route.stopLocationIds.length===1?'':'s'} · {route.provider.toUpperCase()}</p></div><div className="card-actions"><button className="secondary" onClick={save} disabled={Boolean(route.routeId)||status==='loading'}>{route.routeId?'Saved':'Save route'}</button><button className="primary" onClick={launch}>Start navigation</button></div></section><RoutePreview route={route}/></>}
  </>;
}
