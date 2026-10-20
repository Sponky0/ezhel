> Sonraki kapsamlı değişiklik ve 0030–0033 geçiş paketi için [kullanıcı raporu uygulama kaydını](KULLANICI_RAPORU_UYGULAMA.md) okuyun. Aşağıdaki kayıt önceki APK araştırmasına aittir.

# APK işlev sorunları: kontrol ve düzeltmeler

Kullanıcı iki ayrı cihazda aramanın bazen bağlantıda takıldığını, bağlı görünse de iki yönde ses olmadığını, fotoğraf/hikâye yüklenmediğini ve mesajların geç geldiğini bildirdi.

## Doğrudan doğrulanan hata

Yeni Supabase projesine salt okunur `stories?select=media_transform&limit=0` isteği HTTP 400 / PostgreSQL 42703 verdi. Hikâye ekranı bu sütunu hem listede seçiyor hem INSERT içinde gönderiyor, ancak kurulum şeması sütunu içermiyordu. Bu, hikâye akışı için doğrulanmış bir şema hatasıdır.

Yalnızca yeni `0030_story_media_transform.sql` migration'ını mevcut projeye uygulayın:

```sql
alter table public.stories add column if not exists media_transform jsonb;
notify pgrst, 'reload schema';
```

Şema veya önceki migration'ları baştan çalıştırmayın. Bu migration henüz ajan tarafından uzakta uygulanmadı.

## Kodda giderilen sorunlar

- Her iki arama akışında ICE adayları remote SDP gelene kadar sıraya alınır. Başarısız aday sonraki adayların kuyruğunu bozmaz.
- Bağlantı durumu artık SDP teklif/cevabı gönderilince değil, WebRTC transport bağlantısı kurulunca connected olur. Bu durum sesin duyulduğunu tek başına kanıtlamaz.
- Doğrudan aramada cevap kabul edilince eski 30 saniyelik çalma zaman aşımı temizlenir. Bağlanamayan oturumlar 45 saniyede kaynaklarını kapatır.
- Rastgele eşleşmede ilk subscribe ve join olaylarının iki ayrı offer oluşturması önlenir.
- Arama ses yönetimi ortaklaştırılır; mikrofon izni kontrol edilir, Bluetooth izni reddi dahili ses yolunu engellemez. Speaker seçimi InCallManager üzerinden yapılır. Rastgele görüşme ekranının temizliği etkin doğrudan görüşmenin ses oturumunu kapatamaz.
- Mesaj gönderme yanıtı UI'a hemen eklenir; aynı Realtime olayı gelince kopya oluşturulmaz. Realtime yeniden bağlanınca geçmiş tazelenir. Geçmiş isteği sırasında gelen canlı mesajlar korunur ve sıralanır.
- Benzersiz adlı medya yüklemeleri gereksiz upsert kullanmaz. Yerel dosya okuma, eksik oturum ve Storage hata durumları ayrıştırılır. Fotoğraf/hikâye ekranı artık hata mesajını gösterir.

## Çalıştırılan kontroller

- 12 yerel veritabanı kontrolü geçti: kullanıcı tetikleyicileri, normal kullanıcıyla sohbet/mesaj işlemleri, sohbet dışındaki kullanıcının mesajları okuyamaması, Storage metadata sahipliği, hikâye INSERT, publication üyelikleri, calls INSERT, eksik sütunun yeniden üretilmesi ve migration sonrası transform içeren hikâye INSERT.
- Veritabanı kontrolleri PGlite/PostgreSQL, minimal Supabase auth/storage tabloları ve sahte net.http_post kullanır. Gerçek Storage dosya servisi, push gönderimi veya canlı Realtime CDC testi değildir.
- `node --test tests/*.test.cjs`: 10 test geçti. ICE sıralama/kapama, transport durumları, mesaj geçmişi birleşimi, mikrofon/Bluetooth izni ve ses oturumu sahipliği kapsanır. Native ses modülleri mock'tur.
- TypeScript, lint ve preview profiliyle Android `export:embed --eager --dev false` geçti (1991 modül, 70 asset). Native APK bu düzeltmelerle henüz oluşturulmadı.

## İki cihazda yeniden test gerekenler

Migration ve güncel APK'dan sonra iki farklı hesap ve tercihen iki farklı ağ kullanın. 60 saniyeden uzun doğrudan/rastgele görüşme, iki yönde ses, mute/speaker/Bluetooth geçişleri; avatar/sohbet fotoğrafı/hikâye yükleme; ekran yenilemeden mesaj alma ve ağ kopup gelince toparlanma kontrol edilmeli.

Fotoğraf yüklemenin cihazdaki asıl hatası ve gerçek mesaj teslim gecikmesinin kaynağı henüz kesinleşmedi. RLS'nin test fixture'ında geçmesi gerçek cihazdaki oturum, dosya erişimi veya ağ problemini dışlamaz. Eklenen hata mesajıyla kalan sorunun aşaması belirlenebilir. Uzak veriler veya sunucu firewall ayarları değiştirilmedi.
