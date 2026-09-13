import { test, expect } from '@playwright/test';

const BASE='https://matthagersenior.github.io/Kleenest_Production/';
const EXPECTED_SHA=process.env.EXPECTED_SHA||'';

test('Installation Center click-through and release assets',async({page,request})=>{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByText('Clean bathrooms shouldn’t be a gamble.')).toBeVisible({timeout:30000});
  await expect(page.getByText('FOR YOU',{exact:true})).toBeVisible();
  await expect(page.getByText('FOR BUSINESS',{exact:true})).toBeVisible();
  await expect(page.getByText('TRUST + FRESHNESS',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Install Kleenest/i}).first().click();
  await expect(page).toHaveURL(/\/Kleenest_Production\/install\/?$/);
  await expect(page.getByText('KLEENEST · UNIVERSAL INSTALLATION CENTER')).toBeVisible();
  await expect(page.getByText('INSTALL HEALTH',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'INSTALL WEB APP',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'CHECK INSTALLATION',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'SHARE INSTALL LINK',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'OPEN KLEENEST',exact:true})).toBeVisible();

  await page.getByRole('button',{name:'INSTALL WEB APP',exact:true}).click();
  await expect(page.locator('body')).toContainText(/Install app|Add to Home Screen|automatic prompt|browser menu/i);

  await page.getByRole('button',{name:'CHECK INSTALLATION',exact:true}).click();
  await page.getByRole('button',{name:'SHARE INSTALL LINK',exact:true}).click();
  await expect(page.locator('body')).toContainText(/Install link copied|Share this install link|Install link shared/i);

  await page.goto(BASE+'?app=1',{waitUntil:'domcontentloaded'});
  await expect(page.getByText('YOUR KLEENEST',{exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByText('Find a bathroom you can trust.',{exact:true})).toBeVisible();

  for(const route of ['install/','for-you/','for-business/','trust/']){
    const direct=await request.get(BASE+route,{failOnStatusCode:false});
    expect(direct.status()).toBe(200);
  }

  const manifestResponse=await request.get(BASE+'manifest.webmanifest');
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest=await manifestResponse.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.scope).toBe('/Kleenest_Production/');
  expect(manifest.start_url).toBe('/Kleenest_Production/?app=1');
  expect(manifest.shortcuts.some((x:any)=>x.url==='/Kleenest_Production/install')).toBeTruthy();

  const stateResponse=await request.get(BASE+'Kleenest-release-state.json');
  expect(stateResponse.ok()).toBeTruthy();
  const state=await stateResponse.json();
  expect(typeof state.otaCompatible).toBe('boolean');
  expect(typeof state.nativeDrift).toBe('boolean');
  expect(['OTA_SAFE','NATIVE_REBUILD_REQUIRED']).toContain(state.status);
  if(EXPECTED_SHA)expect(state.currentSha).toBe(EXPECTED_SHA);

  const checksum=await request.get(BASE+'Kleenest-Consumer.apk.sha256');
  expect(checksum.ok()).toBeTruthy();
  expect((await checksum.text()).trim()).toMatch(/^[a-f0-9]{64}\s+/i);

  const apkHead=await request.head(BASE+'Kleenest-Consumer.apk');
  expect(apkHead.ok()).toBeTruthy();

  const worker=await request.get(BASE+'sw.js');
  expect(worker.ok()).toBeTruthy();
  expect(await worker.text()).toContain('kleenest-shell');
});
