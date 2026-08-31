import { useEffect,useState } from 'react';
import { getBusinessRestroomPreventiveWorkOrders } from '../services/remediation.js';

function when(value){if(!value)return'—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString()}

export default function BusinessPreventiveDispatchHandoffPanel({businessId}){
 const[data,setData]=useState(null);const[error,setError]=useState('');
 useEffect(()=>{let active=true;(async()=>{try{const next=await getBusinessRestroomPreventiveWorkOrders(businessId,90);if(active)setData(next||{})}catch(e){if(active)setError(e?.message||'Fleet handoff status could not be loaded.')}})();return()=>{active=false}},[businessId]);
 const rows=Array.isArray(data?.work_orders)?data.work_orders:[];
 const routed=rows.filter(row=>row.fleet_route_stop_id);
 const activeRouted=routed.filter(row=>['planned','assigned','in_progress'].includes(row.status));
 if(error)return <section className="panel compact"><div className="eyebrow">FLEET HANDOFF</div><div className="notice error">{error}</div></section>;
 return <section className="panel compact"><div className="eyebrow">FLEET HANDOFF</div><h2>See preventive work already placed on Fleet routes</h2><p>Dispatch state comes directly from canonical Fleet route stops whose metadata points back to the preventive work order. The work order remains the maintenance authority.</p><div className="detail-grid"><div><span>Routed preventive work</span><strong>{routed.length}</strong></div><div><span>Active routed work</span><strong>{activeRouted.length}</strong></div></div>{activeRouted.length?<div className="results">{activeRouted.map(row=><article className="place-card" key={`handoff:${row.id}`}><div className="place-main"><div className="eyebrow">ROUTED · {String(row.fleet_route_status||'planned').toUpperCase()} · STOP {row.fleet_stop_order??'—'}</div><h3>{row.location_name||'Restroom'} · {row.amenity_name||'Amenity'}</h3><div className="meta">{row.fleet_route_name||'Fleet route'} · Scheduled {when(row.fleet_scheduled_for)} · Stop {String(row.fleet_stop_status||'planned').replaceAll('_',' ')}</div><p>This route stop is dispatch linkage only. Maintenance completion, proof, and independent verification continue on the preventive work order.</p></div></article>)}</div>:<div className="notice">No active preventive work is currently attached to a Fleet route.</div>}</section>;
}
