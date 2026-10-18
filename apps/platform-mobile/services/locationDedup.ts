import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { requirePlatformOwner } from './ownerAdmin';

export type DuplicateStatus = 'pending' | 'confirmed' | 'different_businesses' | 'co_located' | 'needs_geocoding' | 'resolved';

export type DuplicateLocation = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  website: string | null;
  place_type: string | null;
  brand_name: string | null;
  latitude: number | null;
  longitude: number | null;
  source_dataset: string | null;
  source_external_id: string | null;
  is_active: boolean | null;
};

export type DuplicateCase = {
  id: number;
  first_location_id: string;
  second_location_id: string;
  rule: string;
  confidence: number;
  status: DuplicateStatus;
  distance_m: number | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  first?: DuplicateLocation;
  second?: DuplicateLocation;
};

export type DuplicateReviewEvent = {
  id: number;
  case_id: number;
  reviewer_id: string | null;
  previous_status: DuplicateStatus;
  next_status: DuplicateStatus;
  previous_notes: string | null;
  next_notes: string | null;
  changed_at: string;
};

export const openReviewStatuses: DuplicateStatus[] = ['pending','needs_geocoding'];
const client = () => getKleenestSupabaseClient();

// A keyset cursor does not shift when the owner changes the status of earlier
// cases. OFFSET paging skipped records as the review queue shrank.
export type DuplicateReviewCursor = Pick<DuplicateCase,'id'|'confidence'|'distance_m'>;
export async function listOwnerLocationDuplicates(
  status:DuplicateStatus, after:DuplicateReviewCursor|null=null,limit=40
):Promise<DuplicateCase[]> {
  await requirePlatformOwner();
  const size=Math.min(Math.max(1,limit),80);
  let query=client().from('location_duplicate_cases')
    .select('id,first_location_id,second_location_id,rule,confidence,status,distance_m,review_notes,reviewed_at,created_at')
    .eq('status',status);
  if(status==='pending'){
    query=query.order('confidence',{ascending:false})
      .order('distance_m',{ascending:true,nullsFirst:false}).order('id',{ascending:true});
    if(after){
      const conf=Number(after.confidence);
      const id=Number(after.id);
      const dist=after.distance_m===null?null:Number(after.distance_m);
      const filter=dist===null
        ? `confidence.lt.${conf},and(confidence.eq.${conf},distance_m.is.null,id.gt.${id})`
        : `confidence.lt.${conf},and(confidence.eq.${conf},distance_m.gt.${dist}),and(confidence.eq.${conf},distance_m.eq.${dist},id.gt.${id}),and(confidence.eq.${conf},distance_m.is.null)`;
      query=query.or(filter);
    }
  } else if(status==='needs_geocoding'){
    query=query.order('distance_m',{ascending:false,nullsFirst:false}).order('id',{ascending:true});
    if(after){
      const id=Number(after.id);
      const dist=after.distance_m===null?null:Number(after.distance_m);
      query=query.or(dist===null
        ? `and(distance_m.is.null,id.gt.${id})`
        : `distance_m.lt.${dist},and(distance_m.eq.${dist},id.gt.${id}),distance_m.is.null`);
    }
  } else {
    query=query.order('id',{ascending:false});
    if(after)query=query.lt('id',after.id);
  }
  const {data,error}=await query.limit(size);
  if(error) throw error;
  const cases=(data??[]) as DuplicateCase[];
  if(!cases.length) return [];
  const ids=[...new Set(cases.flatMap(item=>[item.first_location_id,item.second_location_id]))];
  const {data:locations,error:locationError}=await client().from('locations')
    .select('id,name,address,city,state,postal_code,phone,website,place_type,brand_name,latitude,longitude,source_dataset,source_external_id,is_active')
    .in('id',ids);
  if(locationError) throw locationError;
  const byId=new Map(((locations??[]) as DuplicateLocation[]).map(location=>[location.id,location]));
  return cases.map(item=>({...item,first:byId.get(item.first_location_id),second:byId.get(item.second_location_id)}));
}

export async function getOwnerDuplicateCounts():Promise<Record<DuplicateStatus,number>> {
  await requirePlatformOwner();
  const counts:Record<DuplicateStatus,number>={
    pending:0,needs_geocoding:0,confirmed:0,co_located:0,
    different_businesses:0,resolved:0,
  };
  // Invoker-security view preserves owner RLS and avoids six round trips.
  const {data,error}=await client().from('owner_location_duplicate_review_counts')
    .select('status,case_count');
  if(error)throw error;
  for(const row of data??[]){
    const key=row.status as DuplicateStatus;
    if(Object.prototype.hasOwnProperty.call(counts,key))counts[key]=Number(row.case_count)||0;
  }
  return counts;
}

export async function listDuplicateReviewHistory(caseId:number):Promise<DuplicateReviewEvent[]> {
  await requirePlatformOwner();
  const {data,error}=await client().from('location_duplicate_review_events')
    .select('id,case_id,reviewer_id,previous_status,next_status,previous_notes,next_notes,changed_at')
    .eq('case_id',caseId).order('changed_at',{ascending:false}).limit(10);
  if(error) throw error;
  return (data??[]) as DuplicateReviewEvent[];
}

// Optimistic lock prevents another reviewer from silently overwriting a decision.
// No mutation to canonical businesses occurs, only review classification and audit log.
export async function classifyOwnerLocationDuplicate(
  item:DuplicateCase,status:DuplicateStatus,reviewNotes:string
):Promise<void> {
  await requirePlatformOwner();
  const update=client().from('location_duplicate_cases')
    .update({
      status, review_notes:reviewNotes.trim() || null,
      reviewed_at:new Date().toISOString(),
    })
    .eq('id',item.id).eq('status',item.status);
  // Status alone is not a lock if another reviewer edits notes in-place.
  const guarded=item.reviewed_at
    ? update.eq('reviewed_at',item.reviewed_at)
    : update.is('reviewed_at',null);
  const {data,error}=await guarded.select('id').maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('This case was changed in another session. Refresh to review the latest evidence.');
}
