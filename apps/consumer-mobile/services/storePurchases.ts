import { finishTransaction, getAvailablePurchases, type Purchase } from 'expo-iap';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export const REMOVE_ADS_PRODUCT_ID='kleenest_remove_ads_lifetime';

const client=()=>getKleenestSupabaseClient();

function cleanPurchase(purchase:Purchase){
  return {
    productId:String(purchase.productId||''),
    transactionId:purchase.transactionId?String(purchase.transactionId):null,
    purchaseToken:purchase.purchaseToken?String(purchase.purchaseToken):null,
    transactionDate:purchase.transactionDate??null,
    store:purchase.store?String(purchase.store):null,
  };
}

export async function buildRemoveAdsPurchaseRequest(){
  const{data,error}=await client().auth.getUser();
  if(error||!data.user?.id)throw error||new Error('Sign in before purchasing Remove Ads.');
  const accountId=String(data.user.id);
  return {
    apple:{sku:REMOVE_ADS_PRODUCT_ID,quantity:1,appAccountToken:accountId},
    google:{skus:[REMOVE_ADS_PRODUCT_ID],obfuscatedAccountId:accountId},
  };
}

export async function verifyRemoveAdsPurchase(purchase:Purchase){
  if(String(purchase.productId||'')!==REMOVE_ADS_PRODUCT_ID)throw new Error('Unexpected store product.');
  const{data,error}=await client().functions.invoke('verify-mobile-store-purchase',{body:{purchase:cleanPurchase(purchase)}});
  if(error)throw error;
  if(!data?.verified)throw new Error(data?.error||'The store purchase could not be verified.');
  return data;
}

export async function verifyAndFinishRemoveAdsPurchase(purchase:Purchase){
  const verified=await verifyRemoveAdsPurchase(purchase);
  await finishTransaction({purchase,isConsumable:false});
  return verified;
}

export async function restoreRemoveAdsPurchases(){
  const purchases=await getAvailablePurchases({onlyIncludeActiveItemsIOS:true});
  const matches=(purchases||[]).filter(p=>String(p.productId||'')===REMOVE_ADS_PRODUCT_ID);
  for(const purchase of matches)await verifyAndFinishRemoveAdsPurchase(purchase);
  return matches.length;
}
