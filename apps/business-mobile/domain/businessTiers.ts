import type { BusinessProductAccess } from '../services/productAccess';

export type BusinessTierCapabilities={standard:boolean;growth:boolean;fleet:boolean;enterprise:boolean;coreManagement:boolean;qr:boolean;reviews:boolean;communications:boolean;trustOperations:boolean;preventiveOperations:boolean;advancedEngagement:boolean;intelligence:boolean;reporting:boolean;enterpriseLocationFeatures:boolean;enterpriseNetworks:boolean};
const serviceTier=(entitlement:Record<string,unknown>|null|undefined)=>String(entitlement?.service_tier??'').toLowerCase();
const serviceFlag=(entitlement:Record<string,unknown>|null|undefined,key:string)=>Boolean(entitlement?.[key]);

export function getBusinessTierCapabilities(access:BusinessProductAccess|null|undefined,entitlement?:Record<string,unknown>|null):BusinessTierCapabilities{
  const plan=String(access?.plan??access?.business_tier??'standard').toLowerCase();
  const service=serviceTier(entitlement);
  const enterprise=Boolean(access?.enterprise_enabled)||plan==='enterprise'||service==='enterprise'||serviceFlag(entitlement,'enterprise_enabled');
  const fleet=Boolean(access?.fleet_enabled)||plan==='fleet'||service==='fleet'||serviceFlag(entitlement,'fleet_enabled')||serviceFlag(entitlement,'enterprise_fleet_enabled');
  const growth=plan==='growth'||plan==='fleet'||plan==='enterprise'||service==='growth'||service==='fleet'||service==='enterprise'||plan==='business_growth'||service==='business_growth'||enterprise;
  return{
    standard:Boolean(access),growth,fleet,enterprise,coreManagement:Boolean(access),qr:Boolean(access),reviews:Boolean(access),communications:Boolean(access),
    trustOperations:Boolean(access),preventiveOperations:Boolean(access),advancedEngagement:growth,intelligence:growth||fleet||enterprise,reporting:growth||fleet||enterprise,
    enterpriseLocationFeatures:growth||enterprise,enterpriseNetworks:enterprise
  };
}

export function tierLabel(access:BusinessProductAccess|null|undefined,entitlement?:Record<string,unknown>|null){
  const plan=String(access?.plan??access?.business_tier??'standard').toLowerCase();
  const caps=getBusinessTierCapabilities(access,entitlement);
  if(plan==='enterprise')return caps.fleet?'Enterprise + Fleet':'Enterprise';
  if(plan==='fleet')return caps.enterprise?'Fleet + Enterprise':'Fleet';
  if(plan==='growth')return caps.enterprise?'Growth + Enterprise':caps.fleet?'Growth + Fleet':'Growth';
  if(caps.enterprise)return caps.fleet?'Enterprise + Fleet':'Enterprise';
  if(caps.fleet)return'Standard + Fleet';
  return'Standard';
}
