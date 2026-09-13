import { test, expect } from '@playwright/test';

const BASE=process.env.BUSINESS_WEB_BASE||'http://127.0.0.1:4173/Kleenest_Production/business/';

test('Business Web reaches sign-in when browser persistent storage is unavailable',async({page})=>{
  const pageErrors:string[]=[];
  page.on('pageerror',error=>pageErrors.push(error.message));

  await page.addInitScript(()=>{
    Object.defineProperty(window,'localStorage',{
      configurable:true,
      get(){throw new DOMException('Persistent storage blocked for test.','SecurityError');},
    });
  });

  const response=await page.goto(BASE,{waitUntil:'domcontentloaded'});
  expect(response?.status()).toBe(200);
  await expect(page.getByText('KLEENEST BUSINESS',{exact:true})).toBeVisible({timeout:15000});
  await expect(page.getByText('Welcome back',{exact:true})).toBeVisible();
  expect(pageErrors).toEqual([]);
});
