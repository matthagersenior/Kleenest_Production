import { test, expect } from '@playwright/test';

const BASE=process.env.BUSINESS_WEB_BASE||'http://127.0.0.1:4173/Kleenest_Production/business/';
const PREFIX='kleenest.business.web.secure.';

test('Business Web reaches sign-in when its persisted auth storage is unavailable',async({page})=>{
  const pageErrors:string[]=[];
  page.on('pageerror',error=>pageErrors.push(error.message));

  await page.addInitScript((prefix)=>{
    const getItem=Storage.prototype.getItem;
    const setItem=Storage.prototype.setItem;
    const removeItem=Storage.prototype.removeItem;
    Storage.prototype.getItem=function(key:string){
      if(String(key).startsWith(prefix))throw new DOMException('Business auth storage read blocked for test.','SecurityError');
      return getItem.call(this,key);
    };
    Storage.prototype.setItem=function(key:string,value:string){
      if(String(key).startsWith(prefix))throw new DOMException('Business auth storage write blocked for test.','SecurityError');
      return setItem.call(this,key,value);
    };
    Storage.prototype.removeItem=function(key:string){
      if(String(key).startsWith(prefix))throw new DOMException('Business auth storage removal blocked for test.','SecurityError');
      return removeItem.call(this,key);
    };
  },PREFIX);

  const response=await page.goto(BASE,{waitUntil:'domcontentloaded'});
  expect(response?.status()).toBe(200);
  await expect(page.getByText('KLEENEST BUSINESS',{exact:true})).toBeVisible({timeout:15000});
  await expect(page.getByText('Welcome back',{exact:true})).toBeVisible();
  expect(pageErrors).toEqual([]);
});
