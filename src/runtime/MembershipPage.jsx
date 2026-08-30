import { useEffect, useState } from 'react';
import { createCheckout, formatPrice, listPricingCatalog, openBillingPortal } from '../services/commerce.js';
import { getAccountSummary } from '../services/account.js';

export default function MembershipPage(){
  const [plans,setPlans]=useState([]);const[summary,setSummary]=useState(null);const[status,setStatus]=useState('loading');const[message,setMessage]=useState('');
  useEffect(()=>{let active=true;Promise.all([listPricingCatalog(),getAccountSummary()]).then(([catalog,account])=>{if(!active)return;setPlans(catalog);setSummary(account);setStatus('ready');}).catch(err=>{if(active){setMessage(err?.message||'Membership options could not be loaded.');setStatus('error');}});return()=>{active=false;};},[]);
  const checkout=async code=>{setMessage('');try{setStatus('loading');const result=await createCheckout(code);window.location.assign(result.url);}catch(err){setStatus('ready');setMessage(err?.message||'Checkout could not be started.');}};
  const portal=async()=>{setMessage('');try{const url=await openBillingPortal();window.location.assign(url);}catch(err){setMessage(err?.message||'Billing portal could not be opened.');}};
  if(status==='loading'&&!plans.length)return <section className="panel"><div className="eyebrow">MEMBERSHIP</div><h1>Membership</h1><p>Loading plans…</p></section>;
  if(status==='error')return <section className="panel"><div className="eyebrow">MEMBERSHIP</div><h1>Membership</h1><div className="notice error">{message}</div></section>;
  const current=summary?.profile?.subscription_tier||'free';
  return <><section className="panel"><div className="eyebrow">MEMBERSHIP</div><h1>Choose what fits.</h1><p>Current consumer tier: <strong>{current}</strong>. Premium and Family are permanent one-time purchases; recurring business and Fleet services stay billing-backed.</p><div className="card-actions"><button className="secondary" onClick={portal}>Manage recurring billing</button></div>{message&&<div className="notice">{message}</div>}</section><section className="plan-grid">{plans.map(plan=>{const purchasable=Boolean(plan.price_cents>0&&['once','month'].includes(String(plan.interval)));return <article className="panel plan-card" key={plan.code}><div className="eyebrow">{String(plan.category||'PLAN').toUpperCase()}</div><h2>{plan.name}</h2><div className="plan-price">{formatPrice(plan)}</div><p>{plan.price_note||''}</p>{purchasable?<button className="primary" onClick={()=>checkout(plan.code)}>{plan.interval==='once'?'Buy once':'Subscribe'}</button>:plan.code==='free'?<button className="secondary" disabled>Included</button>:<button className="secondary" disabled>Contact Kleenest</button>}</article>;})}</section></>;
}
