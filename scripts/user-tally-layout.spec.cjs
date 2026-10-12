const {test,expect}=require('@playwright/test');
const fs=require('node:fs');const path=require('node:path');
test.use({screenshot:'only-on-failure',trace:'retain-on-failure'});
const ROOT=path.resolve(process.env.OWNER_EXPORT_DIR||'apps/platform-mobile/dist');
const CONSUMER=path.resolve('apps/consumer-mobile/dist');
const uid='00000000-0000-4000-8000-000000000001';
const tally={updated_at:'2026-10-12T20:00:00Z',tracking_since:'2026-10-12T19:00:00Z',current_accounts:24,total_signups_recorded:24,deleted_accounts_recorded:0,pending_deletion_requests:1,active_24h:1,active_7d:2,active_30d:5,guest_sessions_24h:3,guest_sessions_7d:4,guest_sessions_30d:6,signups_today:0,deletions_today:0,signups_7d:0,deletions_7d:0,signups_30d:24,deletions_30d:0};
async function setup(page,root,{failed=false}={}){
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('http://kleenest.test/**',async route=>{
  let pathname=new URL(route.request().url()).pathname.replace(/^\/Kleenest_Production(?:\/owner)?/,'');
  if(!path.extname(pathname))pathname='/index.html';
  const file=path.join(root,pathname);
  if(!fs.existsSync(file))return route.abort();
  await route.fulfill({path:file,contentType:pathname.endsWith('.js')?'application/javascript':pathname.endsWith('.html')?'text/html':undefined});
 });
 await page.addInitScript(uid=>{
  const enc=o=>btoa(JSON.stringify(o)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})+'.test';
  localStorage.setItem('sb-ssgesjzdvdsqacdtasje-auth-token',JSON.stringify({access_token:token,refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:uid,email:'test@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}}));
  localStorage.setItem('kleenest.consumer.web-app-session.v1','1');
 },uid);
 await page.route('https://ssgesjzdvdsqacdtasje.supabase.co/**',async route=>{
  const url=route.request().url();let data=[];
  if(url.includes('/auth/v1/user'))data={id:uid,email:'test@example.invalid',app_metadata:{},user_metadata:{}};
  if(url.includes('admin_authorization_v1'))data={authorized:true,is_platform_owner:true,is_admin:true};
  if(url.includes('has_current_policy_acceptance'))data=true;
  if(url.includes('owner_progression_platform_snapshot'))data={discoveries:0,on_site_discoveries:0,xp_awarded:0,xp_last_24h:0,active_objectives:0};
  if(url.includes('admin_notification_native_push_delivery_health'))data={active_tokens:9,failed:0,expired:0};
  if(url.includes('owner_user_tally_snapshot'))data=tally;
  if(failed && ['owner_user_tally_snapshot','owner_progression_platform_snapshot','admin_get_overview','admin_list_pending_businesses'].some(name=>url.includes(name)))return route.fulfill({status:503,json:{message:'Fixture subsystem unavailable'}});
  await route.fulfill({json:data});
 });
 return errors;
}
for(const width of [320,360]){
 test(`owner tally wraps at ${width}px and survives refresh`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:800});const errors=await setup(page,ROOT);
  await page.goto('http://kleenest.test/');
  await expect(page.getByText('People & Growth',{exact:true})).toBeVisible();
  await expect(page.getByText('Current accounts',{exact:true})).toBeVisible();
  await expect(page.getByText('24',{exact:true}).first()).toBeVisible();
  const overflow=await page.getByText('Registered accounts that still exist',{exact:true}).evaluate(el=>{const box=el.getBoundingClientRect(),parent=el.parentElement.getBoundingClientRect();return box.left<parent.left||box.right>parent.right});
  expect(overflow).toBe(false);
  const overflowText=await page.evaluate(()=>[...document.querySelectorAll('div[dir="auto"]')].filter(el=>{
    if(el.closest('[role="tablist"]'))return false;
    const r=el.getBoundingClientRect();return r.width>0&&(r.left < -1 || r.right > innerWidth+1);
  }).map(el=>el.textContent));
  expect(overflowText).toEqual([]);
  await page.getByRole('button',{name:/Refresh user tally/}).click();
  await expect(page.getByText('24',{exact:true}).first()).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('owner-tally.png')});
  expect(errors).toEqual([]);
 });
 if(!process.env.DASHBOARD_ONLY)test(`filter text remains inside panel at ${width}px with enlarged text`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:800});const errors=await setup(page,CONSUMER);
  await page.goto('http://kleenest.test/Kleenest_Production/explore?app=1');
  const filter=page.getByRole('button',{name:'Filter places',exact:true});
  await expect(filter).toBeVisible();
  console.log('FILTER_READY',JSON.stringify({errors,hit:await filter.evaluate(el=>{
    const r=el.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {bounds:{x:r.x,y:r.y,width:r.width,height:r.height},top:top?.outerHTML.slice(0,2000)};
  })}));
  await page.screenshot({path:testInfo.outputPath('before-filter.png')});
  expect(errors).toEqual([]);
  await filter.click();
  await expect(page.getByRole('button',{name:'Show filtered results',exact:true})).toBeVisible();
  await page.evaluate(()=>{
    const title=[...document.querySelectorAll('div[dir="auto"]')].find(el=>el.textContent==='Filter places');
    const panel=title.parentElement.parentElement.parentElement;
    const texts=[...panel.querySelectorAll('div[dir="auto"]')];
    const sizes=texts.map(el=>({el,font:parseFloat(getComputedStyle(el).fontSize),line:parseFloat(getComputedStyle(el).lineHeight)}));
    for(const {el,font,line} of sizes){el.style.fontSize=font*1.5+'px';if(Number.isFinite(line))el.style.lineHeight=line*1.5+'px'}
  });
  const done=page.getByRole('button',{name:'Show filtered results',exact:true});await expect(done).toBeVisible();
  const overflow=await page.getByText('Keep looking for what I need',{exact:true}).evaluate(el=>{
    let panel=el;while(panel&&!panel.querySelector('[aria-label="Show filtered results"]'))panel=panel.parentElement;
    const box=panel.getBoundingClientRect();
    return [...panel.querySelectorAll('div[dir="auto"]')].filter(e=>['Keep looking for what I need','Search farther when needed','Default is Everything. Narrow the map only when you want a specific kind of stop.'].includes(e.textContent)).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left<box.left-1||r.right>box.right+1)}).map(e=>e.textContent);
  });expect(overflow).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('filter-large-text.png')});expect(errors).toEqual([]);
 });
}
test('failed dashboard requests show Unavailable instead of zero or an all-clear claim',async({page})=>{
 await page.setViewportSize({width:360,height:800});await setup(page,ROOT,{failed:true});
 await page.goto('http://kleenest.test/');
 await expect(page.getByText('Some checks are unavailable',{exact:true})).toBeVisible();
 await expect(page.getByText('Unavailable',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('No active owner actions',{exact:true})).toHaveCount(0);
});
