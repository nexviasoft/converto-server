# Converto Backend RC3B · Render yayın adımları

1. Çalışan Render servisinin mevcut GitHub commit SHA'sını ve ortam değişkenlerini yedekleyin.
2. Bu paketin içindeki `converto-server/` kaynaklarını mevcut depo köküne taşıyın. `node_modules/`, `.git/` ve runtime `uploads/` klasörünü yüklemeyin.
3. `index.js`, `quality-profiles.js`, `source-url.js`, `package.json`, `package-lock.json`, `README.md`, `CHANGELOG.md`, `verify-sharp.js`, `test/` dosyalarını commit edip push edin.
4. Render **Node.js 20 veya 22** kullanmalı. Build command: `npm ci --include=optional`. Start command: `npm start`.
5. İsteğe bağlı environment variables: `URL_IMPORT_MAX_MB=40`, `URL_IMPORT_MAX_CONCURRENT=2`, `CONVERT_TIMEOUT_MS=240000` (milisaniye). Bunlar ücretsiz sunucunun kapasitesine göre düşürülebilir.
6. **Manual Deploy → Clear build cache & deploy**. Başarılı deploy sonrası `/health` içinde `ok: true`, `qualityProfiles: ["small","balanced","high"]` ve `linkImport.directPublicMediaOnly: true` arayın. `avifEngine: sharp` ayrıca kontrol edin.
7. Önce mevcut Android/web file upload akışını, sonra `POST /links/inspect` ve doğrulanmış herkese açık doğrudan medya URL'si ile `POST /convert/url` akışını test edin.
8. Bir sorun çıkarsa yeni commit'i geri alıp bir önceki çalışan deploy'a dönün.

**Not:** Android RC3B Paste a link ekranı bu yeni route'a otomatik olarak bağlanmaz; istemci entegrasyonu ayrı geliştirme işidir. YouTube/Instagram/X normal sayfa bağlantıları bu sürümde indirilemez. Pro yetkileri için istemci `tier`/`isPro` değerleri artık doğrulanmış abonelik sayılmıyor. Bu bilinçli güvenlik değişikliği, ilerideki gerçek ödeme doğrulamasıyla tamamlanacaktır.
