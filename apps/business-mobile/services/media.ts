import * as ImagePicker from 'expo-image-picker';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const LOCATION_BUCKET='location-photos';
const QR_BUCKET='qr-branding';
const client=()=>getKleenestSupabaseClient();

function extension(mime:string|undefined,name:string|undefined){
  const fromName=name?.split('.').pop()?.toLowerCase();
  if(fromName&&['jpg','jpeg','png','webp'].includes(fromName))return fromName==='jpeg'?'jpg':fromName;
  if(mime==='image/png')return 'png';
  if(mime==='image/webp')return 'webp';
  return 'jpg';
}

export async function pickAndUploadQrBranding(businessId:string){
  const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
  if(!permission.granted)throw new Error('Photo library permission is required to choose a QR logo.');
  const picked=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:0.75,allowsMultipleSelection:false});
  if(picked.canceled||!picked.assets[0])return null;
  const asset=picked.assets[0];
  const mime=asset.mimeType??'image/jpeg';
  if(!['image/png','image/jpeg','image/webp'].includes(mime))throw new Error('QR logos must be PNG, JPEG or WebP.');
  const response=await fetch(asset.uri);const body=await response.blob();
  const size=asset.fileSize??body.size??0;
  if(size>2_097_152)throw new Error('QR logo must be 2 MB or smaller.');
  const{data:{user},error:userError}=await client().auth.getUser();
  if(userError)throw userError;if(!user)throw new Error('Authentication required.');
  const ext=extension(mime,asset.fileName??undefined);
  const path=`${businessId}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const upload=await client().storage.from(QR_BUCKET).upload(path,body,{contentType:mime,upsert:false,cacheControl:'3600'});
  if(upload.error)throw upload.error;
  return{storagePath:path,publicUrl:client().storage.from(QR_BUCKET).getPublicUrl(path).data.publicUrl,width:asset.width,height:asset.height,sizeBytes:size,mimeType:mime};
}

export async function deleteQrBranding(storagePath:string){const result=await client().storage.from(QR_BUCKET).remove([storagePath]);if(result.error)throw result.error;return true;}

export async function pickAndUploadBusinessLocationPhoto(businessId:string,locationId:string,caption?:string){
  const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
  if(!permission.granted)throw new Error('Photo library permission is required to upload location media.');
  const picked=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:0.9,allowsMultipleSelection:false});
  if(picked.canceled||!picked.assets[0])return null;
  const asset=picked.assets[0];
  const{data:{user},error:userError}=await client().auth.getUser();
  if(userError)throw userError;if(!user)throw new Error('Authentication required.');
  const mime=asset.mimeType??'image/jpeg';const ext=extension(mime,asset.fileName??undefined);
  const path=`${user.id}/${locationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const response=await fetch(asset.uri);const body=await response.blob();
  const upload=await client().storage.from(LOCATION_BUCKET).upload(path,body,{contentType:mime,upsert:false});
  if(upload.error)throw upload.error;
  const{data:mediaId,error:recordError}=await client().rpc('business_create_media',{p_business_id:businessId,p_location_id:locationId,p_storage_path:path,p_caption:caption??asset.fileName??null,p_media_type:'photo',p_mime_type:mime,p_size_bytes:asset.fileSize??body.size??null,p_width:asset.width??null,p_height:asset.height??null,p_sort_order:null});
  if(recordError){await client().storage.from(LOCATION_BUCKET).remove([path]);throw recordError;}
  return{id:String(mediaId),storagePath:path,publicUrl:client().storage.from(LOCATION_BUCKET).getPublicUrl(path).data.publicUrl};
}
