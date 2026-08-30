import fs from 'node:fs';
const read=file=>fs.readFileSync(file,'utf8');
const app=read('src/runtime/App.jsx');
const profile=read('src/runtime/ProfilePage.jsx');
const page=read('src/runtime/MembershipPage.jsx');
const commerce=read('src/services/commerce.js');
const failures=[];
const checks=[
  [app.includes('path="/membership"'),'Membership must be attached to the canonical runtime'],
  [profile.includes("navigate('/membership')"),'Profile must route to membership and billing'],
  [page.includes('listPricingCatalog')&&page.includes('createCheckout'),'Membership surface must consume canonical catalog and checkout service'],
  [commerce.includes("from('pricing_catalog')"),'Commerce must read pricing_catalog authority'],
  [commerce.includes("functions.invoke('stripe-create-checkout'"),'Checkout must use production Stripe Edge Function'],
  [commerce.includes("functions.invoke('stripe-customer-portal'"),'Billing management must use production Stripe portal function'],
  [commerce.includes('successUrl')&&commerce.includes('cancelUrl')&&commerce.includes('returnUrl'),'Client must override all Stripe redirect URLs'],
  [commerce.includes('VITE_PUBLIC_APP_URL'),'Commerce redirects must use the public app URL contract'],
  [!commerce.includes('Kleenest_Architecture'),'Commerce must never redirect to the legacy architecture repo'],
  [commerce.includes("plan.interval==='once'"),'One-time memberships must remain one-time in the UI'],
];
for(const[ok,message]of checks)if(!ok)failures.push(message);
if(failures.length){console.error('Commerce authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}console.log('Commerce authority audit passed.');
