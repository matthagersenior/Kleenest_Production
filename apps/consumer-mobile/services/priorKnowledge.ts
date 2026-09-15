import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type PriorKnowledgeRecency =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'few_months'
  | 'long_time'
  | 'unknown';

export type PriorKnowledgeCleanliness =
  | 'usually_spotless'
  | 'usually_clean'
  | 'mixed'
  | 'often_needs_attention'
  | 'unknown';

export type PriorKnowledgePhotoDraft = {
  uri: string;
  width: number | null;
  height: number | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
};

export type PriorKnowledgeInput = {
  knowledgeRecency: PriorKnowledgeRecency;
  facts: string[];
  cleanlinessTendency: PriorKnowledgeCleanliness;
  accessNotes?: string;
  notes?: string;
};

export async function submitPriorKnowledge(locationId: string, input: PriorKnowledgeInput) {
  const { data, error } = await getKleenestSupabaseClient().rpc('consumer_record_discovery_evidence', {
    p_location_id: locationId,
    p_input: {
      method: 'prior_knowledge',
      knowledge_recency: input.knowledgeRecency,
      facts: [...new Set(input.facts.map((value) => value.trim()).filter(Boolean))],
      cleanliness_tendency: input.cleanlinessTendency,
      access_notes: input.accessNotes?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
  if (error) throw error;
  return data || {};
}


const MAX_PRIOR_PHOTO_BYTES=8*1024*1024;
function priorPhotoExtension(photo:PriorKnowledgePhotoDraft){
  const ext=photo.fileName?.split('.').pop()?.toLowerCase();
  if(ext&&/^[a-z0-9]{2,5}$/.test(ext))return ext;
  if(photo.mimeType==='image/png')return 'png';
  if(photo.mimeType==='image/webp')return 'webp';
  return 'jpg';
}

export async function submitPriorKnowledgePhotos(
  locationId:string,
  photos:PriorKnowledgePhotoDraft[],
  knowledgeRecency:PriorKnowledgeRecency='unknown',
){
  const selected=(photos||[]).slice(0,3);
  if(!selected.length)throw new Error('Choose at least one photo.');
  const client=getKleenestSupabaseClient();
  const {data:auth,error:authError}=await client.auth.getUser();
  if(authError)throw authError;
  const user=auth?.user;
  if(!user)throw new Error('Sign in to add previous-visit photos.');

  const uploadedPaths:string[]=[];
  const payload:any[]=[];
  try{
    const stamp=Date.now();
    for(const [index,photo] of selected.entries()){
      if(photo.fileSize!=null&&photo.fileSize>MAX_PRIOR_PHOTO_BYTES)throw new Error('Each photo must be 8 MB or smaller.');
      const response=await fetch(photo.uri);
      if(!response.ok)throw new Error('A selected photo could not be read.');
      const bytes=await response.arrayBuffer();
      if(bytes.byteLength>MAX_PRIOR_PHOTO_BYTES)throw new Error('Each photo must be 8 MB or smaller.');
      const extension=priorPhotoExtension(photo);
      const contentType=photo.mimeType||(extension==='png'?'image/png':extension==='webp'?'image/webp':'image/jpeg');
      const storagePath=`${user.id}/prior/${locationId}/${stamp}-${index}.${extension}`;
      const {error:uploadError}=await client.storage.from('discovery-photos').upload(storagePath,bytes,{contentType,upsert:false});
      if(uploadError)throw uploadError;
      uploadedPaths.push(storagePath);
      payload.push({
        storage_path:storagePath,
        mime_type:contentType,
        size_bytes:bytes.byteLength,
        width:photo.width,
        height:photo.height,
      });
    }
    const {data,error}=await client.rpc('consumer_attach_prior_knowledge_photos',{
      p_location_id:locationId,
      p_knowledge_recency:knowledgeRecency,
      p_photos:payload,
    });
    if(error)throw error;
    return data||{};
  }catch(error){
    if(uploadedPaths.length)await client.storage.from('discovery-photos').remove(uploadedPaths).catch(()=>{});
    throw error;
  }
}
