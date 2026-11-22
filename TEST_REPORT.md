# RC3B backend test sonuçları · 22 Kasım 2026

- `node --check index.js`, `source-url.js`, `quality-profiles.js` → **PASS**
- `npm test` → **6/6 PASS** (profil sıralaması, URL sınıflandırma, özel IP/port engeli, MIME sınıflandırma)
- `FFMPEG_PATH=/usr/bin/ffmpeg npm run test:media` → **24/24 PASS** (MP4, WebM, AVI, GIF, MP3, M4A, JPG, WebP x 3 profil)
- Gerçek HTTP localhost sunucusu `/health` → **PASS**
- `/links/inspect` doğrudan URL ve YouTube sayfa URL'sini ayırıyor → **PASS**
- `/convert/url` ile localhost/private IP engeli → **PASS**
- Mevcut `POST /convert` ile MP4→GIF `small` dönüşümü, dosya çıktısı → **PASS**
- Örnek 2 saniyelik test videosunda GIF boyutu: Compressed 118 KB, Balanced 308 KB, Best Quality 460 KB. Bu *tek örnek* için ölçümdür.

**Henüz doğrulanmadı:** Gerçek harici internet üzerindeki CDN'den download; Render'ın ücretsiz plandaki gerçek işlem süresi ve bellek tüketimi; Android RC3B'den yeni link endpoint bağlantısı; YouTube/Instagram/X platform içeriği (bu sürümde bilinçli olarak desteklenmiyor). Üretim dağıtımı yapılmadı.
