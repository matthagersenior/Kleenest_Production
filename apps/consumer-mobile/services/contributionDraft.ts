import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReviewPhotoDraft } from './reviewPhotos';

const PREFIX='kleenest.native.contribution.draft.v1:';
const MAX_AGE_MS=48*60*60*1000;

export type ContributionAmenityDraft={selected:boolean;quantity:string;sentiment:'good'|'needs_attention'};
export type ContributionDraft={
  locationId:string;
  savedAt:number;
  stars:string;
  cleanliness:string;
  comment:string;
  amenityDraft:Record<string,ContributionAmenityDraft>;
  reviewPhotos:ReviewPhotoDraft[];
};

const keyFor=(locationId:string)=>`${PREFIX}${String(locationId||'').trim()}`;

export async function readContributionDraft(locationId:string):Promise<ContributionDraft|null>{
  const id=String(locationId||'').trim();
  if(!id)return null;
  try{
    const raw=await AsyncStorage.getItem(keyFor(id));
    if(!raw)return null;
    const parsed=JSON.parse(raw) as Partial<ContributionDraft>;
    if(parsed.locationId!==id||!Number.isFinite(Number(parsed.savedAt))||Date.now()-Number(parsed.savedAt)>MAX_AGE_MS){
      await AsyncStorage.removeItem(keyFor(id));
      return null;
    }
    return{
      locationId:id,
      savedAt:Number(parsed.savedAt),
      stars:typeof parsed.stars==='string'?parsed.stars:'5',
      cleanliness:typeof parsed.cleanliness==='string'?parsed.cleanliness:'',
      comment:typeof parsed.comment==='string'?parsed.comment:'',
      amenityDraft:parsed.amenityDraft&&typeof parsed.amenityDraft==='object'?parsed.amenityDraft:{},
      reviewPhotos:Array.isArray(parsed.reviewPhotos)?parsed.reviewPhotos.slice(0,3):[],
    };
  }catch{return null}
}

export async function writeContributionDraft(input:Omit<ContributionDraft,'savedAt'>){
  const id=String(input.locationId||'').trim();
  if(!id)return;
  const meaningful=input.comment.trim()||input.cleanliness.trim()||input.stars!=='5'||Object.values(input.amenityDraft||{}).some(item=>item?.selected)||input.reviewPhotos?.length;
  if(!meaningful){await AsyncStorage.removeItem(keyFor(id));return}
  const draft:ContributionDraft={...input,locationId:id,savedAt:Date.now(),reviewPhotos:(input.reviewPhotos||[]).slice(0,3)};
  await AsyncStorage.setItem(keyFor(id),JSON.stringify(draft));
}

export async function clearContributionDraft(locationId:string){
  const id=String(locationId||'').trim();
  if(id)await AsyncStorage.removeItem(keyFor(id));
}
