export type VisitEvidenceDisplayInput={
  verifiedAt?:string|null;
  verificationMethod?:string|null;
  verifiedDistanceMeters?:number|null;
  photoEvidenceCount?:number|null;
  amenityEvidenceCount?:number|null;
};

export function visitFreshness(value:string|null|undefined){
  if(!value)return null;
  const time=new Date(value).getTime();
  if(!Number.isFinite(time))return null;
  const minutes=Math.max(0,Math.floor((Date.now()-time)/60000));
  if(minutes<60)return minutes<2?'just now':`${minutes}m ago`;
  const hours=Math.floor(minutes/60);
  if(hours<24)return `${hours}h ago`;
  const days=Math.floor(hours/24);
  if(days<30)return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

export function verificationMethodLabel(value:string|null|undefined){
  if(!value)return null;
  const normalized=String(value).trim().toLowerCase().replaceAll('_',' ').replaceAll('-',' ');
  if(!normalized)return null;
  if(normalized==='gps'||normalized==='geolocation')return 'GPS';
  if(normalized==='qr'||normalized==='qr code')return 'QR code';
  return normalized.replace(/\b\w/g,match=>match.toUpperCase());
}

export function verificationDistanceBucket(value:number|null|undefined){
  if(value==null)return null;
  const distance=Number(value);
  if(!Number.isFinite(distance)||distance<0)return null;
  if(distance<=25)return 'within 25 m';
  if(distance<=50)return 'within 50 m';
  if(distance<=100)return 'within 100 m';
  if(distance<=250)return 'within 250 m';
  if(distance<=500)return 'within 500 m';
  if(distance<=1000)return 'within 1 km';
  return 'distance verified';
}

export function evidenceCountLabel(count:number|null|undefined,singular:string,plural:string){
  const safe=Math.max(0,Number(count||0));
  return `${safe} ${safe===1?singular:plural}`;
}

export function formatVisitEvidence(input:VisitEvidenceDisplayInput,{includeCounts=true}:{includeCounts?:boolean}={}){
  const parts=[
    visitFreshness(input.verifiedAt),
    verificationMethodLabel(input.verificationMethod),
    verificationDistanceBucket(input.verifiedDistanceMeters),
  ];
  if(includeCounts){
    parts.push(evidenceCountLabel(input.photoEvidenceCount,'photo','photos'));
    parts.push(evidenceCountLabel(input.amenityEvidenceCount,'amenity','amenities'));
  }
  return parts.filter(Boolean).join(' · ');
}
