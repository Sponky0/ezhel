# 🚀 Anonim Random Chat & Sesli Görüşme Uygulaması: A'dan Z'ye Tam Kurulum Kılavuzu

Bu kılavuz; uygulamanın **Supabase veritabanı ve servislerini**, **WebRTC ve Coturn (STUN/TURN) sunucu altyapısını**, **Android (APK & AAB)**, **iOS (TestFlight & App Store)** ve **Web (Firebase / Cloud)** derleme ve canlıya alma süreçlerini adım adım, eksiksiz bir şekilde açıklamaktadır.

---

## 📑 İçindekiler
1. [Sistem Mimarisi ve Teknoloji Yığını](#1-sistem-mimarisi-ve-teknoloji-yığını)
2. [Bölüm 1: Supabase Kurulumu ve Veritabanı Yapılandırması](#bölüm-1-supabase-kurulumu-ve-veritabanı-yapılandırması)
   - 1.1 Proje Oluşturma ve Ortam Değişkenleri
   - 1.2 Veritabanı Şeması ve Migrasyonların Uygulanması
   - 1.3 Supabase Storage (Depolama) Bucket'ları ve RLS Politikaları
   - 1.4 Supabase Realtime (Gerçek Zamanlı) Yapılandırması
   - 1.5 İlk Yönetici (Admin) Hesabının Yetkilendirilmesi
3. [Bölüm 2: WebRTC ve Coturn (STUN/TURN) Sunucu Kurulumu](#bölüm-2-webrtc-ve-coturn-stunturn-sunucu-kurulumu)
   - 2.1 WebRTC Bağlantı Mantığı ve Neden TURN Sunucusu Zorunludur?
   - 2.2 Linux (Ubuntu/Debian VPS) Üzerinde Coturn Kurulumu
   - 2.3 Let's Encrypt ile SSL/TLS Sertifikası Alma
   - 2.4 Coturn Konfigürasyon Dosyası (`turnserver.conf`)
   - 2.5 Güvenlik Duvarı (Firewall / UFW) Port İzinleri
   - 2.6 SSL Sertifika Otomatik Yenileme Kancası (Hook)
   - 2.7 Supabase Edge Function (`turn-credentials`) Kurulumu ve Dağıtımı
   - 2.8 WebRTC ve TURN Bağlantısının Doğrulanması (Trickle ICE)
4. [Bölüm 3: Android Uygulama Derleme (Build & Release)](#bölüm-3-android-uygulama-derleme-build--release)
   - 3.1 Ön Hazırlıklar ve Firebase Yapılandırması
   - 3.2 EAS Build ile Cloud Üzerinde Derleme (APK & AAB)
   - 3.3 Yerel (Local) Makinede Android Derleme (Gradle)
   - 3.4 Kod Karıştırma (Obfuscation) ve ProGuard/R8
5. [Bölüm 4: iOS Uygulama Derleme (Build & Release)](#bölüm-4-ios-uygulama-derleme-build--release)
   - 4.1 Apple Geliştirici Hesabı ve İzinler
   - 4.2 EAS Build ile Cloud Üzerinde iOS Derleme (Mac Gerekmeden)
   - 4.3 macOS ile Yerel Derleme (Xcode & CocoaPods)
6. [Bölüm 5: Web Uygulaması Derleme ve Yayınlama](#bölüm-5-web-uygulaması-derleme-ve-yayınlama)
   - 5.1 WebRTC Web Uyumluluğu ve HTTPS Zorunluluğu
   - 5.2 Web Çıktısı Üretme (Export)
   - 5.3 Firebase Hosting ile Canlıya Alma
   - 5.4 Nginx / Vercel / Cloudflare Pages Yapılandırması
7. [Bölüm 6: Hata Ayıklama (Troubleshooting) ve Kontrol Listesi](#bölüm-6-hata-ayıklama-troubleshooting-ve-kontrol-listesi)

---

## 1. Sistem Mimarisi ve Teknoloji Yığını

Uygulama modern ve performans odaklı bir teknoloji yığını üzerine inşa edilmiştir:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        İstemci Katmanı (Client)                        │
│   Expo SDK 56 + React Native 0.85 + React 19 + Expo Router (v56.2)     │
│   (Android, iOS ve Web Tek Kod Tabanında)                              │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼ (WebSocket & REST API)          ▼ (Peer-to-Peer Ses Akışı)
┌───────────────────────────────────────┐ ┌──────────────────────────────┐
│          Supabase Platformu           │ │     WebRTC Ses Altyapısı     │
│  - PostgreSQL + RLS Güvenlik          │ │  - react-native-webrtc       │
│  - Auth (Anonim, Email, Google OAuth) │ │  - InCallManager             │
│  - Realtime (Broadcast/Presence)      │ │  - Coturn (STUN/TURN/TURNS)  │
│  - Storage (avatars, stories, media)  │ │  - Dynamic HMAC-SHA1 Token   │
│  - Edge Functions (turn-credentials)  │ │    (Supabase Edge Function)  │
└───────────────────────────────────────┘ └──────────────────────────────┘
```

---

## Bölüm 1: Supabase Kurulumu ve Veritabanı Yapılandırması

### 1.1 Proje Oluşturma ve Ortam Değişkenleri
1. [supabase.com](https://supabase.com) adresine gidin ve yeni bir hesap veya organizasyon oluşturun.
2. **New Project** butonuna tıklayın:
   - **Name**: `random-chat` (veya istediğiniz isim)
   - **Database Password**: Güçlü bir şifre belirleyin ve güvenli bir yere kaydedin.
   - **Region**: Kullanıcı kitlenize en yakın bölgeyi seçin (Örn: Frankfurt - Central EU).
3. Projeniz oluşturulduktan sonra **Project Settings -> API** sekmesine gidin.
4. Buradan şu değerleri kopyalayın:
   - **Project URL**: `https://<proje-ref>.supabase.co`
   - **Project API Keys -> `anon` `public`**: İstemci için anon anahtarı.
5. Proje kök dizinindeki `.env` dosyasını oluşturun/düzenleyin:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://<proje-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpX...
   ```
6. Aynı değerleri `eas.json` dosyasındaki `preview` ve `production` profillerinin `env` alanına da ekleyin.

---

### 1.2 Veritabanı Şeması ve Migrasyonların Uygulanması

Veritabanı tablolarını, tetikleyicilerini, RLS güvenlik politikalarını ve yardımcı fonksiyonları kurmak için iki yöntem mevcuttur:

#### Yöntem A: Supabase Dashboard SQL Editör (En Hızlı Yöntem)
1. Supabase Dashboard'da sol menüden **SQL Editor** sekmesine gidin.
2. **New Query** butonuna tıklayın.
3. Proje dizinindeki [`supabase/schema.sql`](file:///c:/Users/Admin/HUB/random-chat/supabase/schema.sql) dosyasının tüm içeriğini kopyalayıp SQL editöre yapıştırın ve **Run** butonuna basın.
4. Sırasıyla [`supabase/migrations/`](file:///c:/Users/Admin/HUB/random-chat/supabase/migrations/) klasöründeki ek sql dosyalarını (0001'den 0029'a kadar) çalıştırın.

#### Yöntem B: Supabase CLI ile Senkronizasyon (Geliştiriciler İçin)
1. Supabase CLI'ı yükleyin:
   ```powershell
   npm install -g supabase
   ```
2. Supabase hesabınıza CLI üzerinden giriş yapın:
   ```powershell
   npx supabase login
   ```
3. Projenizi yerel depoyla bağlayın (`<project-ref>` Dashboard URL'sindeki benzersiz koddur):
   ```powershell
   npx supabase link --project-ref <proje-ref>
   ```
4. Tüm migrasyonları tek komutla uzaktaki veritabanına uygulayın:
   ```powershell
   npx supabase db push
   ```

#### Oluşturulan Başlıca Tablolar:
- `profiles`: Kullanıcı profilleri, rolleri (`user`/`admin`), VIP durumu, cinsiyet, elmas bakiyesi, çevrimiçi durumu.
- `stories` & `story_likes`: 24 saatlik kaybolan hikayeler ve beğeniler.
- `conversations` & `conversation_participants`: Birebir sohbet odaları ve son okunma zamanları.
- `messages`: DM mesajları (soft-delete destekli, admin denetimi için).
- `blocks` & `reports`: Kullanıcı engelleme ve moderasyon şikayetleri.
- `daily_matches`: VIP olmayan kullanıcılar için günlük 5 eşleşme kotası takibi.
- `system_settings`: Dinamik ayarlar (`voice_chat_limit`, `diamond_unit_price` vb.).
- `diamond_transactions`, `diamond_packages`, `diamond_withdrawal_requests`: Elmas satın alımı, hediyeleşme ve IBAN nakit çekim sistemi.

---

### 1.3 Supabase Storage (Depolama) Bucket'ları ve RLS Politikaları

Uygulama profil fotoğrafları, hikayeler ve sohbet görselleri için 3 farklı depolama alanına ihtiyaç duyar.

1. Supabase Dashboard'da **Storage** sekmesine gidin.
2. **New Bucket** diyerek aşağıdaki 3 adet bucket'ı oluşturun:
   - **`avatars`** (Public bucket kutucuğunu **İŞARETLEYİN**)
   - **`chat_media`** (Public bucket kutucuğunu **İŞARETLEYİN**)
   - **`stories`** (Public bucket kutucuğunu **İŞARETLEYİN**)
3. **Storage Policies (RLS)** Yapılandırması:
   Sol alttan **Storage -> Policies** sekmesine gidin ve bu 3 bucket için aşağıdaki izinleri ekleyin:
   - **SELECT (Okuma)**: Herkes okuyabilir (`anon` ve `authenticated` rolleri için `true`).
   - **INSERT (Yükleme)**: Yalnızca giriş yapmış kullanıcılar yükleyebilir (`auth.role() = 'authenticated'`).
   - **UPDATE / DELETE**: Yalnızca dosya sahibi silebilir veya güncelleyebilir (`auth.uid() = owner`).

İsterseniz bunu doğrudan **SQL Editor** üzerinden şu SQL ile topluca yapabilirsiniz:
```sql
-- Storage bucket'larını oluştur
insert into storage.buckets (id, name, public)
values 
  ('avatars', 'avatars', true),
  ('chat_media', 'chat_media', true),
  ('stories', 'stories', true)
on conflict (id) do update set public = true;

-- Okuma Politikası (Herkes erişebilir)
create policy "Public Access avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "Public Access chat_media" on storage.objects for select using (bucket_id = 'chat_media');
create policy "Public Access stories" on storage.objects for select using (bucket_id = 'stories');

-- Yükleme Politikası (Giriş yapmış kullanıcılar yükleyebilir)
create policy "Auth Upload avatars" on storage.objects for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
create policy "Auth Upload chat_media" on storage.objects for insert with check (bucket_id = 'chat_media' and auth.role() = 'authenticated');
create policy "Auth Upload stories" on storage.objects for insert with check (bucket_id = 'stories' and auth.role() = 'authenticated');
```

---

### 1.4 Supabase Realtime (Gerçek Zamanlı) Yapılandırması

Uygulama, hem **PostgreSQL veritabanı değişikliklerini dinlemek (CDC)** hem de **eşleşme/sesli arama sinyalleşmesi (Broadcast & Presence)** için Supabase Realtime kullanır.

1. Supabase Dashboard -> **Database** -> **Replication** sayfasına gidin.
2. **Source: supabase_realtime** bölümünde aşağıdaki tabloların sağındaki Realtime toggle anahtarını **aktif (ON)** konuma getirin:
   - `messages` (yeni mesajların anlık düşmesi)
   - `conversations` ve `conversation_participants` (sohbet listesi güncellemesi)
   - `profiles` (çevrimiçi durumları ve VIP güncellemeleri)
   - `stories` (yeni hikayelerin anlık akması)
   - `system_settings` (sistem bakım modu veya süre limiti değişiklikleri)
   - `daily_matches` (kullanıcı haklarının anlık güncellenmesi)
3. SQL ile tek seferde açmak için:
   ```sql
   alter publication supabase_realtime add table public.messages;
   alter publication supabase_realtime add table public.conversations;
   alter publication supabase_realtime add table public.conversation_participants;
   alter publication supabase_realtime add table public.profiles;
   alter publication supabase_realtime add table public.stories;
   alter publication supabase_realtime add table public.system_settings;
   alter publication supabase_realtime add table public.daily_matches;
   ```
4. **Broadcast & Presence**:
   - `matchmaking`: Eşleşme havuzundaki kullanıcıların anlık takibi.
   - `user_calls:<user_id>`: Gelen sesli arama bildirimleri.
   - `signaling:<user1>_<user2>`: WebRTC SDP teklif/yanıt ve ICE adaylarının iletimi.
   *(Bu kanallar Supabase Realtime motoru tarafından otomatik olarak işlenir, ek veritabanı tablosu gerektirmez).*

---

### 1.5 İlk Yönetici (Admin) Hesabının Yetkilendirilmesi

Uygulamada admin paneline (`/admin`) erişebilmek için:
1. Uygulamayı açıp normal bir şekilde hesap oluşturun (Örn. kullanıcı adı: `superadmin`).
2. Supabase **SQL Editor** üzerinden kullanıcı rolünü admin olarak güncelleyin:
   ```sql
   update public.profiles
   set role = 'admin'
   where username = 'superadmin';
   ```
3. Artık kullanıcı uygulamada profil sekmesinden veya doğrudan `/admin` rotasından yönetim paneline (istatistikler, şikayetler, bot yönetimi, para çekme onayları, lisans ayarları) erişebilir.

---

## Bölüm 2: WebRTC ve Coturn (STUN/TURN) Sunucu Kurulumu

### 2.1 WebRTC Bağlantı Mantığı ve Neden TURN Sunucusu Zorunludur?

WebRTC iki cihaz arasında doğrudan (Peer-to-Peer) ses aktarımı sağlar. Ancak:
- Kullanıcıların %80'den fazlası mobil veri (4G/5G) veya kurumsal Wi-Fi ağlarındadır. Bu ağlar **Symmetric NAT** ve **CGNAT (Carrier-Grade NAT)** arkasındadır.
- Normal STUN sunucuları (Google vb.) Symmetric NAT arkasındaki mobil cihazların genel IP ve port eşleşmesini çözemez ve **ICE Bağlantısı Başarısız Olur (ICE Connection Failed)**.
- **Coturn TURN Sunucusu**, doğrudan bağlantı kurulamayan durumlarda ses paketlerini şifreli olarak kendi üzerinden aktarır (Relay) ve bağlantı başarısını %99.9'a çıkarır.

---

### 2.2 Linux (Ubuntu/Debian VPS) Üzerinde Coturn Kurulumu

Kiraladığınız bir Linux VPS sunucusunda (Hetzner, DigitalOcean, AWS, Linode vb.) root yetkisiyle terminali açın:

```bash
# 1. Paket listelerini güncelleyin ve Coturn ile Certbot'u yükleyin
sudo apt update && sudo apt upgrade -y
sudo apt install -y coturn certbot

# 2. Coturn servisinin sistem başlangıcında açılmasını etkinleştirin
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
```

---

### 2.3 Let's Encrypt ile SSL/TLS Sertifikası Alma

Coturn'un güvenli `turns:` (Port 5349) protokolü üzerinden çalışması için geçerli bir SSL sertifikası gerekir.

1. Alan adınızın DNS yönetim panelinden bir **A Kaydı** açın:
   - Host: `turn` (veya `turnserver`)
   - Değer: VPS sunucunuzun Statik IPv4 Adresi (Örn: `turn.sitedomain.com`)
2. Sunucunuzda Let's Encrypt sertifikasını oluşturun:
   ```bash
   sudo certbot certonly --standalone -d turn.sitedomain.com
   ```
   *(Eğer 80 portunda Nginx/Apache çalışıyorsa önce `systemctl stop nginx` yapın, sertifikayı aldıktan sonra tekrar başlatın).*

---

### 2.4 Coturn Konfigürasyon Dosyası (`turnserver.conf`)

Let's Encrypt sertifikalarını Coturn'un yetki sahibi olduğu bir klasöre kopyalayın:
```bash
sudo mkdir -p /etc/coturn/certs
sudo cp /etc/letsencrypt/live/turn.sitedomain.com/fullchain.pem /etc/coturn/certs/
sudo cp /etc/letsencrypt/live/turn.sitedomain.com/privkey.pem /etc/coturn/certs/
sudo chown -R turnserver:turnserver /etc/coturn/certs
sudo chmod 640 /etc/coturn/certs/*
```

Güçlü bir **statik secret anahtarı** üretin (Bu anahtarı Supabase Edge Function'da da kullanacağız):
```bash
openssl rand -hex 32
# Örnek Çıktı: 4a8f9c2d7e1b5a0f6e3c8d2a1b9f4e7c8a0d2f4b6e8a1c3e5f7a9b0c2d4e6f8a
```

Şimdi `/etc/turnserver.conf` dosyasını düzenleyin:
```bash
sudo nano /etc/turnserver.conf
```
Dosyanın içeriğini temizleyin veya aşağıdaki yapılandırmayı yapıştırın:

```ini
# ===================================================
# Coturn TURN/STUN Server Configuration
# ===================================================

# Dinleme Portları
listening-port=3478
tls-listening-port=5349

# Sunucunun Dış IP Adresi (Opsiyonel ama önerilir: external-ip=VPS_PUBLIC_IP)
# external-ip=203.0.113.10

# Alan Adı (Realm)
realm=turn.sitedomain.com
server-name=turn.sitedomain.com

# Kimlik Doğrulama: Supabase ile dinamik zaman kısıtlı token (HMAC-SHA1)
use-auth-secret
static-auth-secret=BURAYA_URETTIGINIZ_32_KARAKTER_SECRET_YAZIN

# Relay Port Aralığı (UDP)
min-port=49152
max-port=65535

# TLS / DTLS Sertifikaları
cert=/etc/coturn/certs/fullchain.pem
pkey=/etc/coturn/certs/privkey.pem

# Güvenlik & Performans Optimizasyonları
fingerprint
lt-cred-mech
no-cli
no-loopback-peers
no-multicast-peers
stale-nonce=600

# Log Ayarları
log-file=/var/log/turnserver/turnserver.log
verbose
```

---

### 2.5 Güvenlik Duvarı (Firewall / UFW) Port İzinleri

Coturn'un çalışabilmesi için hem işletim sistemi güvenlik duvarında (UFW) hem de bulut sağlayıcınızın (AWS Security Group, Hetzner Firewall vb.) yönetim panelinde şu portları açmalısınız:

```bash
# STUN & TURN Standart Portları
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp

# Güvenli TURNS (TLS) Portları
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp

# WebRTC Medya Relay Port Aralığı (UDP)
sudo ufw allow 49152:65535/udp

# Güvenlik duvarını etkinleştirin
sudo ufw reload
```

---

### 2.6 SSL Sertifika Otomatik Yenileme Kancası (Hook)

Let's Encrypt sertifikaları her 90 günde bir yenilendiğinde Coturn'un yeni sertifikaları otomatik alması için bir script tanımlayın:

```bash
sudo nano /etc/letsencrypt/renewal-hooks/deploy/coturn-copy-cert.sh
```
İçerisine şu satırları yapıştırın:
```bash
#!/bin/bash
DOMAIN="turn.sitedomain.com"
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /etc/coturn/certs/fullchain.pem
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem /etc/coturn/certs/privkey.pem
chown -R turnserver:turnserver /etc/coturn/certs
chmod 640 /etc/coturn/certs/*
systemctl restart coturn
```
Çalıştırma izni verin:
```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/coturn-copy-cert.sh
```

Coturn servisini başlatın ve durumunu kontrol edin:
```bash
sudo systemctl restart coturn
sudo systemctl status coturn
```

---

### 2.7 Supabase Edge Function (`turn-credentials`) Kurulumu ve Dağıtımı

Uygulama, güvenliği sağlamak için TURN sunucusunun kalıcı şifresini istemciye asla göndermez. Bunun yerine her kullanıcı arama yaparken **Supabase Edge Function**'a gider ve o kullanıcıya özel, 10 dakika geçerli bir HMAC-SHA1 geçici giriş jetonu üretilir.

Edge Function kodu projenizde hazır durumdadır: [`supabase/functions/turn-credentials/index.ts`](file:///c:/Users/Admin/HUB/random-chat/supabase/functions/turn-credentials/index.ts).

1. Terminalde proje kök dizinine gelin.
2. Supabase projenize Edge Function gizli ortam değişkenlerini tanımlayın:
   ```powershell
   npx supabase secrets set TURN_SECRET="BURAYA_COTURN_SECRET_YAZIN" TURN_DOMAIN="turn.sitedomain.com" TURN_TTL_SECONDS="600"
   ```
3. Edge Function'ı canlıya yükleyin (Deploy):
   ```powershell
   npx supabase functions deploy turn-credentials
   ```
4. Artık istemci arama başlatırken [`src/lib/turn.ts`](file:///c:/Users/Admin/HUB/random-chat/src/lib/turn.ts) dosyası bu fonksiyonu çağırarak aşağıdaki ICE listesini dinamik olarak alır:
   - `stun:turn.sitedomain.com:3478`
   - `turn:turn.sitedomain.com:3478?transport=udp`
   - `turn:turn.sitedomain.com:3478?transport=tcp`
   - `turns:turn.sitedomain.com:5349?transport=tcp`

---

### 2.8 WebRTC ve TURN Bağlantısının Doğrulanması (Trickle ICE)

Kurulumunuzun çalıştığını test etmek için:
1. Tarayıcınızda [Trickle ICE Test Aracını](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) açın.
2. Test formuna TURN sunucu adresinizi ekleyin:
   - STUN or TURN URI: `turn:turn.sitedomain.com:3478?transport=udp`
   - TURN username: `test`
   - TURN password: `test` *(veya Edge Function'dan dönen geçerli bir username/credential ikilisi)*
3. **Gather candidates** butonuna basın. Listede Type sütununda `relay` görüyorsanız TURN sunucunuz başarıyla dinliyor ve paket yönlendiriyor demektir.
4. Ayrıca sunucuda logları canlı izleyebilirsiniz:
   ```bash
   sudo tail -f /var/log/turnserver/turnserver.log
   ```

---

## Bölüm 3: Android Uygulama Derleme (Build & Release)

### 3.1 Ön Hazırlıklar ve Firebase Yapılandırması

1. **`google-services.json`**:
   - Firebase Console'dan Android uygulaması (`com.randomchatapp.rancha`) oluşturun.
   - İndirdiğiniz `google-services.json` dosyasını proje kök dizinine yerleştirin.
2. **Gerekli Android İzinleri**:
   [`app.json`](file:///c:/Users/Admin/HUB/random-chat/app.json) dosyasında WebRTC ve InCallManager için gerekli tüm izinler (`CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `BLUETOOTH_CONNECT`, `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`) tanımlanmıştır.
3. Bağımlılıkları kontrol edin:
   ```powershell
   npm install
   ```

---

### 3.2 EAS Build ile Cloud Üzerinde Derleme (Önerilen)

EAS Build, yerel bilgisayarınızda Java/Android SDK kurulumu gerektirmeden Expo bulut sunucularında derleme yapar.

#### 1. EAS CLI Girişi:
```powershell
npx eas-cli login
npx eas-cli whoami
```

#### 2. Test İçin Doğrudan Telefona Yüklenebilir APK:
`eas.json` dosyasında `preview` profili `"buildType": "apk"` olarak ayarlanmıştır.
```powershell
npx eas-cli build --platform android --profile preview
```
*Derleme tamamlandığında terminalde bir **QR kod** ve `.apk` indirme linki verilecektir.*

#### 3. Google Play Store İçin AAB (Android App Bundle):
```powershell
npx eas-cli build --platform android --profile production
```

---

### 3.3 Yerel (Local) Makinede Android Derleme (Gradle)

Bilgisayarınızda Android Studio, Android SDK ve Java JDK (JDK 17 önerilir) kuruluysa yerel derleme alabilirsiniz:

#### Seçenek A: EAS Local Build
```powershell
npx eas-cli build --platform android --profile preview --local
```

#### Seçenek B: Expo Prebuild ve Doğrudan Gradle Derlemesi
1. Eski native klasörü temizleyip baştan oluşturun (Prebuild):
   ```powershell
   # PowerShell'de:
   Remove-Item -Path "android" -Force -Recurse -ErrorAction SilentlyContinue
   npx expo prebuild --platform android --clean
   ```
2. Gradle ile Release APK derleyin:
   ```powershell
   cd android
   .\gradlew.bat assembleRelease
   cd ..
   ```
3. Üretilen APK dosyasının konumu:
   `android/app/build/outputs/apk/release/app-release.apk`

---

### 3.4 Kod Karıştırma (Obfuscation) ve ProGuard/R8

- [`metro.config.js`](file:///c:/Users/Admin/HUB/random-chat/metro.config.js) dosyasında `obfuscator-io-metro-plugin` entegre edilmiştir. `production` veya `preview` profillerinde JavaScript bundle'ı otomatik olarak şifrelenir ve tersine mühendisliğe karşı korunur.
- [`app.json`](file:///c:/Users/Admin/HUB/random-chat/app.json) dosyasında `enableMinifyInReleaseBuilds: true` ve `enableShrinkResourcesInReleaseBuilds: true` aktiftir.

---

## Bölüm 4: iOS Uygulama Derleme (Build & Release)

### 4.1 Apple Geliştirici Hesabı ve İzinler

- iOS derlemesi için aktif bir **Apple Developer Account** (Geliştirici Hesabı) gereklidir.
- Bundle Identifier: `com.randomchatapp.rancha`
- [`app.json`](file:///c:/Users/Admin/HUB/random-chat/app.json) dosyasında iOS için kamera ve mikrofon kullanım izin açıklamaları (`cameraPermission`, `microphonePermission`) eksiksiz tanımlanmıştır.

---

### 4.2 EAS Build ile Cloud Üzerinde iOS Derleme (Mac Gerekmeden)

EAS Build sayesinde Windows veya Linux kullanırken bile Apple sunucularına gönderilecek iOS sürümleri oluşturabilirsiniz:

1. **Test İçin (Internal / TestFlight):**
   ```powershell
   npx eas-cli build --platform ios --profile preview
   ```
   *(İlk çalıştırmada EAS sizden Apple ID ve şifrenizi isteyerek sertifikaları ve Provisioning Profile'ları otomatik oluşturur).*
2. **App Store Dağıtımı İçin (Production):**
   ```powershell
   npx eas-cli build --platform ios --profile production
   ```
3. Otomatik App Store Connect yüklemesi için:
   ```powershell
   npx eas-cli submit --platform ios
   ```

---

### 4.3 macOS ile Yerel Derleme (Xcode & CocoaPods)

Eğer bir Mac bilgisayarda yerel olarak derleme almak isterseniz:
1. Native iOS klasörünü oluşturun:
   ```bash
   npx expo prebuild --platform ios --clean
   ```
2. CocoaPods bağımlılıklarını yükleyin:
   ```bash
   cd ios && pod install && cd ..
   ```
3. Simülatörde veya bağlı cihazda çalıştırın:
   ```bash
   npx expo run:ios --configuration Release
   ```
   *Veya `ios/napan.xcworkspace` dosyasını Xcode ile açarak **Product -> Archive** menüsünden App Store için paketleyin.*

---

## Bölüm 5: Web Uygulaması Derleme ve Yayınlama

Uygulama, **Expo Router Web** ve **React Native Web** sayesinde tam web uyumluluğuna sahiptir. WebRTC çağrıları tarayıcıda standart W3C `window.RTCPeerConnection` ve `navigator.mediaDevices.getUserMedia` API'lerini kullanır.

> [!IMPORTANT]
> **HTTPS Zorunluluğu**: WebRTC mikrofon erişimi modern tarayıcılarda güvenlik gereği yalnızca `https://` veya `http://localhost` üzerinde çalışır. Canlı web sürümünüz mutlaka geçerli bir SSL sertifikasına sahip olmalıdır.

---

### 5.1 Web Sürümünü Yerel Olarak Test Etme
Geliştirme aşamasında web arayüzünü açmak için:
```powershell
npm run web
```
Tarayıcınızda `http://localhost:8081` adresinde uygulama açılacaktır.

---

### 5.2 Statik Web Çıktısı Üretme (Export)

Tüm sayfaları, stilleri ve optimize edilmiş JavaScript dosyalarını paketlemek için:
```powershell
npx expo export -p web
```
Bu komut proje kök dizininde yayına hazır bir **`dist`** klasörü oluşturur.

---

### 5.3 Firebase Hosting ile Canlıya Alma

Projede [`firebase.json`](file:///c:/Users/Admin/HUB/random-chat/firebase.json) ve [`.firebaserc`](file:///c:/Users/Admin/HUB/random-chat/.firebaserc) dosyaları mevcuttur.

1. Firebase CLI'ı yükleyin ve giriş yapın:
   ```powershell
   npm install -g firebase-tools
   firebase login
   ```
2. `firebase.json` dosyasında `public` dizininin `dist` olduğundan emin olun:
   ```json
   {
     "hosting": {
       "public": "dist",
       "ignore": [
         "firebase.json",
         "**/.*",
         "**/node_modules/**"
       ],
       "rewrites": [
         {
           "source": "**",
           "destination": "/index.html"
         }
       ]
     }
   }
   ```
3. Tek komutla Firebase Hosting'e yükleyin:
   ```powershell
   npx expo export -p web
   firebase deploy --only hosting
   ```

---

### 5.4 Nginx / Vercel / Cloudflare Pages Yapılandırması

Eğer web sürümünü kendi Linux sunucunuzda **Nginx** ile yayınlamak isterseniz, SPA (Single Page Application) yönlendirmesi için konfigürasyonunuz şöyle olmalıdır:

```nginx
server {
    listen 443 ssl http2;
    server_name chat.sitedomain.com;

    ssl_certificate /etc/letsencrypt/live/chat.sitedomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.sitedomain.com/privkey.pem;

    root /var/www/random-chat/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Gzip sıkıştırma
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

---

## Bölüm 6: Hata Ayıklama (Troubleshooting) ve Kontrol Listesi

### 🛠️ Sık Karşılaşılan Sorunlar ve Çözümleri

| Sorun | Olası Neden | Çözüm Adımı |
| :--- | :--- | :--- |
| **Ses Gitmiyor / Gelmiyor (Bağlanıyor'da kalıyor)** | 1. TURN sunucusu kapalı veya portları güvenlik duvarında engelli.<br>2. Supabase Edge function `turn-credentials` yetkisiz. | 1. VPS'te `sudo systemctl status coturn` ve `sudo ufw status` kontrol edin.<br>2. Trickle ICE ile relay adaylarının üretildiğini doğrulayın.<br>3. `supabase secrets list` ile `TURN_SECRET` ve `TURN_DOMAIN`'in doğru girildiğini kontrol edin. |
| **Android 12+ Cihazlarda Ses Çıkmıyor** | Bluetooth izinleri eksik. | Uygulama açılışında `BLUETOOTH_CONNECT` izninin kullanıcıya sorulduğundan emin olun (`requestBluetoothPermission` CallContext içinde mevcuttur). |
| **Ses Ahizeden Değil Hoparlörden Geliyor** | InCallManager veya expo-audio başlatılamadı. | `setupWebRTC` fonksiyonunda InCallManager'ın çağrıldığından ve `setSpeakerphoneOn(false)` varsayılanında olduğundan emin olun. |
| **Resim Yüklenirken 403 Forbidden Hatası** | Supabase Storage RLS politikaları veya Public ayarı eksik. | `avatars`, `chat_media` ve `stories` bucket'larının "Public" yapıldığından ve INSERT politikasının eklendiğinden emin olun. |
| **Mesajlar Anlık Düşmüyor (Sayfa yenilenince geliyor)** | Supabase Replication sekmesinde `messages` tablosu aktif değil. | Dashboard -> Database -> Replication -> `messages` tablosunu Realtime için aktif edin. |
| **Android Release APK Açılır Açılmaz Kapanıyor** | Hermes ve Obfuscator uyumsuzluğu veya eksik ProGuard kuralı. | `metro.config.js`'deki `controlFlowFlattening: false` ayarını koruyun ve `android/app/proguard-rules.pro` kurallarını inceleyin. |

---

### ✅ Canlıya Çıkış Kontrol Listesi (Deployment Checklist)

- [ ] **Supabase**: Proje oluşturuldu, `schema.sql` ve migrasyonlar (0001-0029) eksiksiz uygulandı.
- [ ] **Supabase Realtime**: `messages`, `profiles`, `conversations`, `stories`, `system_settings` tabloları açıldı.
- [ ] **Supabase Storage**: `avatars`, `chat_media`, `stories` bucket'ları Public olarak açıldı ve RLS ilkeleri tanımlandı.
- [ ] **Coturn Sunucusu**: Linux VPS'te kuruldu, SSL alındı, 3478/5349 ve 49152-65535 portları açıldı.
- [ ] **Edge Function**: `turn-credentials` fonksiyonu Supabase'e deploy edildi ve secret'lar (`TURN_SECRET`, `TURN_DOMAIN`) tanımlandı.
- [ ] **Ortam Değişkenleri**: `.env` ve `eas.json` dosyalarındaki `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_ANON_KEY` güncellendi.
- [ ] **Firebase**: `google-services.json` dosyası kök dizine eklendi.
- [ ] **Admin Hesabı**: İlk admin kullanıcısının rolü `admin` olarak güncellendi.
- [ ] **Derleme Testi**: `npx eas-cli build --platform android --profile preview` ile test APK üretildi ve gerçek cihazda sesli arama test edildi.
