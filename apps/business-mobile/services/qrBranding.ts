import * as ImagePicker from 'expo-image-picker';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const BUCKET='qr-branding';
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
  const response=await fetch(asset.uri);
  const body=await response.blob();
  const size=asset.fileSize??body.size??0;
  if(size>2_097_152)throw new Error('QR logo must be 2 MB or smaller.');
  const{data:{user},error:userError}=await client().auth.getUser();
  if(userError)throw userError;
  if(!user)throw new Error('Authentication required.');
  const ext=extension(mime,asset.fileName??undefined);
  const path=`${businessId}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const upload=await client().storage.from('qr-branding').upload(path,body,{contentType:mime,upsert:false,cacheControl:'3600'});
  if(upload.error)throw upload.error;
  const publicUrl=client().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return{storagePath:path,publicUrl,width:asset.width,height:asset.height,sizeBytes:size,mimeType:mime};
}

export async function deleteQrBranding(storagePath:string){
  const result=await client().storage.from(BUCKET).remove([storagePath]);
  if(result.error)throw result.error;
  return true;
}
