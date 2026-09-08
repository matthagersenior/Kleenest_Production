import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { findNearbyRestrooms } from '../services/nearby.js';
import { directNavigationUrl } from '../services/routing.js';

const DEFAULT_CENTER = [38.627, -90.199];
const OSM_RASTER = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const RADII = [1609, 3219, 8047, 16093, 40234];
const miles = place => place.distance_meters == null ? null : `${(Number(place.distance_meters) / 1609.344).toFixed(1)} mi`;
const signals = place => [miles(place), place.cleanliness_pct != null ? `${Math.round(Number(place.cleanliness_pct))}% clean` : null, place.rating != null ? `${Number(place.rating).toFixed(1)} ★${place.review_count ? ` · ${place.review_count} reviews` : ''}` : null, place.is_verified ? 'Verified' : null, place.brand || null].filter(Boolean);

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
  const hostRef = useRef(null), mapRef = useRef(null), markersRef = useRef([]), requestRef = useRef(0), autoLocatedRef = useRef(false);
  const [center, setCenter] = useState(DEFAULT_CENTER), [places, setPlaces] = useState([]), [selectedId, setSelectedId] = useState(null), [search, setSearch] = useState(''), [radiusMeters, setRadiusMeters] = useState(8047), [status, setStatus] = useState('idle'), [error, setError] = useState('');
  const selected = useMemo(() => places.find((place) => (place.location_id || place.place_id) === selectedId) || null, [places, selectedId]);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: hostRef.current, style: { version: 8, sources: { osm: { type: 'raster', tiles: [OSM_RASTER], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] }, center: [center[1], center[0]], zoom: 12, attributionControl: true, renderWorldCopies: false, dragRotate: false, touchPitch: false });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left'); mapRef.current = map;
    const resize = () => map.resize(); window.addEventListener('resize', resize, { passive: true });
    return () => { window.removeEventListener('resize', resize); markersRef.current.forEach((marker) => marker.remove()); markersRef.current = []; map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current; if (!map) return; markersRef.current.forEach((marker) => marker.remove()); markersRef.current = []; const points = [];
    for (const place of places) { const lat = Number(place.latitude), lng = Number(place.longitude); if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue; const id = place.location_id || place.place_id; const el = markerElement(place, id === selectedId); el.addEventListener('click', () => setSelectedId(id)); const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map); markersRef.current.push(marker); points.push([lng, lat]); }
    if (selected) { map.easeTo({ center: [Number(selected.longitude), Number(selected.latitude)], duration: 350 }); return; }
    if (points.length === 1) map.easeTo({ center: points[0], zoom: Math.max(map.getZoom(), 13), duration: 350 });
    else if (points.length > 1) { const bounds = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0])); map.fitBounds(bounds, { padding: 42, maxZoom: 15, duration: 450 }); }
  }, [places, selectedId, selected]);

  const load = async ({ position = center, radius = radiusMeters, query = search } = {}) => {
    const requestId = ++requestRef.current; setStatus('loading'); setError('');
    try {
      const rows = await findNearbyRestrooms({ latitude: position[0], longitude: position[1], radiusMeters: radius, limit: 100 });
      if (requestId !== requestRef.current) return;
      const needle = query.trim().toLowerCase(); const filtered = needle ? rows.filter((place) => `${place.name || ''} ${place.brand || ''} ${place.address || ''}`.toLowerCase().includes(needle)) : rows;
      setPlaces(filtered); setSelectedId(null); setStatus('ready');
    } catch (err) { if (requestId !== requestRef.current) return; setPlaces([]); setStatus('error'); setError(err?.message || 'Unable to load nearby restrooms.'); }
  };

  useEffect(() => { if (autoLocatedRef.current) return; autoLocatedRef.current = true; if (!navigator.geolocation) { load(); return; } navigator.geolocation.getCurrentPosition((position) => { const next = [position.coords.latitude, position.coords.longitude]; setCenter(next); load({ position: next }); }, () => load(), { enableHighAccuracy: false, maximumAge: 120000, timeout: 5000 }); }, []);

  const locate = () => { if (!navigator.geolocation) return; setStatus('locating'); navigator.geolocation.getCurrentPosition((position) => { const next = [position.coords.latitude, position.coords.longitude]; setCenter(next); mapRef.current?.easeTo({ center: [next[1], next[0]], zoom: 14 }); load({ position: next }); }, () => { setStatus('error'); setError('Location permission was unavailable.'); }, { enableHighAccuracy: true, timeout: 8000 }); };

  return <main className="explore-page">
    <section className="explore-hero"><div><span className="eyebrow">Explore</span><h1>Find a restroom you can trust.</h1><p>Search nearby locations, compare confidence signals, and open the full location record when you need more detail.</p></div></section>
    <section className="explore-controls" aria-label="Explore controls">
      <label><span>Search places</span><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load({ query: e.currentTarget.value })} placeholder="Business, brand, or address" /></label>
      <label><span>Radius</span><select value={radiusMeters} onChange={(e) => { const radius = Number(e.target.value); setRadiusMeters(radius); load({ radius }); }}>{RADII.map((radius) => <option key={radius} value={radius}>{Math.round(radius / 1609.344)} mi</option>)}</select></label>
      <button type="button" onClick={() => load()} disabled={status === 'loading'}>{status === 'loading' ? 'Searching…' : 'Search'}</button>
      <button type="button" className="secondary" onClick={locate}>Use my location</button>
    </section>
    {error ? <div className="explore-alert" role="alert">{error}</div> : null}
    <section className="explore-map-shell" aria-label="Restroom map"><div ref={hostRef} className="explore-map" /><div className="map-legend"><strong>Map</strong><span>Pin letter = business or brand</span><span>Selected pins highlight</span></div>{selected ? <article className="map-selection"><button type="button" className="map-selection-close" onClick={() => setSelectedId(null)} aria-label="Close selected location">×</button><strong>{selected.name}</strong><span>{signals(selected).join(' · ')}</span><div><button type="button" onClick={() => navigate(`/locations/${selected.location_id || selected.place_id}`)}>Full details</button><a href={directNavigationUrl(selected)} target="_blank" rel="noreferrer">Directions</a></div></article> : null}</section>
    <section className="explore-results"><div className="explore-results-heading"><div><span className="eyebrow">Nearby</span><h2>{status === 'loading' ? 'Searching…' : `${places.length} result${places.length === 1 ? '' : 's'}`}</h2></div></div><div className="explore-result-list">{places.map((place) => { const id = place.location_id || place.place_id; return <article className={id === selectedId ? 'explore-result selected' : 'explore-result'} key={id}><button type="button" className="explore-result-main" onClick={() => setSelectedId(id)}><span className="explore-result-brand">{(place.brand || place.name || 'K').slice(0, 1).toUpperCase()}</span><span><strong>{place.name}</strong><small>{place.address || 'Address unavailable'}</small><em>{signals(place).join(' · ')}</em></span></button><div className="explore-result-actions"><button type="button" onClick={() => navigate(`/locations/${id}`)}>Full details</button><a href={directNavigationUrl(place)} target="_blank" rel="noreferrer">Directions</a></div></article>;})}{status !== 'loading' && places.length === 0 ? <div className="explore-empty">No matching locations in this radius yet. Try a wider radius or remove the text filter.</div> : null}</div></section>
  </main>;
}
