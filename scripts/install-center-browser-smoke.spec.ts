import { test, expect } from '@playwright/test';

const BASE=(process.env.KLEENEST_LIVE_WEB_BASE||'https://matthagersenior.github.io/Kleenest_Production/').replace(/\/?$/,'/');
const EXPECTED_SHA=process.env.EXPECTED_SHA||'';
const BASE_PATH=new URL(BASE).pathname.replace(/\/$/,'');
const routePath=(route='')=>`${BASE_PATH}/${route}`.replace(/\/+/g,'/');

test('Installation Center click-through and release assets',async({page,request,browser})=>{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByText('Find clean bathrooms you can actually trust.')).toBeVisible({timeout:30000});
  await expect(page.getByText('FOR YOU',{exact:true})).toBeVisible();
  await expect(page.getByText('FOR BUSINESS',{exact:true})).toBeVisible();
  await expect(page.getByText('TRUST + FRESHNESS',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Install Kleenest/i}).first().click();
  await expect(page).toHaveURL(new RegExp(`${routePath('install')}/?import { test, expect } from '@playwright/test';

const BASE=(process.env.KLEENEST_LIVE_WEB_BASE||'https://matthagersenior.github.io/Kleenest_Production/').replace(/\/?$/,'/');
const EXPECTED_SHA=process.env.EXPECTED_SHA||'';
const BASE_PATH=new URL(BASE).pathname.replace(/\/$/,'');
const routePath=(route='')=>`${BASE_PATH}/${route}`.replace(/\/+/g,'/');

test('Installation Center click-through and release assets',async({page,request,browser})=>{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByText('Find clean bathrooms you can actually trust.')).toBeVisible({timeout:30000});
  await expect(page.getByText('FOR YOU',{exact:true})).toBeVisible();
  await expect(page.getByText('FOR BUSINESS',{exact:true})).toBeVisible();
  await expect(page.getByText('TRUST + FRESHNESS',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Install Kleenest/i}).first().click();
));
  await expect(page.getByText('KLEENEST · UNIVERSAL INSTALLATION CENTER')).toBeVisible();
  await expect(page.getByText('INSTALL HEALTH',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'INSTALL WEB APP',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'CHECK INSTALLATION',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'SHARE INSTALL LINK',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'OPEN KLEENEST',exact:true})).toBeVisible();
  await expect(page.getByText('ANDROID APK · DIRECT DOWNLOAD',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:/Download Android APK/i})).toBeVisible();
  await expect(page.getByRole('button',{name:/Copy APK link/i})).toBeVisible();
  await expect(page.getByRole('link',{name:/View SHA-256 checksum/i})).toBeVisible();
  await expect(page.locator('body')).toContainText('WHICH INSTALL SHOULD I CHOOSE?');
  await expect(page.locator('body')).toContainText(/Recommended for most Android users|iPhone or iPad: use the Web App|Windows or Mac: use the Web App/);
  await expect(page.locator('body')).toContainText('If you have never installed a web app before');
  await expect(page.locator('body')).toContainText('Find Kleenest after installation');
  await expect(page.locator('body')).toContainText('Allow from this source');
  await expect(page.locator('body')).toContainText(new URL('Kleenest-Consumer.apk',BASE).toString());

  const mobileContext=await browser.newContext({
    viewport:{width:390,height:844},
    userAgent:'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    isMobile:true,
    hasTouch:true,
  });
  const mobilePage=await mobileContext.newPage();
  await mobilePage.goto(BASE+'install/',{waitUntil:'domcontentloaded'});
  await expect(mobilePage.getByText('KLEENEST · UNIVERSAL INSTALLATION CENTER')).toBeVisible({timeout:30000});
  const mobileMetrics=await mobilePage.evaluate(()=>({innerWidth:window.innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  expect(mobileMetrics.scrollWidth).toBeLessThanOrEqual(mobileMetrics.innerWidth+1);
  await expect(mobilePage.getByRole('button',{name:/Continue to Kleenest as a guest/i})).toBeVisible();
  await mobilePage.screenshot({path:'test-results/kleenest-install-center-mobile.png',fullPage:false});
  await mobileContext.close();

  await page.getByRole('button',{name:/Continue to Kleenest as a guest/i}).click();
  await expect(page).toHaveURL(new RegExp(`${routePath('')}\\?app=1$`));
  await expect(page.locator('body')).toContainText(/Find a place you can count on|Nearby options|Address, school, workplace, city or brand|Search this area/i,{timeout:30000});
  await page.goto(BASE+'install/',{waitUntil:'domcontentloaded'});
  await expect(page.getByText('KLEENEST · UNIVERSAL INSTALLATION CENTER')).toBeVisible({timeout:30000});

  await page.getByRole('button',{name:'INSTALL WEB APP',exact:true}).click();
  await expect(page.locator('body')).toContainText(/Install app|Add to Home Screen|automatic prompt|browser menu/i);

  await page.getByRole('button',{name:'CHECK INSTALLATION',exact:true}).click();
  await page.getByRole('button',{name:'SHARE INSTALL LINK',exact:true}).click();
  await expect(page.locator('body')).toContainText(/Install link copied|Share this install link|Install link shared/i);

  await page.getByRole('link',{name:'OPEN KLEENEST',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`${routePath('')}\\?app=1$`));
  await expect(page.locator('body')).toContainText(/Find a place you can count on|Nearby options|Address, school, workplace, city or brand|Search this area/i,{timeout:30000});

  for(const route of ['install/','for-you/','for-business/','trust/']){
    const direct=await request.get(BASE+route,{failOnStatusCode:false});
    expect(direct.status()).toBe(200);
  }

  const manifestResponse=await request.get(BASE+'manifest.webmanifest');
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest=await manifestResponse.json();
  expect(manifest.display).toBe('standalone');
  const expectedScope=new URL(BASE).pathname;
  expect(manifest.scope).toBe(expectedScope);
  expect(manifest.start_url).toBe(`${expectedScope}?app=1`);
  expect(manifest.shortcuts.some((x:any)=>x.url===`${expectedScope}install`)).toBeTruthy();

  const stateResponse=await request.get(BASE+'Kleenest-release-state.json');
  expect(stateResponse.ok()).toBeTruthy();
  const state=await stateResponse.json();
  expect(typeof state.otaCompatible).toBe('boolean');
  expect(typeof state.nativeDrift).toBe('boolean');
  expect(['OTA_SAFE','NATIVE_REBUILD_REQUIRED']).toContain(state.status);
  if(EXPECTED_SHA)expect(state.currentSha).toBe(EXPECTED_SHA);

  const checksum=await request.get(BASE+'Kleenest-Consumer.apk.sha256');
  expect(checksum.ok()).toBeTruthy();
  const checksumText=(await checksum.text()).trim();
  expect(checksumText).toMatch(/^[a-f0-9]{64}\s+/i);
  expect(checksumText).toContain('Kleenest-Consumer.apk');

  const apkHead=await request.head(BASE+'Kleenest-Consumer.apk');
  expect(apkHead.ok()).toBeTruthy();
  const apkHeaders=apkHead.headers();
  expect(String(apkHeaders['content-type']||'')).toMatch(/android|octet-stream|application\/zip/i);
  const apkLength=Number(apkHeaders['content-length']||0);
  if(apkLength)expect(apkLength).toBeGreaterThan(1_000_000);

  const worker=await request.get(BASE+'sw.js');
  expect(worker.ok()).toBeTruthy();
  expect(await worker.text()).toContain('kleenest-shell');
});
