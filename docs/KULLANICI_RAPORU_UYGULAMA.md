> Bu kayıt v1 içindir. V1 SQL zaten uygulandıysa tekrar çalıştırmayın. Yeni tasarım, süper mesaj ve arama geçişi için [v2 kaydını](TASARIM_VE_ARAMA_V2.md) kullanın.

# Napan kullanıcı raporu: değişiklik ve devreye alma

20 Ekim 2026. Kod ve eklemeli veritabanı geçişleri `napan-setup` dalında hazırlandı. Bu belge, **yerel doğrulamayı canlı sistem ve gerçek cihaz kanıtından ayırır**. Mevcut APK bu değişiklikleri içermez.

## Rapor kapsamı

| Madde | Uygulanan değişiklik | Kanıt / kalan kontrol |
|---|---|---|
| 1.1 Elmas satın alma | İstemcinin bakiye artırdığı iki eski RPC kapatıldı. RevenueCat mağaza paketi, doğrulanmış webhook, ürün eşleştirmesi ve benzersiz işlem kaydı kullanılıyor. Kart bilgisi toplayan deneme ekranı kaldırıldı. | Yerel yetki, mükerrer işlem ve sandbox reddi testleri geçti. Mağaza/RevenueCat yapılandırması ve gerçek sandbox ödeme gerekli. |
| 1.2 Öne çıkarma | Yetkili sunucu RPC’si, satır kilidi, 24 saat, sunucudaki maliyet ve tekrar denemede aynı işlem kimliği. Koruma tetikleyicileri kaldırılmadı. | Normal kullanıcıyla başarı, çift ücret almama, yetersiz bakiye ve süre manipülasyonu testleri geçti. |
| 1.3 Beyaz açılış | Auth callback içinde kilit bekleyen Supabase istekleri kaldırıldı; profil yükleme dışarı ertelendi. Zaman aşımı, tekrar dene ve eski oturum yanıtlarını yok sayma eklendi. Büyük oturumlar şifreli parçalarda saklanıyor. | TypeScript/derleme; büyük oturum, yarım yazma ve eski kaydı taşıma testleri. Aralıklı cihaz açılışı ayrıca tekrarlanmalı. |
| 1.4 İlk dokunuş | Kaydırmalı formlarda klavye dokunuşları, modal kapanış tekrarları ve kritik işlemlerde eşzamanlı basma korumaları düzeltildi. | Lint/derleme. Bütün butonların cihazda ilk dokunuşla çalıştığı iddia edilmiyor; kabul listesi aşağıda. |
| 1.5 Çıkış sonrası push | Token yeni hesaba devredilirken önceki bağ kaldırılır; çıkışta sunucu kaydı oturum kapatılmadan temizlenir. Temizleme başarısızsa çıkış başarılı gösterilmez. | Hesaplar arası token aktarımı ve yetkili temizleme DB testleri. Önceden OS’ye teslim edilmiş bildirim geri çağrılamaz. |
| 1.6 Uygulama içi bildirim | Üst mesaj banner’ı ve kabul/ret düğmeli gelen arama banner’ı. Açık sohbette kendi mesajı için tekrar banner yok; hesap değişiminde eski banner gösterilmez. | Derleme; gerçek foreground/background push ve arama iki cihazla bekliyor. |
| 1.7 Sahte eşleşme | Her DM katılımcısında çalışan yanlış eşleşme bildirimi tetikleyicisi kaldırıldı. Rastgele görüşmenin iki tarafı aynı oturumu doğrulayınca bir kez bildirim üretilir. | Tek taraf, üçüncü taraf ve tekrar doğrulama DB testleri. Bu, iki istemcinin bağlantı onayıdır; sunucuda ses duyulduğu kanıtı değildir. |
| 1.8 Profil geri alma | Açık düzenleme taslağı Realtime tarafından ezilmez. Sunucu sürümü eski yanıtların yenisini ezmesini önler. Yalnızca dönen kayıtla başarı gösterilir; hatada form kapanmaz. | Yetki/sürüm testleri. Mevcut projede profil moderasyonu bulunmadı; sahte “onay bekliyor” süreci eklenmedi. |
| 2.1 Hikâye geçişi | Sağ/sol dokunma, yatay sayfalama, dikey kaydırarak kapatma. | Derleme; cihaz dokunma/klavye kabulü bekliyor. |
| 2.2 Hikâyeye yanıt | Sunucu gerçek hikâye kimliğini ve önizleme adresini mesajla kaydeder; metin ve medya yanıtında bağlam görünür. Silinen/okunamayan önizlemede açıklama gösterilir. | Gerçek hikâyeden önizleme üretme DB testi. Native video yanıtlarında küçük poster üretilir; web’de video etiketi, silinen/okunamayan medyada açıklama gösterilir. |
| 2.3 Hikâye kamera/galeri | Fotoğraf/video için kamera ve galeri seçenekleri; 15 MB sınırı; “Anlık”/“Galeriden paylaşıldı” kaynağı. Eski kayıtlar yanlış etiketlenmez. | Derleme; gerçek yükleme için migration ve cihaz izni/Storage kontrolü gerekiyor. |
| 3.1 Sohbet galerisi | Kamera/galeri fotoğraf ve video seçimi, kaynak ve tür metadatası. | Özel medya gönderme ve tekrar deneme DB testleri; gerçek dosya aktarımı bekliyor. |
| 3.2 Tek gösterim / tut | Seçim ekranı, private bucket, yalnızca katılımcıya servis üzerinden dosya erişimi, alıcı için atomik tek açma hakkı; sohbette tut modunda tekrar erişim. | Üçüncü hesap, doğrudan Storage okuma, doğrudan RPC, tekrar açma ve engel testleri geçti. Ekran görüntüsünü/kopyalamayı engellemez. |
| 3.3 Klavye | Android `softwareKeyboardLayoutMode=resize`; üst üste Android yükseklik düzeltmesi kaldırıldı, iOS padding korundu. | Yeni native APK ile iki Android sürümü ve iOS cihaz testi gerekiyor. |
| 4.1 E-posta doğrulama | Yeni hesapları otomatik doğrulayan eski tetikleyici kaldırıldı; onboarding verisi hesabın oluşturulmasıyla kaydedilir; e-posta bekleme ekranı ve yeniden gönderme. Güvensiz telefon UID/parola köprüsü kaldırıldı. | DB’de yeni hesabın doğrulanmadan kaldığı test edildi. Dashboard e-posta onayı ve SMTP teslimatı ayrıca ayarlanmalı. |
| 4.2 E-posta rozeti | Gerçek `auth.users.email_confirmed_at` değişiminden korumalı rozet. Profil ve kullanıcı adı yanında gösterim. | Rozet alanının istemciden değiştirilemediği test edildi. Kimlik doğrulaması rozeti değildir; geçmiş otomatik doğrulamalar yeni kanıt sayılmaz. |
| 4.3 Kayıt kuralları | Kullanıcı adı/yaşı geriye dönük kilitlenmedi. Kayıtta e-posta kuralı açıklandı. | Rapordaki “değiştirilemeyecekse” koşulu uygulanmadığından yanlış bir değiştirilemez uyarısı eklenmedi. |
| 5.1 Takip | Takip et/bırak, takipçi/takip sayısı, sayfalı listeler. | Başkasının takip ilişkisini değiştirememe DB testleri. |
| 5.2 Beğeni | Sayı gerçek hikâye beğenisi kayıtlarından hesaplanır. | Veri sorgusu; silinen hikâyenin beğenileri toplamdan çıkar (ömür boyu sayaç değil). |
| 6.1 Engellenenler | Profilde Gizlilik ve profil bağlantıları → Engellenen hesaplar; liste ve engeli kaldırma. | Yalnızca kendi engel listesini döndüren RPC ve engel sonrası medya reddi testleri. |
| 7.1 Elmas konumu | Mağaza, bildirim ve gizlilik kısayolları profilin üst bölümünde. | Derleme; görsel kabul cihazda. |
| 7.2 Tekrar boost açma | Banner her basışta benzersiz gezinme parametresiyle öne çıkarma ekranını açar. | Derleme; aç/kapat/aç cihaz kabulü. |
| 8.1 Instagram ekleme | Bilgileri düzenle ve profil bağlantıları alanında isteğe bağlı kullanıcı adı, silme ve ücretli erişim onayı. | Sahip RLS’si; link public profil satırında tutulmaz. |
| 8.2 Ücretli Instagram | Varsayılan 20 elmas, sunucudan ayarlanabilir. İlk açmada atomik tahsilat; tekrar açmada ikinci ücret yok; kendisi ücretsiz. | Gizli alan, bakiye düşümü, tekrar ve yetersiz bakiye DB testleri geçti. |
| Ek: görüldü/yazıyor | Görüldü iki kişinin gizlilik ayarına bağlı; yazıyor özel katılımcı kanalında, hız ve süre sınırlı. | Kanal için katılımcı/üçüncü hesap DB testleri. Realtime yayını cihazda bekliyor. |
| Önceki arama/medya/mesaj hataları | ICE kuyruğu, gerçek transport durumu, zaman aşımı ve ses oturumu sahipliği korundu. Mesaj sunucu yanıtıyla hemen görünür, Realtime tekrarları birleştirilir ve yeniden bağlantıda geçmiş çekilir. Hikâyedeki eksik transform alanı geçişe dahil. | Önceki regresyon testleri korundu. Duyulabilir çift yönlü ses için gerçek iki cihaz şart. |

