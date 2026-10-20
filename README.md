> Güncel Napan değişiklikleri, yerel test sonuçları ve mevcut Supabase projesine uygulama sırası: [Kullanıcı raporu uygulama kaydı](docs/KULLANICI_RAPORU_UYGULAMA.md). Yeni özellikler için backend geçişi ve yeni APK gerekir.

# 🎙️ Anonim Random Chat & Sesli Görüşme Uygulaması

Kullanıcıların anonim olarak birebir sesli eşleşebildiği, gerçek zamanlı sohbet edebildiği, hikaye (Story) paylaşabildiği ve elmas ekonomisi / VIP üyelik sistemi barındıran mobil ve web sosyal iletişim uygulaması.

---

## 🛠️ Teknolojik Altyapı

- **Mobil Framework:** [Expo SDK 56](https://expo.dev) + [Expo Router (v56.2)](https://docs.expo.dev/router/introduction/) (File-based Routing)
- **Backend & Veritabanı:** [Supabase](https://supabase.com) (PostgreSQL, Realtime Subscriptions, Edge Functions, Storage, RLS)
- **Sesli Görüşme (WebRTC):** `react-native-webrtc` + **Coturn (STUN/TURN)** Sunucu Entegrasyonu
- **Ses Cihazı Yönetimi:** `react-native-incall-manager` (Bluetooth, Kulaklık, Ahize & Hoparlör Geçişi)
- **Uygulama İçi Satın Alım (IAP):** `react-native-purchases` (RevenueCat)
- **Derleme:** Expo Metro/Hermes. Eski obfuscator SDK 56 eager paketlemesini bozduğu için devre dışıdır; yetkiler RLS ve sunucu işlemleriyle korunur.

---

## 📱 Ana Özellikler

1. **Keşfet & Akış (Discovery Feed):** Dinamik VIP öncelikli 15 aktif kullanıcı kartı ve canlılık göstergesi.
2. **Sesli Random Eşleşme (Matchmaking):** Supabase Presence/Broadcast altyapısı ile anlık P2P sesli arama, VIP cinsiyet filtresi ve sanal bot simülasyonu.
3. **DM & Zengin Sohbet:** Realtime mesajlaşma, fotoğraf paylaşımı, elmas hediyesi gönderme, engelleme/şikayet etme.
4. **Hikayeler & Öne Çıkarılanlar (Stories & Highlights):** 24 saatlik fotoğraflı/metinli hikayeler, beğeni ve profil sabitleme.
5. **Monetizasyon & Elmas Ekonomisi:** Elmas bakiyesi, hediyeleşme, nakit para çekim (IBAN) talepleri ve VIP üyelik rozeti.
6. **Yönetici Paneli (Admin Dashboard):** İstatistikler, kullanıcı/bot/şikayet yönetimi, silinen mesaj denetim logları, finansal onaylar ve sistem konfigürasyonu.

---

## 🚀 Kurulum ve Çalıştırma

### 1. Bağımlılıkları Yükleyin

```bash
npm install
```

### 2. Ortam Değişkenlerini Ayarlayın

Kök dizinde `.env` dosyasını oluşturun veya düzenleyin:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Geliştirme Sunucusunu Başlatın

```bash
# Expo Geliştirme Sunucusu
npx expo start

# Android Emülatör / Cihaz
npx expo run:android

# Web Sürümü
npm run web
```

---

## 📦 Derleme (EAS Build)

Derleme almak için Expo EAS CLI kullanabilirsiniz:

```bash
# EAS CLI Girişi
npx eas-cli login

# Test için APK Derlemesi (Preview Profile)
npx eas build --platform android --profile preview

# Mağaza için AAB Derlemesi (Production Profile)
npx eas-cli build --platform android --profile production

# Android Local APK
npm run build:android
cd android
./gradlew assembleRelease
```

UPDATE public.profiles
SET role = 'admin'
WHERE username = 'kullanici_adiniz';

---

## 📂 Proje Dizin Yapısı

```
random-chat/
├── assets/             # Görseller, ses dosyaları ve fontlar
├── docs/               # Proje dokümantasyonu (FEATURES, progress, roadmap, turn, buildmap)
├── src/
│   ├── app/            # Expo Router ekranları ((tabs), admin, chat-room, user-profile, voice-call)
│   ├── components/     # Arayüz bileşenleri ve /admin modülleri
│   ├── constants/      # Tema, ikonlar, lisans konfigürasyonu
│   ├── contexts/       # AuthContext, CallContext, ThemeContext, UnreadMessagesContext
│   ├── hooks/          # Custom hook'lar (useLicenseCheck, useNotifications vb.)
│   ├── lib/            # Supabase, storage, revenuecat, TURN ve yardımcı kütüphaneler
│   └── utils/          # Güvenlik ve yardımcı fonksiyonlar
├── supabase/           # SQL Şema, Edge Functions ve Migrasyonlar (0001-0028)
├── app.json            # Expo uygulama konfigürasyonu
├── eas.json            # EAS Build konfigürasyonu
└── metro.config.js     # Metro bundler & Obfuscator konfigürasyonu
```

---

## 📄 Dokümantasyon

Detaylı teknik dokümanlar `docs/` dizinindedir:

- [KURULUM_KILAVUZU.md](file:///c:/Users/Admin/HUB/random-chat/docs/KURULUM_KILAVUZU.md) — **A'dan Z'ye Tam Kurulum Kılavuzu (WebRTC, Coturn, Supabase, Android/iOS/Web Build)**
- [FEATURES.md](file:///c:/Users/Admin/HUB/random-chat/docs/FEATURES.md) — Kapsamlı özellik listesi
- [progress.md](file:///c:/Users/Admin/HUB/random-chat/docs/progress.md) — Geliştirme durumu ve mimari özet
- [roadmap.md](file:///c:/Users/Admin/HUB/random-chat/docs/roadmap.md) — Teknik borçlar ve gelecek planlar
- [buildmap.md](file:///c:/Users/Admin/HUB/random-chat/docs/buildmap.md) — EAS derleme rehberi
- [turn.md](file:///c:/Users/Admin/HUB/random-chat/docs/turn.md) — Coturn TURN sunucusu kurulum ve konfigürasyonu
