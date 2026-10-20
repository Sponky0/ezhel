import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

// Maps a file extension to its MIME content type. Falls back to image/jpeg
// to preserve the original (image-only) behaviour for unknown extensions.
function getContentType(nameOrPath: string): string {
  const ext = (nameOrPath.split('.').pop() || '').toLowerCase().split('?')[0];
  switch (ext) {
    // Images
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    // Audio
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
    case 'mp4':
      return 'audio/mp4';
    case 'wav':
      return 'audio/wav';
    case 'aac':
      return 'audio/aac';
    case 'ogg':
      return 'audio/ogg';
    default:
      return 'image/jpeg';
  }
}

/**
 * Uploads a file from a React Native URI to a Supabase Storage bucket.
 *
 * @param bucket Name of the Supabase storage bucket (e.g. 'avatars', 'chat_media', 'stories')
 * @param path File path inside the bucket
 * @param uri React Native local file URI (from image/document picker)
 * @returns The public URL of the uploaded file
 */
export async function uploadFile(bucket: string, path: string, uri: string): Promise<string> {
  // Read file as Base64 using expo-file-system
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Convert Base64 to ArrayBuffer
  const arrayBuffer = decode(base64);

  // Determine content type from the destination path's extension (image or
  // audio). Using `path` (not the source uri) is more reliable because some
  // pickers return extension-less content:// uris.
  const contentType = getContentType(path);

  // Upload to Supabase Storage
  const { error } = await supabase.storage.from(bucket).upload(path, arrayBuffer, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw error;
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
  return publicUrl;
}