## Devreye alma sırası

1. Mevcut Supabase projesinin yedeğini alın. Hedef yalnızca `qdtmlsblifstcpuossnm` Frankfurt projesidir. Eski projeyi veya Coturn sunucusunu sıfırlamayın.
2. **Mevcut kurulumda** `supabase/patches/real-user-report.sql` dosyasını SQL Editor’da proje sahibi olarak bir kez çalıştırın. `0030–0033` eklemeli geçişlerini aynı transaction içinde uygular; tekrar çalıştırmayı kayıtla engeller. Başarısızlıkta transaction geri alınır. Migration’ları tek tek zaten uyguladıysanız paket dosyasını tekrar kullanmayın. Supabase CLI migration geçmişiyle yönetiyorsanız tek tek migration yolunu kullanın; iki yöntemi karıştırmayın.
3. `tests/fixtures/base-schema.sql` **yalnızca test verisidir**; canlı projede çalıştırmayın. Kurulum şemasını/0001–0029’u yeniden çalıştırmayın.
4. Yetkili Supabase CLI oturumunda:

   ```bash
   npx supabase functions deploy billing-webhook --project-ref qdtmlsblifstcpuossnm
   npx supabase functions deploy read-message-media --project-ref qdtmlsblifstcpuossnm
   ```

   `supabase/config.toml` bu iki endpoint için gateway JWT kontrolünü kapatır: billing kendi paylaşılan Authorization değerini, medya ise `auth.getUser` ile gerçek kullanıcı JWT’sini doğrular. Servis anahtarları yalnızca Edge ortamında kalır.
