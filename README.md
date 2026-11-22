# Converto Server

Converto web ve Android uygulamalarının ortak **Node.js / Express / FFmpeg** dosya dönüştürme servisi.

**Backend RC3B uyarlaması · 22 Kasım 2026**

## Mevcut işlevler

- `POST /convert`: `multipart/form-data`; `file`, `target`, `videoQuality` ve isteğe bağlı dönüşüm parametreleri. Yanıt dönüştürülmüş dosyadır.
- `POST /convert/batch` (eski uyumlu yol: `/batch-convert`): aynı seçeneklerle birden fazla dosya, ZIP olarak döner.
- PDF işlemleri: `/pdf/split`, `/pdf/to-images` ve mevcut PDF birleştirme işlemleri.
- `POST /links/inspect`: JSON `{ "url": "https://.../video.mp4" }`; URL türünü ve destek durumunu bildirir. **Ağdan erişim veya oynatılabilirlik kontrolü yapmaz.**
- `POST /convert/url`: JSON `{ "url": "https://cdn.example.com/file.mp4", "target": "webm", "videoQuality": "balanced" }`; doğrudan erişilebilen herkese açık bir medya dosyasını indirir, dönüştürür ve dosya olarak döner.
- `GET /health`: formatlar, FFmpeg yolu, kalite profilleri, URL içe aktarma sınırları.

**Sosyal medya bağlantıları:** YouTube, Instagram, X ve benzeri uygulamalardaki normal gönderi/video sayfası bağlantılarını doğrudan indirmiyoruz. Bu bağlantılar medya dosyası değil, platform sayfasıdır. Destek için ayrı bir izinli sağlayıcı entegrasyonu ve platform şartlarına uygun doğrulama gerekir. Başka birinin özel, korumalı veya telifli içeriğini izinsiz indirmeye yönelik atlatma mekanizmaları eklenmedi.

## Kalite profilleri

Android'in `videoQuality` alanı ile uyumlu: `small` (Compressed), `balanced` (Balanced), `high` (Best Quality). Alias: `compressed`, `smaller`, `best`.

| Hedef | Compressed / small | Balanced | Best Quality / high |
| --- | --- | --- | --- |
| H.264 | CRF 29, veryfast, varsayılan üst sınır 720p | CRF 23, veryfast | CRF 19, faster |
| H.265 | CRF 32 | CRF 27 | CRF 23 |
| WebM VP9 | CRF 42, cpu-used 5 | CRF 34, cpu-used 4 | CRF 27, cpu-used 3 |
| AVI (MPEG-4 Part 2) | q:v 12 | q:v 7 | q:v 3 |
| GIF | 8 FPS, maksimum 360 px, 64 renk | 12 FPS, maksimum 480 px, 128 renk | 15 FPS, maksimum 720 px, 256 renk |
| MP3 varsayılan | 96 kb/s | 160 kb/s | 256 kb/s |
| AAC varsayılan | 96 kb/s | 160 kb/s | 256 kb/s |

GIF dönüştürme renk paleti (`palettegen` + `paletteuse`) kullanır. GIF'de ses yoktur. Bir formatın doğal sınırları geçerlidir: WAV zaten kayıpsız PCM, AVI ise sıkıştırma verimliliği açısından MP4'ten daha zayıf olabilir. Best Quality kayıp bilgiyi geri getirmez; Compressed da zaten yoğun sıkıştırılmış bir dosyayı her zaman küçültemez. Açıkça girilmiş `videoResolution`, `videoFps`, `audioBitrate` ve `imageQuality` değerleri profil varsayılanlarının önüne geçer.

## URL'den dönüşüm güvenliği

- Yalnızca HTTP(S) ve doğrudan medya dosyaları; web sayfası veya özel/yerel ağ URL'leri reddedilir.
- SSRF koruması: özel/rezerve IP engeli, DNS çözümlemesi ile IP sabitleme ve her yönlendirmede tekrar doğrulama; standart portlar, en fazla 3 yönlendirme.
- Varsayılan URL dosya limiti **40 MB**, en fazla **2 eşzamanlı** URL dönüşümü. Değerler ortam değişkenleriyle yönetilebilir.
- URL import'unda uzaktaki medya MIME türü kontrol edilir; sunucu akışla okur, dosyayı belleğe komple almaz.
- Dönüşüm işlemi sunucu zaman aşımıyla sınırlandırılmıştır.
- Gerçek Pro satın alma doğrulaması henüz bağlı değil: sadece müşteri tarafından gönderilen `isPro`, `x-user-tier`, `x-user-id` vb. değerlere güvenilmiyor. **Şimdilik bütün çağrılar Free yetki sınıfındadır**. Ücretli plan için doğrulanmış kimlik + mağaza makbuz doğrulaması gerekecek.

## Kurulum

Node.js 20 veya 22 ile:

```bash
npm ci --include=optional
npm test
npm start
```

Render üzerinde (eski çalışan servis URL'sini koruyarak):

- Build: `npm ci --include=optional`
- Start: `npm start`
- İsteğe bağlı: `URL_IMPORT_MAX_MB=40`, `URL_IMPORT_MAX_CONCURRENT=2`, `CONVERT_TIMEOUT_MS=240000`
- FFmpeg yolu otomatik (`@ffmpeg-installer/ffmpeg`); yerel sistem testlerinde `FFMPEG_PATH=/usr/bin/ffmpeg` verilebilir.

### API örnekleri

```bash
curl -X POST http://localhost:10000/convert \
  -F "file=@video.mp4" -F "target=webm" -F "videoQuality=small" \
  -o compressed.webm

curl -X POST http://localhost:10000/links/inspect \
  -H "Content-Type: application/json" \
  -d '{"url":"https://cdn.example.com/example.mp4"}'

curl -X POST http://localhost:10000/convert/url \
  -H "Content-Type: application/json" \
  -d '{"url":"https://cdn.example.com/example.mp4","target":"mov","videoQuality":"balanced"}' \
  -o output.mov
```

Gerçek URL kullanın: `cdn.example.com` yalnızca örnek alandır. API doğru medya içeriği döndürebilen kamuya açık bir kaynak bekler. Android RC3B'deki `Paste a link` ekranını bu API'ye bağlamak ayrı bir mobil istemci değişikliğidir.

## Testler

```bash
npm test
# Bilgisayarda FFmpeg kuruluysa:
FFMPEG_PATH=/usr/bin/ffmpeg npm run test:media
```

Dönüşüm akışı için önce yedek alın; ardından yeni kodu GitHub'daki `converto-server` deposuna gönderip Render'a yeniden dağıtın. Dönüşüm API'sinin eski `POST /convert` ve `POST /convert/batch` yolları korunmuştur.

Detaylı değişiklik listesi: [`CHANGELOG.md`](CHANGELOG.md).
