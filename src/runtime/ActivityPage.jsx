import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listMyActivity } from '../services/activity.js';

export default function ActivityPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    listMyActivity().then((rows) => {
      if (!active) return;
      setEvents(rows);
      setStatus('ready');
    }).catch((err) => {
      if (!active) return;
      setError(err?.message || 'Activity could not be loaded.');
      setStatus('error');
    });
    return () => { active = false; };
  }, []);

  if (status === 'loading') return <section className="panel"><div className="eyebrow">ACTIVITY</div><h1>Your activity</h1><p>Loading recent activity…</p></section>;
  if (status === 'error') return <section className="panel"><div className="eyebrow">ACTIVITY</div><h1>Your activity</h1><div className="notice error">{error}</div></section>;

  return <><section className="panel"><div className="eyebrow">ACTIVITY</div><h1>Your activity</h1><p>Recent check-ins, reviews, and community events from your own account-scoped production data.</p></section><section className="results">{events.length === 0 ? <div className="notice">No activity yet.</div> : events.map((event) => <article className="place-card" key={event.id}><div className="place-main"><h2>{event.title}</h2><p>{event.location?.name || event.detail || 'Kleenest activity'}</p><div className="meta">{[event.detail, event.createdAt ? new Date(event.createdAt).toLocaleString() : null].filter(Boolean).join(' · ')}</div></div>{event.location?.id && <button className="secondary" onClick={() => navigate(`/location/${event.location.id}`)}>View place</button>}</article>)}</section></>;
}