5. Supabase Auth → Providers → Email içinde Confirm email etkin olsun. URL Configuration’daki yönlendirme adresini ve SMTP’yi gerçek alan adınızla ayarlayın. Doğrulama e-postası hesabı doğrular; kullanıcı uygulamaya dönüp giriş yapabilir. Yerel uygulama için otomatik deep-link ile oturum açma bu değişikliğin parçası değildir. Daha önce otomatik doğrulanmış hesaplar silinmez/değiştirilmez.
6. RevenueCat/mağaza adımlarını aşağıda tamamlayın. Mevcut FCM, JKS, TURN secret ve host korunur. Yeni Expo projesinde FCM bağlantısını kontrol edin.
7. Yeni kaynaklarla `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run lint`, ardından kullanıcı hesabında `npx eas-cli@25.2.0 build --platform android --profile preview` çalıştırın. EAS’te yeni proje kimliği `d5beacfa-d122-4ebd-bea3-bce3b5f808de`, paket `app.napan.mobile` kalmalı. Ücretsiz/ücretli kuyruk koşullarını hesabınızdan kontrol edin.
8. Yeni APK’yı iki cihaza kurup aşağıdaki kabul testlerini çalıştırın. Eski APK ile yeni özellikleri doğrulamaya çalışmayın.

## Gerçek ödeme yapılandırması

- Google Play/App Store’da tüketilebilir elmas ürünleri ve RevenueCat offering/package eşleştirmeleri oluşturulmalı. Mevcut uygulama kullanıcısı RevenueCat’e Supabase UUID’siyle tanıtılır.
- İlgili `diamond_packages.store_product_id` alanı gerçek mağaza ürün kimliğiyle eşleşmeli. Sunucu verilen ürünün aktif paketinden elmas miktarını alır; istemci miktar/fiyatına güvenmez. Alan boşsa satın alma açıklayıcı hata ile durur.
- `.env.example` içindeki **public SDK anahtarları** EAS’in kullanılan ortamında ayarlanmalı: `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, gerekiyorsa `EXPO_PUBLIC_REVENUECAT_IOS_KEY`.
- RevenueCat webhook URL: `https://qdtmlsblifstcpuossnm.supabase.co/functions/v1/billing-webhook`. RevenueCat’teki Authorization header değeri Supabase Edge secret `BILLING_WEBHOOK_AUTH` ile birebir eşleşmeli. Bu değer kaynak koduna/sohbete yazılmaz.
- Yalnızca `NON_RENEWING_PURCHASE` olayları elmas yükler. Event ID ve store/transaction ID birlikte tekrar yüklemeyi engeller. Sandbox varsayılan kapalıdır; kontrollü test ortamında `system_settings.allow_sandbox_billing=true` açılabilir, üretimde kapatın.
- Abonelik/VIP otomasyonu ve iade/chargeback muhasebesi bu elmas satın alma akışında uygulanmadı; mağaza iadeleri işletme tarafından ayrıca uzlaştırılmalı. VIP simülasyon düğmesi kaldırıldı; yapılandırılmamış abonelik satışında açıklama gösterilir. Üretim yayını öncesi bu gelir süreçleri ayrıca tamamlanmalı.

## Tek gösterimlik medya sınırları

