import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE=process.env.CONSUMER_WEB_BASE||'http://127.0.0.1:4174/Kleenest_Production/';
const OUTPUT=process.env.CONSUMER_STRESS_OUT||'test-results/consumer-stress';
const SPARTA={latitude:38.1231,longitude:-89.7018};
const RESIDENTIAL_ADDRESS='705 S Saint Louis St, Sparta, IL 62286';

type Observation={
  stage:string;
  url:string;
  resultCardCount:number;
  horizontalOverflowPx:number;
  textExcerpt:string;
  resultLabels:string[];
  requestFailures?:string[];
  badResponses?:string[];
  pageErrors?:string[];
  extra?:Record<string,unknown>;
};

function clean(value:string){
  return value.replace(/\s+/g,' ').trim();
}

async function readySearch(page:Page,timeout=45000){
  await page.getByRole('button',{name:'SEARCH',exact:true}).first().waitFor({state:'visible',timeout});
}

async function search(page:Page,query:string,timeout=45000){
  const box=page.locator('input[aria-label="Discover nearby places"], input[aria-label="Search places along route"]').first();
  await expect(box).toBeVisible({timeout:20000});
  await box.fill(query);
  await page.getByRole('button',{name:'SEARCH',exact:true}).first().click();
  // Give React Native Web one paint to flip SEARCH -> WORKING before waiting
  // for SEARCH to return. Without this, the assertion can race the state update
  // and sample the page while the live lookup is still running.
  await page.waitForTimeout(250);
  await readySearch(page,timeout);
  await page.waitForTimeout(500);
}

async function collect(page:Page,stage:string,network:{failed:string[];bad:string[];errors:string[]},extra:Record<string,unknown>={}):Promise<Observation>{
  const body=clean(await page.locator('body').innerText());
  const labels=await page.locator('[aria-label]').evaluateAll(nodes=>nodes
    .map(node=>String(node.getAttribute('aria-label')||'').trim())
    .filter(Boolean));
  const resultLabels=labels.filter(label=>/\b(?:mi|ft) away\b|\bmiles ahead\b|\bplaces in this map cluster\b/i.test(label)).slice(0,30);
  const metrics=await page.evaluate(()=>({
    innerWidth:window.innerWidth,
    scrollWidth:document.documentElement.scrollWidth,
  }));
  const observation:Observation={
    stage,
    url:page.url(),
    resultCardCount:await page.getByText('Full details',{exact:true}).count(),
    horizontalOverflowPx:Math.max(0,Number(metrics.scrollWidth)-Number(metrics.innerWidth)),
    textExcerpt:body.slice(0,2400),
    resultLabels,
    requestFailures:network.failed.slice(-20),
    badResponses:network.bad.slice(-20),
    pageErrors:network.errors.slice(-20),
    extra,
  };
  console.log('CONSUMER_STRESS',JSON.stringify(observation));
  return observation;
}

function watch(page:Page){
  const failed:string[]=[];
  const bad:string[]=[];
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.stack||error.message));
  page.on('requestfailed',request=>{
    const url=request.url();
    if(/googlesyndication|doubleclick|google-analytics|fonts\.googleapis/i.test(url))return;
    failed.push(`${request.method()} ${url} :: ${request.failure()?.errorText||'failed'}`);
  });
  page.on('response',response=>{
    const url=response.url();
    if(response.status()>=400&&!/googlesyndication|doubleclick|google-analytics/i.test(url))bad.push(`${response.status()} ${url}`);
  });
  return{failed,bad,errors};
}

async function newConsumerPage(context:BrowserContext){
  const page=await context.newPage();
  const network=watch(page);
  const response=await page.goto(new URL('?app=1',BASE).toString(),{waitUntil:'domcontentloaded',timeout:30000});
  expect(response?.status()).toBe(200);
  await page.getByText('Find a place you can count on.',{exact:true}).waitFor({state:'visible',timeout:20000});
  await readySearch(page,45000);
  return{page,network};
}

