import * as ImagePicker from 'expo-image-picker';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const MAX_REVIEW_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_REVIEW_PHOTOS = 3;

export type ReviewPhotoDraft = {
  uri: string;
  width: number | null;
  height: number | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
};

export type ReviewPhoto = {
  storage_path: string;
  public_url: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  sort_order: number;
};

function extensionFor(asset: ReviewPhotoDraft) {
  const fromName = asset.fileName?.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (asset.mimeType === 'image/png') return 'png';
  if (asset.mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function publicPhoto(row:any):ReviewPhoto {
  const client=getKleenestSupabaseClient();
  return {
    storage_path:String(row.storage_path),
    public_url:client.storage.from('review-photos').getPublicUrl(String(row.storage_path)).data.publicUrl,
    mime_type:row.mime_type||null,
    width:row.width==null?null:Number(row.width),
    height:row.height==null?null:Number(row.height),
    sort_order:Number(row.sort_order||0),
  };
}

export async function chooseReviewPhotos(): Promise<ReviewPhotoDraft[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: MAX_REVIEW_PHOTOS,
    quality: 0.82,
  });
  if (result.canceled) return [];
  return (result.assets || []).slice(0, MAX_REVIEW_PHOTOS).map(asset => ({
    uri: asset.uri,
    width: Number.isFinite(asset.width) ? asset.width : null,
    height: Number.isFinite(asset.height) ? asset.height : null,
    fileName: asset.fileName || null,
    mimeType: asset.mimeType || null,
    fileSize: asset.fileSize ?? null,
  }));
}

export async function uploadReviewPhotos(reviewId: string, photos: ReviewPhotoDraft[]) {
  if (!photos.length) return [];
  const client = getKleenestSupabaseClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  const user = auth?.user;
  if (!user) throw new Error('Sign in to add review photos.');

  const uploaded:any[] = [];
  for (const [index, photo] of photos.slice(0, MAX_REVIEW_PHOTOS).entries()) {
    if (photo.fileSize != null && photo.fileSize > MAX_REVIEW_PHOTO_BYTES) throw new Error('Each review photo must be 8 MB or smaller.');
    const response = await fetch(photo.uri);
    if (!response.ok) throw new Error('A selected review photo could not be read.');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_REVIEW_PHOTO_BYTES) throw new Error('Each review photo must be 8 MB or smaller.');
    const extension = extensionFor(photo);
    const storagePath = `${user.id}/${reviewId}/${Date.now()}-${index}.${extension}`;
    const contentType = photo.mimeType || (extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg');
    const { error: uploadError } = await client.storage.from('review-photos').upload(storagePath, bytes, { contentType, upsert: false });
    if (uploadError) throw uploadError;
    const { data, error } = await client.rpc('attach_review_photo', {
      p_review_id: reviewId,
      p_storage_path: storagePath,
      p_mime_type: contentType,
      p_size_bytes: bytes.byteLength,
      p_width: photo.width,
      p_height: photo.height,
      p_sort_order: index,
    });
    if (error) throw error;
    uploaded.push(data);
  }
  return uploaded;
}

export async function listReviewPhotosForReviews(reviewIds:string[]):Promise<Record<string,ReviewPhoto[]>> {
  const ids=[...new Set((reviewIds||[]).map(String).filter(Boolean))].slice(0,100);
  if(!ids.length)return {};
  const {data,error}=await getKleenestSupabaseClient().rpc('mobile_review_photos_for_reviews',{p_review_ids:ids});
  if(error)throw error;
  const grouped:Record<string,ReviewPhoto[]>={};
  for(const row of Array.isArray(data)?data:[]){
    const id=String(row.review_id);
    (grouped[id] ||= []).push(publicPhoto(row));
  }
  return grouped;
}

export async function listReviewPhotos(reviewId: string): Promise<ReviewPhoto[]> {
  const grouped=await listReviewPhotosForReviews([reviewId]);
  return grouped[String(reviewId)]||[];
}
