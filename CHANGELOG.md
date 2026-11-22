# Converto Server – Değişiklik geçmişi

## RC3B Backend · 22 Kasım 2026

- `POST /links/inspect` ve `POST /convert/url` eklendi (doğrudan, herkese açık medya linkleri).
- URL kaynağında SSRF, DNS, redirect, timeout, boyut ve eşzamanlı işlem sınırları.
- Compressed / Balanced / Best Quality video, ses, görüntü ve GIF için ayrıştırıldı.
- GIF'de renk paleti, profil bazlı FPS/renk/çözünürlük limitleri.
- Compressed video otomatik 720p üst sınırı (açıkça çözünürlük seçilmediyse); H.264/H.265 CRF ve encoder preset revizyonu.
- WebM kodlaması realtime yerine good deadline; profil bazlı CPU hızı/CRF.
- Varsayılan ses bitrate değerleri profile göre farklı; açıkça girilen değerler korunur.
- Güvenilir satın alma doğrulaması olmadan istemci kaynaklı Pro yetkisi açılması engellendi.
- FFmpeg işlemleri için konfigüre edilebilir zaman aşımı ve temel API/FFmpeg testleri eklendi.

## Önceden var olan

- Dosya bazlı `/convert`, `/convert/batch` ve PDF işlevleri korundu.
- Render/Node.js/FFmpeg/Sharp altyapısı aynı kaldı.
