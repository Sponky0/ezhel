import type { ImagePickerAsset } from "expo-image-picker";

// Derives a reliable file extension for a picked image/GIF so it is uploaded
// (and later served) with the correct content type — important for GIFs, which
// only animate when served as image/gif.
export function getAssetExtension(asset: ImagePickerAsset): string {
  if (asset.mimeType) {
    const m = asset.mimeType.toLowerCase();
    if (m.includes("gif")) return "gif";
    if (m.includes("png")) return "png";
    if (m.includes("webp")) return "webp";
    if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  }
  const fromName = asset.fileName?.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  const fromUri = asset.uri.split(".").pop()?.split("?")[0];
  if (fromUri && fromUri.length <= 5) return fromUri.toLowerCase();
  return "jpg";
}
