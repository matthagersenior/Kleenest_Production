import { useEffect, useMemo, useState } from 'react';
import { getLocations } from '../services/locations.js';

export default function RoutePage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const seededStop = params.get('add');
  const [start, setStart] = useState('My Location');
  const [stops, setStops] = useState(seededStop ? [{ id: seededStop, label: 'Loading stop…' }] : []);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const ids = stops.filter((stop) => stop.id).map((stop) => stop.id);
    if (!ids.length) return;
    let active = true;
    getLocations(ids).then((rows) => {
      if (!active) return;
      const byId = new Map(rows.map((row) => [row.id, row]));
      setStops((current) => current.map((stop) => {
        if (!stop.id) return stop;
        const row = byId.get(stop.id);
        return row ? { ...stop, label: row.name || 'Restroom location', location: row } : { ...stop, label: 'Location unavailable' };
      }));
    }).catch(() => {
      if (active) setStops((current) => current.map((stop) => stop.id ? { ...stop, label: 'Location unavailable' } : stop));
    });
    return () => { active = false; };
  }, [seededStop]);

  const addStop = () => {
    const value = draft.trim();
    if (!value) return;
    setStops((current) => [...current, { id: null, label: value }]);
    setDraft('');
  };

  const move = (index, offset) => {
    const target = index + offset;
    if (target < 0 || target >= stops.length) return;
    setStops((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return (
    <>
      <section className="panel">
        <div className="eyebrow">ROUTE</div>
        <h1>Starting location + ordered stops</h1>
        <label>Starting location<input value={start} onChange={(event) => setStart(event.target.value)} placeholder="My Location or enter a starting place" /></label>
        <div className="inline-form">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a stop" />
          <button className="primary" onClick={addStop}>Add stop</button>
        </div>
      </section>
      <section className="panel compact">
        {stops.length === 0 ? <p>No stops yet. Add places when you need a multi-stop route.</p> : stops.map((stop, index) => (
          <div className="stop-row" key={`${stop.id || stop.label}-${index}`}>
            <span><strong>{index + 1}.</strong> {stop.label}</span>
            <span className="stop-actions"><button onClick={() => move(index, -1)} disabled={index === 0}>↑</button><button onClick={() => move(index, 1)} disabled={index === stops.length - 1}>↓</button><button onClick={() => setStops((current) => current.filter((_, i) => i !== index))}>Remove</button></span>
          </div>
        ))}
      </section>
    </>
  );
}