test('Consumer production-equivalent real-world stress test',async({browser})=>{
  test.setTimeout(240000);
  fs.mkdirSync(OUTPUT,{recursive:true});
  const context=await browser.newContext({
    viewport:{width:412,height:915},
    geolocation:SPARTA,
    permissions:['geolocation'],
    locale:'en-US',
    colorScheme:'light',
  });
  const observations:Observation[]=[];
  const failures:string[]=[];

  // 1. First-time guest launch from Sparta.
  const launch=await newConsumerPage(context);
  observations.push(await collect(launch.page,'sparta_guest_launch',launch.network,{
    hasCurrentLocationMarker:await launch.page.locator('[aria-label="Your current location"]').count()>0,
    valuePromiseVisible:await launch.page.getByText('Find a place you can count on.',{exact:true}).isVisible(),
  }));
  await launch.page.screenshot({path:path.join(OUTPUT,'01-sparta-guest-launch.png'),fullPage:false});
  if(launch.network.errors.length)failures.push(`Guest launch raised page errors: ${launch.network.errors.join(' | ')}`);

  // 2. A non-business street address becomes the discovery origin.
  await search(launch.page,RESIDENTIAL_ADDRESS);
  const addressBody=clean(await launch.page.locator('body').innerText());
  const addressOrigin=/Searching near\s+/i.test(addressBody);
  observations.push(await collect(launch.page,'residential_address_origin',launch.network,{addressOrigin}));
  await launch.page.screenshot({path:path.join(OUTPUT,'02-address-origin.png'),fullPage:false});
  if(!addressOrigin)failures.push('Residential/non-business address did not become a visible discovery origin.');

  // 3. Brand discovery retains that chosen origin instead of snapping back to GPS.
  await search(launch.page,'Pizza Hut');
  const pizzaBody=clean(await launch.page.locator('body').innerText());
  const pizzaVisible=/Pizza Hut/i.test(pizzaBody);
  const retainedOrigin=/Searching near\s+/i.test(pizzaBody);
  observations.push(await collect(launch.page,'pizza_hut_from_selected_origin',launch.network,{pizzaVisible,retainedOrigin}));
  await launch.page.screenshot({path:path.join(OUTPUT,'03-pizza-hut.png'),fullPage:false});
  if(!retainedOrigin)failures.push('Brand search lost the selected address origin and reverted discovery context.');

  // 4. Select a visible result from the unified results sheet, then inspect details.
  const expandResults=launch.page.getByRole('button',{name:'Expand results'}).first();
  if(await expandResults.isVisible().catch(()=>false))await expandResults.click();
  const resultName=launch.page.getByText('Pizza Hut',{exact:true}).first();
  const selectableResult=resultName.locator('xpath=ancestor::*[@role="button"][1]');
  if(await resultName.isVisible().catch(()=>false)&&await selectableResult.count()){
    // Exercise the destination marker action even when the mobile results sheet temporarily overlaps its map position.
    await selectableResult.click({force:true});
    const details=launch.page.getByText('Full details',{exact:true}).first();
    await expect(details).toBeVisible({timeout:10000});
    await details.click();
    await launch.page.waitForTimeout(1500);
    const detailText=clean(await launch.page.locator('body').innerText());
    const detailSignals={
      hasDirections:/Start directions/i.test(detailText),
      hasDetailsHours:/DETAILS \+ HOURS/i.test(detailText),
      hasAmenitiesTrust:/AMENITIES \+ TRUST/i.test(detailText),
      overclaimsRestroom:/KLEENEST RESTROOM/i.test(detailText)&&!/RESTROOM UNVERIFIED/i.test(detailText),
    };
    observations.push(await collect(launch.page,'full_details_surface',launch.network,detailSignals));
    await launch.page.screenshot({path:path.join(OUTPUT,'04-full-details.png'),fullPage:false});
    if(!detailSignals.hasDirections)failures.push('Full Details did not expose the primary directions action.');
  }else{
    observations.push(await collect(launch.page,'full_details_surface_skipped',launch.network,{reason:'No visible unified-sheet result after Pizza Hut search'}));
  }
  await launch.page.close();

  // 5. Quick find from GPS: a common chain should use the current Sparta origin.
  const quick=await newConsumerPage(context);
  await search(quick.page,'Walmart');
  const quickBody=clean(await quick.page.locator('body').innerText());
  observations.push(await collect(quick.page,'quick_find_walmart',quick.network,{walmartVisible:/Walmart/i.test(quickBody)}));
  await quick.page.screenshot({path:path.join(OUTPUT,'05-quick-find-walmart.png'),fullPage:false});
  await quick.page.close();

  // 6. Natural-language amenity search should feel like normal discovery, not a chatbot.
  const amenity=await newConsumerPage(context);
  await search(amenity.page,'clean restroom with changing table nearby');
  const amenityBody=clean(await amenity.page.locator('body').innerText());
  const intentVisible=/Searching for\s+/i.test(amenityBody);
  observations.push(await collect(amenity.page,'amenity_natural_language',amenity.network,{intentVisible,hasChatbotCopy:/Ask .*AI|AI ASSIST|Kleenest AI/i.test(amenityBody)}));
  await amenity.page.screenshot({path:path.join(OUTPUT,'06-amenity-search.png'),fullPage:false});
  if(/Ask .*AI|AI ASSIST|Kleenest AI/i.test(amenityBody))failures.push('Ambient discovery exposed chatbot/AI product copy in the normal Explore journey.');
  await amenity.page.close();

  // 7. Dense-market origin: expose duplicate-looking cards/clusters without hiding the map controls.
  const dense=await newConsumerPage(context);
  await search(dense.page,'St. Louis, MO',60000);
  const denseLabels=await dense.page.locator('[aria-label]').evaluateAll(nodes=>nodes.map(node=>String(node.getAttribute('aria-label')||'')).filter(Boolean));
  const clusterCount=denseLabels.filter(label=>/places in this map cluster/i.test(label)).length;
  const zoomInVisible=await dense.page.getByRole('button',{name:'Zoom map in'}).isVisible().catch(()=>false);
  const zoomOutVisible=await dense.page.getByRole('button',{name:'Zoom map out'}).isVisible().catch(()=>false);
  observations.push(await collect(dense.page,'dense_st_louis',dense.network,{clusterCount,zoomInVisible,zoomOutVisible}));
  await dense.page.screenshot({path:path.join(OUTPUT,'07-dense-st-louis.png'),fullPage:false});
  if(!zoomInVisible||!zoomOutVisible)failures.push('Dense-market Explore lost visible map zoom controls.');
  await dense.page.close();

  // 8. Place-along-the-way flow from Sparta toward St. Louis.
  const route=await newConsumerPage(context);
  await route.page.getByRole('button',{name:'Along route search'}).click();
  await search(route.page,'St. Louis, MO',90000);
  const routeBody=clean(await route.page.locator('body').innerText());
  const routeSignals={
    destinationVisible:/Destination\s+/i.test(routeBody),
    usefulStopsVisible:/Useful stops ahead/i.test(routeBody),
    fitRouteVisible:await route.page.getByRole('button',{name:'Fit full route on map'}).isVisible().catch(()=>false),
    startNavigationVisible:/Start navigation/i.test(routeBody),
  };
  observations.push(await collect(route.page,'sparta_to_st_louis_route',route.network,routeSignals));
  await route.page.screenshot({path:path.join(OUTPUT,'08-route.png'),fullPage:false});
  if(!routeSignals.destinationVisible)failures.push('Along-route search did not keep the destination visible in the journey.');
  await route.page.close();

  // 9. Guest versus account value: signing in must have a clear reason, not be a dead-end auth form.
  const profile=await context.newPage();
  const profileNetwork=watch(profile);
  const profileResponse=await profile.goto(new URL('profile/?app=1',BASE).toString(),{waitUntil:'domcontentloaded',timeout:30000});
  expect(profileResponse?.status()).toBe(200);
  await profile.getByText('WHY SIGN IN',{exact:true}).waitFor({state:'visible',timeout:20000});
  const profileText=clean(await profile.locator('body').innerText());
  const profileSignals={
    whySignIn:/WHY SIGN IN/i.test(profileText),
    identityValue:/One identity, one trust history/i.test(profileText),
    savedValue:/saved places/i.test(profileText),
    progressionValue:/progression/i.test(profileText),
    communityValue:/community connections/i.test(profileText),
    createAccountVisible:await profile.getByRole('button',{name:'Create account'}).isVisible().catch(()=>false),
  };
  observations.push(await collect(profile,'guest_vs_signup_value',profileNetwork,profileSignals));
  await profile.screenshot({path:path.join(OUTPUT,'09-guest-vs-signup.png'),fullPage:false});
  if(!profileSignals.whySignIn||!profileSignals.identityValue)failures.push('Guest profile does not clearly explain why creating a free account is valuable.');
  await profile.close();

  const report={
    generatedAt:new Date().toISOString(),
    base:BASE,
    geolocation:SPARTA,
    addressScenario:RESIDENTIAL_ADDRESS,
    failures,
    observations,
  };
  fs.writeFileSync(path.join(OUTPUT,'report.json'),JSON.stringify(report,null,2));
  console.log('CONSUMER_STRESS_REPORT',JSON.stringify(report));

  await context.close();
  expect(failures,JSON.stringify(report,null,2)).toEqual([]);
});
