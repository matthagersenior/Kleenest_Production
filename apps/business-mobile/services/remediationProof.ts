import * as ImagePicker from 'expo-image-picker';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const BUCKET='location-photos';
const client=()=>getKleenestSupabaseClient();
function extension(mime:string|undefined,name:string|undefined){const fromName=name?.split('.').pop()?.toLowerCase();if(fromName&&['jpg','jpeg','png','webp'].includes(fromName))return fromName==='jpeg'?'jpg':fromName;if(mime==='image/png')return'png';if(mime==='image/webp')return'webp';return'jpg';}

export async function pickAndUploadRemediationProof(businessId:string,locationId:string){
 const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
 if(!permission.granted)throw new Error('Photo library permission is required to attach remediation proof.');
 const picked=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:0.85,allowsMultipleSelection:false});
 if(picked.canceled||!picked.assets[0])return null;
 const asset=picked.assets[0],mime=asset.mimeType??'image/jpeg';
 if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new Error('Proof must be JPEG, PNG or WebP.');
 const response=await fetch(asset.uri),body=await response.blob(),size=asset.fileSize??body.size??0;
 if(size>12_582_912)throw new Error('Proof photo must be 12 MB or smaller.');
 const{data:{user},error:userError}=await client().auth.getUser();if(userError)throw userError;if(!user)throw new Error('Authentication required.');
 const path=`${user.id}/${locationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension(mime,asset.fileName??undefined)}`;
 const upload=await client().storage.from(BUCKET).upload(path,body,{contentType:mime,upsert:false,cacheControl:'3600'});if(upload.error)throw upload.error;
 const{data:mediaId,error:recordError}=await client().rpc('business_create_media',{p_business_id:businessId,p_location_id:locationId,p_storage_path:path,p_caption:'Remediation proof',p_media_type:'photo',p_mime_type:mime,p_size_bytes:size,p_width:asset.width??null,p_height:asset.height??null,p_sort_order:null});
 if(recordError){await client().storage.from(BUCKET).remove([path]).catch(()=>null);throw recordError;}
 return{id:String(mediaId),storagePath:path,publicUrl:client().storage.from(BUCKET).getPublicUrl(path).data.publicUrl};
}
