# Napan: tasarım ve arama güncellemesi v2

21 Ekim 2026. Bu değişiklik önceki kullanıcı raporu güncellemesinin üzerine hazırlanmıştır. Önceki SQL ve iki Edge Function’ın kullanıcı tarafından uygulandığı bildirildi; bu **yeni** geçiş henüz canlıda uygulanmadı.

## Tasarım

Ortak renk sistemi gece laciverti, sıcak mercan, az miktarda lavantadan oluşur. Metin vurgusu ile buton dolgusu ayrı renktir; butonlarda okunabilir beyaz metin korunur. Inter yazı ailesi, dengeli başlıklar, 44–48 px dokunma alanları, 14–20 px köşeler kullanıldı. Büyük blur yüzeyleri, maskot ve gösterişli efektler azaltıldı. Yeni kurulum varsayılan koyu temadır; kullanıcının kaydettiği açık/sistem tercihi korunur.

- Keşfet: Napan işareti, kısa başlık, belirgin arama alanı, daha büyük fotoğraf kartları, sade öne çıkarma kartı.
- Profil: geniş gerçek profil fotoğrafı, biyografi, düzenle düğmesi ve altında yeni istatistikler.
- Diğer profil: bulanık ve tekrarlanan fotoğraf yerine temiz kapak; gerçek veriler. Önceki şablondaki kullanıcı kimliğinden uydurulan yaş/ülke/ilgi alanları kaldırıldı. Eksik bilgi “belirtilmemiş” olarak gösterilir.
- Sohbet listesi, mesaj ekranı, hikâyeler, sesli görüşme/eşleşme, giriş-kayıt ve ortak modal/medya/sosyal bileşenleri aynı palete uyarlandı. Arama ekranının tam ekran bulanık arka planı kaldırıldı.
- Mobil menü sırası Keşfet, Sohbetler, Eşleş, Hikâyeler, Profil. Native menüde geniş dokunma alanları; mobil web’de ikonlara metin etiketleri eklendi.
- Hikâye videosu, sekme odağı kaybolunca veya doğrudan görüşme başlayınca durdurulur; başka ekranın ses oturumuyla çakışmaz.

## Profil sayıları

Görünür sıra **Takipçiler · Süper mesaj · Beğeni**. Takip edilen sayısı ve listesi kullanıcı arayüzünden kaldırıldı. Takip et/bırak ilişkisi ve takipçi listesi korunur.

**Süper mesaj tanımı:** Keşfet’te aktif öne çıkarma kartından başlatılan boş birebir sohbette, ziyaretçinin boost süresi içinde gönderdiği ilk gerçek mesaj bir süper mesaj sayılır. Metin veya medya olabilir. Kartı açmak, boş sohbet oluşturmak, kendi kendine mesaj ve normal profilden/sohbet listesinden gelen mesaj sayılmaz. Aynı sohbetin sonraki mesajları ve tekrar kart tıklamaları sayıyı artırmaz. Önceden mesajlaşılmış sohbetler yeni kazanım sayılmaz. Süresi dolmuş boost kartından normal sohbete geçilir, süper mesaj yazılmaz. Sayaç istemcinin değiştiremediği sunucu tablosu ve tetikleyiciyle tutulur.

**Beğeni tanımı:** Gelen hikâye beğenileri, benzersiz hikâye–beğenen kişi çifti olarak kalıcı geçmişe yazılır. Beğeniyi kaldırıp yeniden eklemek sayıyı şişirmez; kendine beğeni sayılmaz. Hikâye silinse bile geçmiş toplam korunur. Geçiş mevcut hikâye beğenilerini aktarır; daha önce silinmiş ve kaydı olmayan hikâyelerin eski beğenileri uydurulmaz. Bu, o an aktif beğeni sayısından farklı olarak birikimli hikâye beğenisi geçmişidir.

## Aramada giderilen nedenler

