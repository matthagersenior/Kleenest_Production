import { getSupabase } from '../lib/supabase.js';

const canonicalBase=()=>String(import.meta.env.VITE_PUBLIC_APP_URL||`${window.location.origin}/Kleenest_Production`).replace(/\/+$/,'');

export async function listPricingCatalog(){
  const {data,error}=await getSupabase().from('pricing_catalog').select('code,name,category,price_cents,interval,price_note,active').eq('active',true).order('category').order('price_cents',{ascending:true,nullsFirst:false});
  if(error)throw error;
  return data||[];
}

export async function createCheckout(planCode){
  const base=canonicalBase();
  const successUrl=`${base}/?checkout=success&plan=${encodeURIComponent(planCode)}`;
  const cancelUrl=`${base}/?checkout=cancelled&plan=${encodeURIComponent(planCode)}`;
  const {data,error}=await getSupabase().functions.invoke('stripe-create-checkout',{body:{planCode,successUrl,cancelUrl}});
  if(error)throw error;
  if(!data?.url)throw new Error(data?.error||'Checkout did not return a Stripe URL.');
  return data;
}

export async function openBillingPortal(){
  const {data,error}=await getSupabase().functions.invoke('stripe-customer-portal',{body:{returnUrl:`${canonicalBase()}/`}});
  if(error)throw error;
  if(!data?.url)throw new Error(data?.error||'Billing portal did not return a URL.');
  return data.url;
}

export function formatPrice(plan){
  if(plan?.price_note)return plan.price_note;
  if(plan?.price_cents==null)return 'Contact';
  if(plan.price_cents===0)return 'Free';
  const amount=(Number(plan.price_cents)/100).toLocaleString(undefined,{style:'currency',currency:'USD'});
  return plan.interval==='month'?`${amount}/month`:plan.interval==='once'?`${amount} one-time`:amount;
}
