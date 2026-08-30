import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getLocation } from '../services/locations.js';
import { toggleFavorite } from '../services/favorites.js';

export default function LocationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [place, setPlace] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [favoriteMessage, setFavoriteMessage] = useState('');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    getLocation(id).then((row) => {
      if (!active) return;
      setPlace(row);
      setStatus('ready');
    }).catch((err) => {
      if (!active) return;
      setError(err?.message || 'Location could not be loaded.');
      setStatus('error');
    });
    return () => { active = false; };
  }, [id]);

  const save = async () => {
    setFavoriteMessage('');
    try {
      const result = await toggleFavorite(place.id);
      const isFavorite = Boolean(result?.is_favorite ?? result?.favorited ?? result?.favorite);
      setFavoriteMessage(isFavorite ? 'Saved.' : 'Removed from saved places.');
    } catch (err) {
      setFavoriteMessage(err?.message || 'Saved state could not be changed. Sign in and try again.');
    }
  };

  if (status === 'loading') return <section className="panel"><div className="eyebrow">LOCATION</div><h1>Loading…</h1></section>;
  if (status === 'error') return <section className="panel"><div className="eyebrow">LOCATION</div><h1>Could not load location</h1><div className="notice error">{error}</div></section>;
  if (!place) return <section className="panel"><div className="eyebrow">LOCATION</div><h1>Location not found</h1><p>This place is no longer available in the canonical location dataset.</p></section>;

  const address = [place.address, place.city, place.state, place.postal_code].filter(Boolean).join(', ');
  return (
    <section className="panel">
      <div className="eyebrow">LOCATION</div>
      <h1>{place.name || 'Restroom location'}</h1>
      <p>{address || 'Address unavailable'}</p>
      <div className="detail-grid">
        <div><span>Rating</span><strong>{place.rating ?? '—'}</strong></div>
        <div><span>Reviews</span><strong>{place.review_count ?? 0}</strong></div>
        <div><span>Cleanliness</span><strong>{place.cleanliness_pct != null ? `${place.cleanliness_pct}%` : '—'}</strong></div>
        <div><span>Accessible</span><strong>{place.accessible ? 'Yes' : 'Not confirmed'}</strong></div>
      </div>
      <div className="card-actions">
        <button className="secondary" onClick={save}>Save / Unsave</button>
        <button className="primary" onClick={() => navigate(`/route?add=${encodeURIComponent(place.id)}`)}>Add to route</button>
      </div>
      {favoriteMessage && <div className="notice">{favoriteMessage}</div>}
    </section>
  );
}
