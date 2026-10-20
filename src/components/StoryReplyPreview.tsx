import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, type VideoThumbnail } from 'expo-video';
function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, p => { p.muted = true; });
  const [thumbnail, setThumbnail] = useState<VideoThumbnail | null>(null);
  useEffect(() => {
    let active = true; let started = false; let image: VideoThumbnail | undefined;
    const generate = async () => {
      if (started) return; started = true;
      try {
        [image] = await player.generateThumbnailsAsync(0, { maxWidth: 128, maxHeight: 160 });
        if (active && image) setThumbnail(image); else image?.release();
        if (active) await player.replaceAsync(null);
      } catch { /* A text fallback remains visible if the story was removed. */ }
    };
    const listener = player.addListener('statusChange', ({ status }) => { if (status === 'readyToPlay') void generate(); });
    if (player.status === 'readyToPlay') void generate();
    return () => { active = false; listener.remove(); if (started) image?.release(); };
  }, [player]);
  return thumbnail ? <Image source={thumbnail} style={{ width: 64, height: 80, borderRadius: 8 }} /> : <Text style={{ color: '#9caac4', fontSize: 11 }}>▶ Video hikâyesi</Text>;
}
export default function StoryReplyPreview({ uri, available }: { uri: string; available: boolean }) {
  const [failed, setFailed] = useState(false);
  const video = /\.(mp4|mov|m4v|webm|3gp)(?:\?|$)/i.test(uri);
  return <View style={{ padding: 6, borderLeftWidth: 2, borderLeftColor: '#899bbc', gap: 5 }}>
    <Text style={{ color: '#9caac4', fontSize: 11 }}>Hikâyeye yanıt</Text>
    {!available || failed ? <Text style={{ color: '#9caac4', fontSize: 11 }}>Hikâye önizlemesi artık kullanılamıyor.</Text>
      : video ? (Platform.OS === 'web' ? <Text style={{ color: '#9caac4' }}>▶ Video hikâyesi</Text> : <VideoPreview uri={uri} />)
        : <Image source={{ uri }} onError={() => setFailed(true)} style={{ width: 64, height: 80, borderRadius: 8 }} />}
  </View>;
}
