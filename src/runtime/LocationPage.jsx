import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getLocation } from '../services/locations.js';
import { toggleFavorite } from '../services/favorites.js';
import { checkInAtLocation, createLocationReview, listLocationReviews, toggleReviewLike } from '../services/community.js';

export default function LocationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [place, setPlace] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [checkInId, setCheckInId] = useState(null);
  const [stars, setStars] = useState(5);
  const [cleanliness, setCleanliness] = useState('');
  const [comment, setComment] = useState('');

  const refreshReviews = async () => setReviews(await listLocationReviews(id));
  useEffect(() => { let active=true; Promise.all([getLocation(id),listLocationReviews(id)]).then(([row,reviewRows])=>{if(!active)return;setPlace(row);setReviews(reviewRows);setStatus('ready');}).catch((err)=>{if(active){setMessage(err?.message||'Location could not be loaded.');setStatus('error');}}); return()=>{active=false;}; }, [id]);

  const save=async()=>{setMessage('');try{const result=await toggleFavorite(place.id);const isFavorite=Boolean(result?.is_favorite??result?.favorited??result?.favorite);setMessage(isFavorite?'Saved.':'Removed from saved places.');}catch(err){setMessage(err?.message||'Saved state could not be changed. Sign in and try again.');}};
  const checkIn=()=>{setMessage('');if(!navigator.geolocation){setMessage('Location is required to check in.');return;}navigator.geolocation.getCurrentPosition(async({coords})=>{try{const result=await checkInAtLocation(place.id,coords.latitude,coords.longitude);setCheckInId(result?.check_in_id||result?.id||null);setMessage('Checked in. You can now leave a verified review.');}catch(err){setMessage(err?.message||'Check-in could not be completed.');}},(err)=>setMessage(err?.message||'Location permission is required to check in.'),{enableHighAccuracy:true,timeout:12000,maximumAge:30000});};
  const submitReview=async()=>{setMessage('');try{await createLocationReview({locationId:place.id,checkInId,stars,cleanlinessPct:cleanliness===''?null:cleanliness,comment});setComment('');setCleanliness('');await refreshReviews();setMessage('Review submitted.');}catch(err){setMessage(err?.message||'Review could not be submitted.');}};
  const like=async(reviewId)=>{try{await toggleReviewLike(reviewId);setMessage('Helpful vote updated.');}catch(err){setMessage(err?.message||'Helpful vote could not be updated.');}};

  if(status==='loading')return <section className="panel"><div className="eyebrow">LOCATION</div><h1>Loading…</h1></section>;
  if(status==='error')return <section className="panel"><div className="eyebrow">LOCATION</div><h1>Could not load location</h1><div className="notice error">{message}</div></section>;
  if(!place)return <section className="panel"><h1>Location not found</h1></section>;
  const address=[place.address,place.city,place.state,place.postal_code].filter(Boolean).join(', ');
  return <>
    <section className="panel"><div className="eyebrow">LOCATION</div><h1>{place.name||'Restroom location'}</h1><p>{address||'Address unavailable'}</p><div className="detail-grid"><div><span>Rating</span><strong>{place.rating??'—'}</strong></div><div><span>Reviews</span><strong>{place.review_count??0}</strong></div><div><span>Cleanliness</span><strong>{place.cleanliness_pct!=null?`${place.cleanliness_pct}%`:'—'}</strong></div><div><span>Accessible</span><strong>{place.accessible?'Yes':'Not confirmed'}</strong></div></div><div className="card-actions"><button className="secondary" onClick={save}>Save / Unsave</button><button className="secondary" onClick={checkIn}>Check in</button><button className="primary" onClick={()=>navigate(`/route?add=${encodeURIComponent(place.id)}`)}>Add to route</button></div>{message&&<div className="notice">{message}</div>}</section>
    <section className="panel"><div className="eyebrow">REVIEW</div><h2>Share what you found</h2><div className="review-form"><label>Stars<select value={stars} onChange={(e)=>setStars(e.target.value)}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label>Cleanliness %<input type="number" min="0" max="100" value={cleanliness} onChange={(e)=>setCleanliness(e.target.value)} placeholder="Optional"/></label><label>Comment<textarea value={comment} onChange={(e)=>setComment(e.target.value)} placeholder="What should the next person know?"/></label><button className="primary" onClick={submitReview}>Submit review</button></div></section>
    <section className="results"><div className="eyebrow">COMMUNITY REVIEWS</div>{reviews.length===0?<div className="panel compact"><p>No published reviews yet.</p></div>:reviews.map(review=><article className="place-card" key={review.id}><div className="place-main"><h2>{review.stars} ★</h2><p>{review.comment||'No written comment.'}</p><div className="meta">{[review.cleanliness_pct!=null?`${review.cleanliness_pct}% clean`:null,new Date(review.created_at).toLocaleDateString()].filter(Boolean).join(' · ')}</div>{review.business_reply&&<div className="notice"><strong>Business reply:</strong> {review.business_reply}</div>}</div><button className="secondary" onClick={()=>like(review.id)}>Helpful</button></article>)}</section>
  </>;
}
