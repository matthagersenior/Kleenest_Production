import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { findNearbyRestrooms } from '../services/nearby.js';

const DEFAULT_CENTER = [38.627, -90.199];
const OSM_RASTER = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const RADII = [1609, 3219, 8047, 16093, 40234];

function markerElement(place, selected) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = selected ? 'map-pin selected' : 'map-pin';
  el.setAttribute('aria-label', place.name || 'Restroom location');
  const label = (place.brand || place.name || 'K').trim().slice(0, 1).toUpperCase();
  el.textContent = label || 'K';
  return el;
}

export default function ExplorePage() {
  const navigate = useNavigate();
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [places, setPlaces] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [radiusMeters, setRadiusMeters] = useState(8047);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const selected = useMemo(() => places.find((place) => (place.location_id || place.place_id) === selectedId) || null, [places, selectedId]);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: hostRef.current,
      style: { version: 8, sources: { osm: { type: 'raster', tiles: [OSM_RASTER], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] },
      center: [center[1], center[0]],
      zoom: 12,
      attributionControl: true,
      renderWorldCopies: false,
      dragRotate: false,
      touchPitch: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    mapRef.current = map;
    const resize = () => map.resize();
    window.addEventListener('resize', resize, { passive: true });
    return () => {
      window.removeEventListener('resize', resize);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    const points = [];
    for (const place of places) {
      const lat = Number(place.latitude), lng = Number(place.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const id = place.location_id || place.place_id;
      const el = markerElement(place, id === selectedId);
      el.addEventListener('click', () => setSelectedId(id));
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);
      markersRef.current.push(marker);
      points.push([lng, lat]);
    }
    if (selected && Number.isFinite(Number(selected.latitude)) && Number.isFinite(Number(selected.longitude))) {
      map.easeTo({ center: [Number(selected.longitude), Number(selected.latitude)], zoom: Math.max(map.getZoom(), 15), duration: 250 });
    } else if (points.length > 1) {
      const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
      points.slice(1).forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, { padding: 42, maxZoom: 15, duration: 300 });
    } else if (points.length === 1) {
      map.easeTo({ center: points[0], zoom: 15, duration: 250 });
    }
  }, [places, selectedId, selected]);

  async function load(coords = center) {
    setStatus('loading');
    setError('');
    try {
      const rows = await findNearbyRestrooms({ latitude: coords[0], longitude: coords[1], radiusMeters, search, limit: 200 });
      setPlaces(rows);
      setCenter(coords);
      setSelectedId(null);
      setStatus('ready');
      mapRef.current?.easeTo({ center: [coords[1], coords[0]], duration: 250 });
    } catch (err) {
      setError(err?.message || 'Nearby restrooms could not be loaded.');
      setStatus('error');
    }
  }

  function locate() {
    if (!navigator.geolocation) return void load(center);
    setStatus('loading');
    navigator.geolocation.getCurrentPosition(({ coords }) => void load([coords.latitude, coords.longitude]), (err) => {
      setError(err?.message || 'Location permission is required to find nearby restrooms.');
      setStatus('error');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  return <>
    <section className="panel map-controls"><div><div className="eyebrow">EXPLORE</div><h1>Nearby restrooms</h1><p>One canonical MapLibre discovery surface backed by the production map network.</p></div><div className="map-search-row"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load()} placeholder="Search places or brands"/><select value={radiusMeters} onChange={(event) => setRadiusMeters(Number(event.target.value))}>{RADII.map((meters) => <option value={meters} key={meters}>{Math.round(meters / 1609.344)} mi</option>)}</select></div><div className="card-actions"><button className="primary" onClick={locate} disabled={status === 'loading'}>{status === 'loading' ? 'Finding…' : 'Use my location'}</button><button className="secondary" onClick={() => load()} disabled={status === 'loading'}>Refresh</button></div>{error && <div className="notice error">{error}</div>}</section>
    <section className="map-frame"><div ref={hostRef} className="map-canvas" aria-label="Kleenest restroom map"/></section>
    {selected && <section className="panel compact map-selection"><div><div className="eyebrow">SELECTED PLACE</div><h2>{selected.name || 'Restroom location'}</h2><p>{[selected.address, selected.city, selected.state].filter(Boolean).join(', ') || 'Address unavailable'}</p><div className="meta">{[selected.distance_meters != null ? `${(Number(selected.distance_meters)/1609.344).toFixed(1)} mi` : null, selected.is_verified ? 'Verified' : null, selected.rating ? `${selected.rating} ★` : null].filter(Boolean).join(' · ')}</div></div><div className="card-actions"><button className="secondary" onClick={() => navigate(`/location/${selected.location_id || selected.place_id}`)}>Details</button><button className="primary" onClick={() => navigate(`/route?add=${selected.location_id || selected.place_id}`)}>Add to route</button></div></section>}
    <section className="results">{status === 'ready' && places.length === 0 ? <div className="notice">No nearby restrooms were returned.</div> : places.map((place) => { const id = place.location_id || place.place_id; return <article className={id === selectedId ? 'place-card selected-card' : 'place-card'} key={id || `${place.name}-${place.latitude}-${place.longitude}`} onClick={() => setSelectedId(id)}><div className="place-main"><h2>{place.name || 'Restroom location'}</h2><p>{[place.address, place.city, place.state].filter(Boolean).join(', ') || 'Address unavailable'}</p><div className="meta">{[place.distance_meters != null ? `${(Number(place.distance_meters)/1609.344).toFixed(1)} mi` : null, place.is_verified ? 'Verified' : null].filter(Boolean).join(' · ')}</div></div></article>; })}</section>
  </>;
}