`private_chat` private bucket’ında istemciye okuma politikası verilmez. `read-message-media` gerçek kullanıcıyı doğrular; yalnızca servis rolü `claim_message_media` çağırır. Alıcının açma hakkı satır kilidiyle tüketilir; dosya response’u `no-store` olur ve yerel görüntüleme dosyası kapanışta silinir. Gönderenin önizlemesi alıcının hakkını tüketmez. Dosya aktarımı tüketimden sonra başarısız olursa tek açma hakkı kullanılmış olabilir; kullanıcıya sahte başarı gösterilmez. Bu sistem ekran görüntüsünü, cihaz ele geçirilmesini veya görüntünün başka cihazla kaydını engellemez. Açılmış dosyalar için Storage yaşam döngüsü/temizlik görevi ayrıca işletim gereksinimidir.

## Yerel doğrulama ve sınırları

- `npm test`: 36 test geçti. Yerel PostgreSQL/PGlite, auth/storage/realtime şema taklitleri ve ağ göndermeyen `pg_net` stub’ı kullanılır. Gerçek push teslimatı değildir.
- `tsc --noEmit`: geçti. `eslint src`: hata/uyarı yok.
- Android production eager JavaScript bundle: geçti (70 asset). Web export: geçti. Bunlar Gradle/APK veya fiziksel cihaz testi değildir.
- Tarayıcıda gerçek projenin salt okunur ayarlarıyla açılış/giriş/kayıt ilk ekranları görüntülendi; sayfa hatası yok. Hesap oluşturulmadı, ödeme veya dosya yükleme yapılmadı.
- Auth session storage ve Edge HTTP işleyicileri yerel taklitlerle test edildi; gerçek mağaza makbuzu, SMTP ve dosya bytes aktarımı canlıda doğrulanmadı.
- Canlı migration/Edge deploy yapılmadı: bu çalışma alanında yetkili Supabase yönetici oturumu yok. Cloud EAS oturumu Mac’teki girişle aynı değildir. Yeni native APK bu ortamda üretilmedi.

## İki cihaz kabul listesi

- Wi-Fi/Wi-Fi ve Wi-Fi/mobil veriyle her iki yönde arama; kabul öncesi “bağlı” görünmemesi, çift yönlü ses, ahize/hoparlör, mikrofon reddi ve Bluetooth reddi, 45 sn başarısız bağlantı temizliği.
- Uygulamayı soğuk başlangıçla en az 20 kez açma; bağlantıyı kesme/açma; zaman aşımından tekrar deneme; hesap değiştirme.
- Mağaza sandbox: iptal, başarılı ürün, aynı webhook tekrarları, farklı event ID ile aynı transaction, geciken webhook; hiç çift elmas yok.
- Boost: onay, hızlı çift basma, bağlantı yanıtı kaybolunca tekrar deneme, yetersiz bakiye; 24 saat ve tek tahsilat.
- Yeni hesapta e-posta onayından önce giriş reddi, gerçek bağlantıyla onay, giriş, yalnız e-posta rozeti.
- Fotoğraf/video hikâye ve mesaj: kamera/galeri, kaynak metni, 15 MB üzeri reddi, tekrar deneme, birden fazla hikâyede sağ/sol ve kapatma.
- Tek gösterim: alıcı ilk açma, kapatıp tekrar açamama, üçüncü hesap reddi; tut modunda tekrar açma; engelden sonra erişim reddi.
- Android klavye aç/kapat, input görünürlüğü; mesaj/görüldü/yazıyor, bağlantı kesilip gelen mesajı geri kazanma.
- Aynı sohbette fazladan banner yok; diğer ekranda mesaj banner’ı; gelen arama kabul/ret; çıkıştan sonra yeni push yok; başka hesapta eski mesaj banner’ı yok.
- Profil kaydı sırasında Realtime güncellemesi; başarısız kayıtta taslak korunması; takip/engelleme listeleri; Instagram ilk açmada 20, ikinci açmada 0 elmas.

## Mac kaynaklarını güvenli güncelleme

ZIP’den çıkardığınız klasörü ve `.env`/keystore yedeklerini koruyun. Güncel `napan-setup` dalının ZIP’ini **ayrı klasöre** çıkarmak en kolay yoldur. Eski proje, JKS veya kimlik bilgileri silinmez. `app.json` içindeki proje/paket kimlikleri yukarıdaki değerlerle aynı kalmalı.

Git ile takip edilen ve başlangıç dosyaları aynı olan klasörde tek commit patch’i uygulanacaksa önce `git apply --check /tmp/napan.patch`, yalnızca kontrol başarılıysa `git apply /tmp/napan.patch` kullanın. Birden fazla eski sürüm farkı varsa tek son commit patch’i yeterli olmayabilir; ayrı güncel ZIP tercih edin. `git reset --hard` kullanmayın.
