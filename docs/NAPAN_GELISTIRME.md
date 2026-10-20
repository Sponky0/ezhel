# Napan geliştirme kurulumu

Bu dal, ilk ZIP'in açılmış ve Napan için düzenlenmiş kaynaklarını içerir.
Kökteki ZIP eski sürümdür; tekrar açıp bu dosyaların üzerine yazmayın.

## Mac üzerinde

Bu proje klasöründe Node 24 ve npm ile:

```sh
npm ci
npx eas-cli@25.2.0 whoami
npx eas-cli@25.2.0 project:info
```

Expo owner: `ezekutlu`; proje ID: `552db9b6-f7a3-4636-a201-c155cbeecf5b`.
Yerel slug `napan`; Expo projesinin daha önceki slug değeri `kimki` idi.
`project:info` uyuşmazlık bildirirse önce bu eşleşmeyi çözün. Proje ID'sini
silerek yeni proje oluşturmayın ve mevcut imzalama anahtarını değiştirmeyin.

EAS preview, development ve production profillerinde yeni Supabase'in public
istemci ayarları bulunmaktadır. Yerel web geliştirmesi için aynı public
değerlerle `.env` oluşturun. `.env` dosyasını Git'e eklemeyin.

```sh
npx tsc --noEmit
npm run lint
npm run web
```

Android paketi `app.napan.mobile`; lisans kontrolü aynı paketle eşleşir.
Firebase projesi `napan-app`, google-services.json uygulama klasöründedir.
Bu dosya public istemci yapılandırmasıdır; özel servis hesabı anahtarı değildir.
Expo panelinde bu paket için FCM V1 anahtarı ve upload keystore mevcuttur.

## APK

Expo proje bağlantısı doğrulandıktan sonra test APK'sı:

```sh
npx eas-cli@25.2.0 build --platform android --profile preview
```

Bu komut Expo üzerinde gerçek bulut derlemesi başlatır. Mevcut keystore'u kullanın.
Yerel TypeScript, lint ve Android JS export kontrolleri geçti; native APK henüz
üretilmedi. Uygulama yayınlanmadı. İki cihazda ses, push, mesajlaşma ve satın alma
akışları ayrıca test edilmelidir.

## Veritabanı

Yeni Frankfurt projesinde kurulum zaten yapılmıştır. schema.sql ve migration
dosyalarını mevcut veritabanında baştan çalıştırmayın. Dosyalar orijinal kurulum
referansı olarak korunmuştur; tekrar eden politikalar ve 0029 sözdizimi için
kurulum sırasında kullanılan uyarlanmış dosya ayrıca hazırlanmıştır.

Firebase UID köprüsü ve satın alma akışlarına ilişkin güvenlik incelemesi,
web hosting ayarları ve iOS kurulumu tamamlanmış sayılmaz.
