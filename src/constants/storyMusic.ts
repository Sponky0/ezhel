// Story'lere eklenebilecek hazır müzik parçaları.
//
// NOT: Aşağıdaki URL'ler test/demo amaçlı erişilebilir telifsiz örnek
// parçalardır (SoundHelix). Üretimde kendi lisanslı parçalarınızı kendi
// CDN'inize / Supabase Storage'a yükleyip bu listeyi güncelleyin.
export interface MusicTrack {
  title: string;
  url: string;
}

export const STORY_MUSIC: MusicTrack[] = [
  {
    title: "Chill Vibes",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  },
  {
    title: "Summer Nights",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  },
  {
    title: "Late Drive",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  },
  {
    title: "Golden Hour",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
  },
  {
    title: "Daydream",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3",
  },
  {
    title: "Neon Lights",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3",
  },
];
