# 📱 Anonim Random Chat & Sesli Görüşme Uygulaması Özellik Listesi

### 1. 🌟 Ana Kullanıcı Deneyimi & Keşfet (Discovery & Feed)

- **Dinamik Kullanıcı Akışı:** Aynı anda 15 aktif ve güncel kullanıcının kartlar halinde sergilendiği akıllı listeleme.
- **VIP Algoritmik Önceliklendirme:** Listenin ilk 5 sırasının VIP üyelere ayrılarak VIP profillerin görünürlüğünün ve etkileşiminin artırılması.
- **Pull-to-Refresh & Tekrar Engelleyici:** Listenin aşağı çekilerek anlık yenilenmesi ve aynı kullanıcının üst üste gösterilmesini önleyen akıllı algoritma.
- **Canlılık Göstergesi:** Uygulama içerisindeki anlık aktif kullanıcı durumunu ve canlılığı hissettiren sayaç yapısı.

---

### 2. 🎙️ Sesli Random Eşleşme & WebRTC Arama Teknolojisi

- **Gerçek Zamanlı Anonim Eşleşme (Matchmaking):** Supabase Broadcast & Presence altyapısı ile kullanıcıların anında birebir sesli eşleşmesi.
- **Yüksek Kaliteli P2P HD Ses:** `react-native-webrtc` ve **Coturn (STUN/TURN)** sunucu entegrasyonu ile NAT/Firewall arkasındaki cihazlarda dahi kesintisiz sesli iletişim.
- **Akıllı Ses Yönlendirmesi (In-Call Manager):** Bluetooth kulaklık, kablolu kulaklık, ahize ve hoparlör arasında otomatik geçiş ve ses kontrolü.
- **Esnek Eşleşme Aksiyonları:** Eşleşme esnasında karşı tarafı **"Geç" (Skip)** veya **"Beğen" (Like)** seçenekleri ile hızlı arkadaşlık adımı atabilme.
- **VIP Cinsiyet Filtresi:** VIP kullanıcılara özel, eşleşmek istedikleri hedef cinsiyeti filtreleyebilme ayrıcalığı.
- **Yapay Zeka Bot Simülasyonu (Virtual Match):** Uygun gerçek kullanıcı bulunamadığında devreye giren ve kullanıcıyı beklemeden sesli eşleşme modunda tutan akıllı bot simülasyonu.
- **Dinamik Eşleşme Limitleri:** Standart kullanıcılar için günlük sınırlı ücretsiz eşleşme hakkı, VIP üyeler için sınırsız erişim.

---

### 3. 💬 Birebir Sohbet & Zengin Medya Paylaşımı (DM & Chat)

- **Realtime Anlık Mesajlaşma:** Supabase abonelikleri ile bekleme olmaksızın anlık mesaj iletimi.
- **Görsel & Medya Gönderimi:** Galeri veya kamera erişimi ile yüksek çözünürlüklü fotoğraf paylaşımı.
- **Elmas Hediyesi (Diamond Gifting):** Sohbet penceresi içerisindeki hediye modalı üzerinden doğrudan karşı tarafa elmas gönderebilme.
- **Kullanıcı Moderasyonu & Güvenlik:** Sohbet ekranından ayrılmadan tek tıkla engelleme (Block) ve şikayet (Report) imkanı.
- **Okunmamış Mesaj & Bildirim Rozetleri:** Uygulama içi rozet senkronizasyonu ve push notification (anlık bildirim) altyapısı.

---

### 4. 📸 Hikayeler & Öne Çıkarılanlar (Stories & Highlights)

- **24 Saatlik Hikaye Paylaşımı:** Kullanıcıların resim veya metin içerikli geçici hikaye (Story) yayınlayabilmesi.
- **Hikaye Etkileşimi:** Hikayeleri tam ekran izleme, süre takibi ve hikayeleri beğenebilme.
- **Öne Çıkarılan Hikayeler (Highlights):** Beğenilen veya özel hikayeleri profil detayında kalıcı olarak sabitleyebilme.

---

### 5. 💰 Profil, Bakiyeler & Monetizasyon (Gelir Modeli)

- **Kapsamlı Profil Özelleştirme:** Profil fotoğrafı, biyografi, yaş, şehir ve cinsiyet detaylarını düzenleme.
- **Elmas Ekonomisi & Cüzdan:** Elmas bakiyesi takibi, işlem geçmişi (kazanılan/harcanan elmaslar) ve hediyeleşme sistemi.
- **Nakit Çekim (Withdrawal) Sistemi:** Kullanıcıların sohbet ve hediyelerden kazandıkları elmasları IBAN bilgileri ile nakit paraya dönüştürebilme (para çekme talebi) altyapısı.
- **VIP Üyelik Paketi:**
  - Özel VIP Rozeti
  - Akışta ilk 5 sırada yer alma
  - Sınırsız sesli random eşleşme
  - Cinsiyet filtresi kullanabilme
  - Daha fazla story yayınlama hakkı
- **In-App Purchase (RevenueCat Entegrasyonu):** Google Play Billing ve Apple App Store uygulama içi satın alımlarına hazır altyapı.

---

### 6. 👑 Yönetici & Moderasyon Paneli (Admin Dashboard)

- **Genel Analitik & İstatistikler:** Aktif kullanıcılar, toplam aramalar, mesaj sayıları ve gelir özetleri.
- **Kullanıcı & VIP Yönetimi:** Kullanıcı arama, profil detaylarını inceleme, kullanıcı banlama/unban ve manuel VIP/Elmas tanımlama.
- **Yapay Zeka Bot Yönetim Merkezi:** AI bot profillerini oluşturma, sohbet/eşleşme davranışlarını ve otomatik yanıt mekanizmalarını yönetme.
- **Finansal Yönetim & Çekim Onayları:** Kullanıcıların IBAN para çekme taleplerini inceleme, onaylama veya reddetme.
- **Güvenlik & Silinen Mesaj Denetim Logları:** Kullanıcılar sohbet geçmişinden mesaj silse dahi moderasyon ve hukuki denetim amacıyla silinen mesajların admin panelinde kayıtlı tutulması.
- **Şikayet Moderasyonu:** Gelen kullanıcı şikayetlerini gerekçeleriyle inceleme ve doğrudan aksiyon alma.
- **Dinamik Sistem Konfigürasyonu:** Görüşme süre limitlerini, günlük ücretsiz eşleşme sayılarını, nakit çekim özelliğini ve lisans durumunu paneller üzerinden anlık değiştirebilme.

---

### 🛡️ 7. Güvenlik, Veritabanı & Mimari Üstünlükler

- **Hassas Veri İzolasyonu (Supabase RLS):** Kullanıcının kamuya açık profili (`profiles`) ile hassas verilerinin (`profiles_private`: e-posta, telefon vb.) Row Level Security ile ayrıştırılması.
- **Kod Güvenliği (Obfuscation):** Production sürümünde kodların tersine mühendislikle çözülmesini zorlaştıran `javascript-obfuscator` koruması.
- **Lisans Kontrol Altyapısı:** Uygulamanın yetkisiz kopyalanmasını önleyen uzaktan lisans doğrulama mekanizması.
- **Çoklu Platform (iOS & Android):** Expo ve React Native altyapısıyla her iki platformda da native performans.