1. Tek seferlik `join`/SDP broadcast geç katılan cihazda kaybolabiliyordu. Ortak sinyal oturumu hazır mesajını tekrar gönderir; teklif/cevabı önbellekten yeniden yollar. Yinelenen hazır mesajı yeni `createOffer` üretmez; yinelenen SDP ve ICE adayları ayıklanır. Hata ve kapanışta zamanlayıcılar kapatılır.
2. Doğrudan aramalar her oturumda benzersiz oda kullanır. Önceki görüşmenin gecikmiş temizliği yeni oturumu kapatamaz; iptal edilmiş kurulumun geç dönen mikrofon akışı durdurulur. Aynı gelen aramanın push/Realtime kopyası “meşgul” üretmez.
3. TURN hizmeti hatasında sessiz STUN-only düşüşü kaldırıldı. Geçerli kullanıcıya ait, süresi dolmamış TURN bilgisi gerekir. Hata açıklanır; tekrar denemede başka hesabın bilgisi kullanılmaz. Erişim bilgileri kayda yazılmaz.
4. Rastgele eşleşmede istemcilerin Presence listesinden farklı kişiler seçmesi önlendi. `join_voice_match` sunucuda kilitli kuyruk satırlarıyla tek eşleşme ve ortak oda verir. Bir kişi aynı anda iki eşleşmeye ayrılamaz; engel, karşılıklı cinsiyet tercihi, arama gizliliği, yasak ve kota sunucuda kontrol edilir. Yönetici de açıkça kuyruğa girerek test edebilir; botlar gerçek ses eşleşmesine alınmaz.
5. Günlük hak, eşleşme aramaya başlanınca değil iki taraf gerçek bağlantıyı aynı sunucu oturumu için doğrulayınca bir kez tüketilir. Bildirim de o noktada bir kez çıkar. Başarısız tek taraflı bağlantı hak tüketmez.
6. Rastgele görüşmenin iptali/atlama sırasında önce eski sunucu kaydı bırakılır. İptal edilen isteğin geç yanıtı yeni çağrıyı değiştiremez.

Bu değişiklikler TURN sunucusunun servis/firewall/relay port sorununu uzaktan kendiliğinden onarmaz. Gerçek çift yönlü ses hâlâ iki cihazla sınanmalıdır.

## Devreye alma — mevcut projenin üzerine

1. Güncel `napan-setup` kaynaklarını ayrı klasöre alın. `.env`, JKS ve kullanıcı Mac’indeki diğer yedekleri silmeyin. Expo projesi aynı kalır: `@ezekutlu/napan`, `d5beacfa-d122-4ebd-bea3-bce3b5f808de`, Android `app.napan.mobile`.
2. Frankfurt projesi `qdtmlsblifstcpuossnm` → SQL Editor → `supabase/patches/design-and-calls.sql` dosyasının tamamını **bir kez** çalıştırın. Bu paket yalnızca yeni0034–0035’i uygular ve tekrar çalıştırmayı engeller. Önceki `real-user-report.sql` dosyasını yeniden çalıştırmayın. CLI migration geçmişi kullanılıyorsa yeni iki migration’ı o yöntemle uygulayın; paket ve tekil dosyaları üst üste uygulamayın.
3. Güncel proje klasöründe mevcut yetkili CLI oturumuyla:

   ```bash
   npx supabase functions deploy turn-credentials --project-ref qdtmlsblifstcpuossnm
   ```

   Güncel `supabase/config.toml` gateway kontrolü yerine fonksiyonun `auth.getUser` doğrulamasını kullanır. Fonksiyon gerçek kullanıcı JWT’si olmadan TURN bilgisi vermez. Önceki `billing-webhook`/`read-message-media` değiştirilmedi; bu güncelleme için tekrar yayımlanmaları gerekmez.
4. Supabase Edge secrets: `TURN_DOMAIN=turn.napan.app`, `TURN_TTL_SECONDS=600`; `TURN_SECRET` sunucudaki mevcut Coturn secret ile aynı kalmalı. Secret’ı sohbete veya Git’e koymayın. Bilgi eşleşmeden keyfi yeni secret üretmeyin.
5. Kaynak kontrolleri ve yeni APK:

   ```bash
   npm ci
   npm test && npx tsc --noEmit && npm run lint
   npx eas-cli@25.2.0 project:info
   npx eas-cli@25.2.0 build --platform android --profile preview
   ```

6. **Her iki test cihazı yeni APK’yı kullanmalı.** Eski Presence eşleşmeli sürüm ile yeni sunucu kuyruğu aynı havuzu paylaşmaz. SQL ve TURN deploy tamamlanmadan yeni APK’da eşleşme/istatistik testine başlamayın. Mevcut APK bu kodu içermez.

## TURN sunucusunu ayrıca kontrol etme

Mac Terminal’de:

```bash
nc -vz -G 5 turn.napan.app 3478
nc -vz -G 5 turn.napan.app 5349
```

SSH ile mevcut Ubuntu sunucusuna girdikten sonra salt okunur kontroller:

```bash
systemctl is-active coturn
ss -lntup | grep -E ':(3478|5349)\b'
sudo ufw status verbose
sudo journalctl -u coturn -n 80 --no-pager
```

