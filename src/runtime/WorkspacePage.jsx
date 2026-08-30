import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWorkspaceContext } from '../services/workspaces.js';

const labels={consumer:'Consumer',business:'Business',fleet:'Fleet',enterprise:'Enterprise',platform:'Platform'};
export default function WorkspacePage(){
  const navigate=useNavigate();
  const[context,setContext]=useState(null);const[status,setStatus]=useState('loading');const[error,setError]=useState('');
  useEffect(()=>{let active=true;getWorkspaceContext().then(value=>{if(active){setContext(value);setStatus('ready');}}).catch(err=>{if(active){setError(err?.message||'Workspaces could not be loaded.');setStatus('error');}});return()=>{active=false;};},[]);
  if(status==='loading')return <section className="panel"><div className="eyebrow">WORKSPACES</div><h1>Workspaces</h1><p>Loading authorized workspaces…</p></section>;
  if(status==='error')return <section className="panel"><div className="eyebrow">WORKSPACES</div><h1>Workspaces</h1><div className="notice error">{error}</div></section>;
  const access=context?.access||{};
  const cards=[
    {key:'consumer',desc:'Explore restrooms, saved places, routes, activity, community, and membership.',to:'/'},
    {key:'business',desc:'Manage authorized business locations, access, and performance.',to:'/workspace/business'},
    {key:'fleet',desc:'Fleet operations and route intelligence.',to:'/workspace/fleet'},
    {key:'enterprise',desc:'Enterprise network and partner intelligence.',to:'/workspace/enterprise'},
    {key:'platform',desc:'Platform-owner and admin operations.',to:'/workspace/platform'},
  ].filter(item=>access[item.key]);
  return <><section className="panel"><div className="eyebrow">WORKSPACES</div><h1>Choose your workspace.</h1><p>Access is resolved from your production profile, product entitlements, and business memberships.</p></section><section className="plan-grid">{cards.map(item=><article className="panel plan-card" key={item.key}><div className="eyebrow">{labels[item.key].toUpperCase()}</div><h2>{labels[item.key]}</h2><p>{item.desc}</p><button className="primary" onClick={()=>navigate(item.to)}>Open workspace</button></article>)}</section>{context.businesses.length>0&&<section className="panel compact"><h2>Business memberships</h2>{context.businesses.map(row=><div className="stop-row" key={row.id||`${row.business_id}-${row.user_id}`}><span><strong>{row.business_name||row.name||'Business'}</strong><small>{[row.role,row.business_tier].filter(Boolean).join(' · ')}</small></span><button className="secondary" onClick={()=>navigate(`/workspace/business?business=${encodeURIComponent(row.business_id)}`)}>Open</button></div>)}</section>}</>;
}
