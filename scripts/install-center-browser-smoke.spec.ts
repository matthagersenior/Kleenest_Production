import { test, expect } from '@playwright/test';

const BASE='https://matthagersenior.github.io/Kleenest_Production/';
const EXPECTED_SHA=process.env.EXPECTED_SHA||'';

test('Installation Center click-through and release assets',async({page,request})=>{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.getByText('GET KLEENEST')).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:'Install Kleenest'}).click();
  await expect(page).toHaveURL(/\/Kleenest_Production\/install\/?$/);
  await expect(page.getByText('KLEENEST · UNIVERSAL INSTALLATION CENTER')).toBeVisible();
  await expect(page.getByText('INSTALL HEALTH')).toBeVisible();
  await expect(page.getByText('INSTALL WEB APP')).toBeVisible();
  await expect(page.getByText('CHECK INSTALLATION')).toBeVisible();
  await expect(page.getByText('SHARE INSTALL LINK')).toBeVisible();
  await expect(page.getByText('OPEN KLEENEST')).toBeVisible();

  await page.getByText('INSTALL WEB APP').click();
  await expect(page.locator('body')).toContainText(/Install app|Add to Home Screen|automatic prompt|browser menu/i);

  await page.getByText('CHECK INSTALLATION').click();
  await page.getByText('SHARE INSTALL LINK').click();
  await expect(page.locator('body')).toContainText(/Install link copied|Share this install link|Install link shared/i);

  const direct=await request.get(BASE+'install/',{failOnStatusCode:false});
  expect(direct.status()).toBe(200);

  const manifestResponse=await request.get(BASE+'manifest.webmanifest');
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest=await manifestResponse.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.scope).toBe('/Kleenest_Production/');
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
  expect(Number(apkHead.headers()['content-length']||0)).toBeGreaterThan(10000000);

  const worker=await request.get(BASE+'sw.js');
  expect(worker.ok()).toBeTruthy();
  expect(await worker.text()).toContain('kleenest-shell');
});
