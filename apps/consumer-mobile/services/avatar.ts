import * as ImagePicker from 'expo-image-picker';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

function extensionFor(asset: ImagePicker.ImagePickerAsset) {
  const fromName = asset.fileName?.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  const mime = asset.mimeType || '';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export async function chooseAndUploadAvatar() {
  const client = getKleenestSupabaseClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  const user = auth?.user;
  if (!user) throw new Error('Sign in to update your profile photo.');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.82,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  if (asset.fileSize != null && asset.fileSize > MAX_AVATAR_BYTES) {
    throw new Error('Profile photos must be 8 MB or smaller.');
  }

  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error('Selected profile photo could not be read.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_AVATAR_BYTES) throw new Error('Profile photos must be 8 MB or smaller.');

  const extension = extensionFor(asset);
  const objectPath = `${user.id}/avatar-${Date.now()}.${extension}`;
  const contentType = asset.mimeType || (extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg');
  const { error: uploadError } = await client.storage.from('avatars').upload(objectPath, bytes, { contentType, upsert: false });
  if (uploadError) throw uploadError;

  const { data: publicUrl } = client.storage.from('avatars').getPublicUrl(objectPath);
  const avatarUrl = publicUrl?.publicUrl;
  if (!avatarUrl) throw new Error('Profile photo URL could not be created.');

  const { error: profileError } = await client
    .from('profiles')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (profileError) throw profileError;

  return { avatarUrl, objectPath };
}