Servis aktif olsa bile sağlayıcının firewall’ı ve yapılandırılmış UDP relay aralığı (`min-port`/`max-port`; eski kılavuz49152–65535) erişilebilir olmalı. Yapılandırmayı doğrulamadan firewall’ı sıfırlamayın. TCP port testi relay tahsisini veya ses iletimini tek başına doğrulamaz. Trickle ICE’de geçici kimlik bilgileriyle `relay` adayı ve ardından iki cihaz sesi kontrol edilir. Çıktı paylaşırken secret/şifre/token’ı gizleyin.

Bu çalışma ortamında DNS185.8.129.52 çözüldü;3478/5349 doğrudan TCP denemeleri reddedildi. Kontrol amaçlı başka dış ağ bağlantısı da bu ortamdan başarısız oldu. Bu nedenle bu ölçüm sunucunun kapalı olduğunu kanıtlamaz; Mac/sağlayıcı tarafından doğrulama gerekir. Sunucuya yetkili SSH erişimi kullanılmadı ve Coturn yapılandırması değiştirilmedi.

## Doğrulama kaydı

- 57 otomatik test geçti: mevcut36’ya kayıp/tekrarlı sinyal, geç katılım, iptal, TURN hatası/hesap izolasyonu, boost kaynaklı sayaç ve kalıcı beğeni ile atomik eşleşme testleri eklendi.
- TypeScript ve lint: temiz.
- Android production eager JavaScript bundle geçti (1977 modül,52 asset); web export geçti. Bunlar native Gradle/APK çalıştırması değildir. Kullanılmayan Poppins yüklemeleri ve dış CSS font isteği kaldırıldı.
- Tarayıcıda 390×844 örnek verilerle Keşfet, Profil, Sohbetler, mesaj ekranı, sosyal ayarlar, eşleşme, hikâyeler ve diğer profil açıldı; sayfa hatası yok. Örnek kullanıcı/sayılar ve Unsplash test fotoğrafı yalnızca yerel görsel kontroldür; uygulama verilerine eklenmez. Ekran görüntüleri gerçek uygulama kodundan alınır.
- Yerel PostgreSQL/PGlite ve native/Edge taklitleri gerçek servis yayını, eşzamanlı çok sunucu yük testi, native ses veya push teslimi yerine geçmez. İki cihaz Wi-Fi/Wi-Fi, Wi-Fi/mobil veri, ahize/hoparlör ve art arda arama/iptal/tekrar testleri gerekir.
- Yeni0034–0035 geçişi ve TURN güncellemesi ajan tarafından canlıya uygulanmadı; Supabase yönetici oturumu bu ortamda yok. Yeni native APK da burada oluşturulmadı.

## Kabul örnekleri

- Kullanıcı A, aktif boost kartından B’ye girer, hiçbir şey yazmadan çıkar: B’nin sayacı artmaz. İlk mesajı gönderir: +1. Aynı sohbete10 mesaj daha: +0. Normal sohbetten C yazar: +0.
- Hikâyeyi A beğenir, kaldırır, tekrar beğenir: toplam +1. Hikâye silinir: toplam korunur. B kendi hikâyesini beğenir: +0.
- Üç kişi aynı anda eşleşme arar: yalnızca iki kişi aynı session/room’a atanır; üçüncü bekler. İlk offer/answer kaybolur: yeni offer üretilmeden tekrar iletilir. Bir kişi iptal eder: geç yanıt yeni görüşmeyi bozamaz.
- TURN endpointi401/500 verirse: sonsuz “bağlanıyor” yerine anlaşılır hata. Gerçek relay ve iki yönlü ses ayrıca doğrulanır.

## Koddan alınan ekran önizlemeleri

Bunlar örnek verilerle web arayüzünden alınmıştır; gerçek kullanıcı, takipçi sayısı veya cihaz sesi kanıtı değildir. Fotoğraflar yerel UI kontrolünde kullanılan Unsplash örnekleridir ([kaynak1](https://images.unsplash.com/photo-1534528741775-53994a69daeb), [kaynak2](https://images.unsplash.com/photo-1500648767791-00dcc994a43e)); uygulama kullanıcılarına atanmaz.

[Keşfet](design/discover-v2.jpg) · [Profil](design/profile-v2.jpg) · [Mesaj](design/conversation-v2.jpg) · [Sesli eşleşme](design/voice-match-v2.jpg) · [Giriş](design/landing-v2.jpg)
