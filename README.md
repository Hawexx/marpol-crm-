# Marpol Müşteri İlişkileri Yönetim Sistemi (CRM)

Siparişe özel endüstriyel üretim yapan Marpol A.Ş. için web tabanlı CRM.
Müşteri verilerini ve ilişkilerini detaylı biçimde saklar; dinamik fiyat
politikasıyla teklif üretir, üretim ve satış sonrası süreçleri satış ekibine
tek ekranda gösterir.

Görsel dil ve mimari, şirketin mevcut **Marpol PPM** (Üretim Yönetim Sistemi)
projesiyle bilinçli olarak aynı tutulmuştur: aynı SAP Fiori tasarım sistemi,
aynı klasör yapısı, aynı yetkilendirme modeli. İki proje bağımsız çalışır,
yalnızca üretim durumu için birbirleriyle konuşur.

## Teknoloji

| Katman | Teknoloji |
| --- | --- |
| Veritabanı | PostgreSQL 17 (Docker) |
| Sunucu | Node.js + TypeScript + Express + Prisma |
| Kimlik doğrulama | JWT (Bearer token) + bcrypt |
| Arayüz | React 18 + TypeScript + Vite + SAP UI5 Web Components |
| Veri yönetimi | TanStack Query |
| PDF | pdfmake (istemci tarafında) |

## Kurulum

Gereksinimler: **Node.js 20+** ve **Docker Desktop**.

```bash
npm install          # tüm workspace bağımlılıkları
npm run db:up        # PostgreSQL konteynerini başlat (port 5444)
npm run prisma:push  # şemayı veritabanına uygula
npm run seed         # başlangıç verisi + demo kullanıcılar
npm run dev          # API (4100) + arayüz (5174) birlikte
```

Arayüz: <http://localhost:5174>

> Portlar Marpol PPM ile çakışmayacak şekilde seçildi (PPM: 4000/5173/5433,
> CRM: 4100/5174/5444). İki sistem aynı anda çalışabilir.

### Demo kullanıcılar

Şifre hepsinde `Marpol2026!`

| Kullanıcı adı | Rol | Yetki |
| --- | --- | --- |
| `admin` | Sistem Yöneticisi | Tüm sekmeler, sınırsız iskonto |
| `ayse.yilmaz` | Satış Müdürü | Satış modülleri + onay yetkisi, %20 iskonto |
| `cem.aydin` | Satış Temsilcisi | Müşteri/fırsat/teklif, %5 iskonto (üstü onaya düşer) |
| `burak.sen` | Saha Servis Şefi | Saha servis modülü + onay |

> Canlıya alırken `server/.env` içindeki `JWT_SECRET` değerini ve demo
> şifreleri mutlaka değiştirin.

## Modüller (12 sekme)

Yetkilendirme paneli bu sekmeler üzerinden çalışır; her kullanıcıya sekme
başına **görüntüle / oluştur / düzenle / sil / onayla** yetkisi ayrı ayrı
atanır. Yetkisiz sekme kullanıcının sol menüsünde hiç görünmez.

| Sekme | İçerik |
| --- | --- |
| Gösterge Paneli | KPI'lar, riskli müşteri paneli, son etkileşim/sipariş, ERP bağlantı rozeti |
| Müşteriler | 360° müşteri kartı, paydaş hiyerarşisi, etkileşim geçmişi, davranış tahmini, ürün önerileri |
| Fırsatlar | Satış hunisi, aşama geçmişi, fırsat bazlı paydaş haritası |
| Teklifler (CPQ) | Ürün yapılandırma, dinamik maliyet, revizyon zinciri, onay akışı, PDF |
| Ürün Kataloğu | Ürünler, seçenek grupları, kısıtlama kuralları, standart BOM |
| Fiyatlandırma | Hammadde fiyatları + geçmişi, işçilik/mühendislik ücretleri, fiyat politikaları |
| Siparişler | Sipariş takibi, ERP'den canlı üretim durumu, mühendisliğe aktarım |
| Doküman & Şartname | Teknik şartnameler ve uygunluk matrisi (compliance matrix) |
| Sözleşmeler | NDA/garanti/bakım sözleşmeleri, sürüm geçmişi, yenileme takibi, PDF/PNG/JPEG evrak yükleme |
| Saha Servis | Sahadaki varlıklar, servis kayıtları, ziyaretler, periyodik bakım |
| Raporlar | RFM davranış analizi, segment dağılımı, yöntem açıklaması |
| Yetkilendirme Paneli | Kullanıcılar ve sekme bazlı yetki matrisi |

## 1. CPQ - Yapılandırma, Fiyatlandırma, Teklif

Sistemin kalbi. `server/src/services/cpq.ts` içindeki iki saf fonksiyon
üzerine kuruludur.

### Dinamik maliyet hesaplama

Maliyet, sabit bir liste fiyatından değil, **o anki** verilerden hesaplanır:

```
doğrudan maliyet = temel maliyet
                 + hammadde (güncel birim fiyat × miktar × (1 + fire%))
                 + işçilik (saat × güncel saatlik ücret)
                 + mühendislik eforu (saat × güncel saatlik ücret)
                 + seçeneklerin maliyet etkisi

toplam maliyet   = doğrudan maliyet + genel gider + mühendislik yükü + risk payı
önerilen fiyat   = toplam maliyet / (1 - hedef marj) + seçeneklerin fiyat etkisi
```

Yükler ve hedef marj **fiyat politikasından** gelir (Fiyatlandırma sekmesi).
Hammadde fiyatı değiştiğinde açık tekliflerde "Fiyatları güncelle" butonu
maliyetleri yeniden hesaplar; eski fiyat otomatik olarak fiyat geçmişine yazılır.

### Kurallı ürün konfigüratörü

Satış personelinin mühendislik açısından **üretilemez** veya **riskli** bir
kombinasyon seçmesini engelleyen kısıtlama kuralları vardır:

| Seviye | Davranış |
| --- | --- |
| `ENGELLE` | Teklif kalemi kaydedilemez, gerekçe gösterilir |
| `UYAR` | Uyarı gösterilir; satışçı "Uyarıları kabul et" demeden kaydedemez |

Kural tipleri: `GEREKTIRIR` (A seçilirse B zorunlu), `ENGELLER` (A seçilirse B
seçilemez), `UYARIR` (kombinasyon riskli). Ayrıca zorunlu grupta seçim
yapılmaması ve tekli grupta çoklu seçim de engellenir.

Örnek (başlangıç verisinde hazır):
- *90°C sıcak su modülü boyalı karbon çelik gövdeyle üretilemez* → **engeller**
- *Kurutma bölümü 1.5 kW tahrikle hat hızını sınırlar* → **uyarır**

### Çoklu revizyon yönetimi

Müşteri "şu parçayı da eklersek ne olur?" dediğinde eski teklif **silinmez**.
"Yeni revizyon" tüm kalemleri kopyalayarak Rev B'yi açar; Rev A `REVIZE_EDILDI`
olarak arşivde kalır. Teklif detayında revizyon zinciri gezilebilir ve her
revizyonun tutarı/marjı karşılaştırılabilir.

### Onay akışı

Teklif gönderilirken iki eşik kontrol edilir: kullanıcının **azami iskonto
yetkisi** (Yetkilendirme panelinden atanır) ve politikanın **asgari kâr marjı**.
Eşik aşılırsa teklif doğrudan gitmez, `ONAY_BEKLIYOR` durumuna düşer ve
gerekçesi yazılır. Onay yetkisi olan kullanıcı "Onayla ve gönder" ile geçirir.

## 2. ERP ve PLM entegrasyonu (Marpol PPM)

### Üretim durumu görünürlüğü

Sipariş kalemleri PPM'deki üretim emirlerine bağlanır. "ERP senkronize et"
butonu PPM'in REST API'sinden emrin durumunu, **hangi proses adımında**
olduğunu ve ilerleme yüzdesini çeker. Satış ekibi müşterinin "siparişim ne
durumda?" sorusunu CRM'den cevaplar.

Bağlantı `server/.env` ile yapılandırılır:

```
ERP_ENABLED=true
ERP_BASE_URL="http://localhost:4000/api"
ERP_USERNAME="admin"
ERP_PASSWORD="Marpol2026!"
```

PPM çalışmıyorsa CRM çalışmaya devam eder: ilgili alanlar son senkronizasyondaki
değerleri gösterir ve ekranda "ERP bağlantısı yok" uyarısı çıkar.

### Mühendislik (PLM) bağlantısı

Malzeme listesi (BOM) teklif aşamasında oluşur. Sipariş **Onaylandı** durumuna
geçtiğinde BOM dondurularak (snapshot) mühendisliğe aktarım kaydına dönüşür;
sonradan değişen hammadde fiyatları üretim listesini bozmaz.

## 3. Uzun satış döngüsü ve paydaş yönetimi

Sanayi projelerinde masada birden fazla karar verici olur. Sistem hesap
hiyerarşisini iki düzeyde tutar:

- **Müşteri kartında:** kişilerin departmanı, satın alma rolü (karar verici /
  teknik onaycı / ekonomik onaycı / kullanıcı / kapı bekçisi / etkileyici),
  etki gücü (1-5), Marpol'e tutumu ve *kime bağlı çalıştığı* — ağaç olarak
  görselleştirilir.
- **Fırsat kartında:** o projeye özel rol haritası. Aynı kişi farklı projede
  farklı rolde olabilir.

Kişi ve firma düzeyinde **pazarlık tarzı** ve **fiyat hassasiyeti** saklanır;
sistem tarza göre satışçıya kısa bir taktik notu gösterir.

## 4. Doküman ve sözleşme yönetimi

### Uygunluk matrisi (Compliance Matrix)

Müşteriden gelen teknik şartname madde madde sisteme girilir. Her madde için
kritiklik, karşılanma durumu, Marpol'ün cevabı ve karşılanmıyorsa önerilen
alternatif tutulur. Sistem uygunluk yüzdesini hesaplar (kapsam dışı maddeler
paydaya girmez) ve **kritik açıkları** ayrıca sayar — teklifin en büyük riski.

### Sözleşme yaşam döngüsü

NDA, çerçeve anlaşma, satış, garanti, bakım ve teslimat sözleşmeleri
versiyonlanarak saklanır. Her değişiklik yeni sürüm açar, eski sürüm arşivde
kalır. Bitiş/yenileme tarihi yaklaşan sözleşmeler gösterge panelinde ve
Sözleşmeler sekmesinde uyarı olarak listelenir.

### Sözleşme evrakı (dosya yükleme)

Islak imzalı sözleşmenin taranmış kopyası, imzaya gitmeden önceki taslaklar ve
ekler **PDF, PNG veya JPEG** olarak sözleşme kartına yüklenir. Dosya sürükle-bırak
ile veya seçilerek eklenir; her dosya `İmzalı Kopya / Taslak / Ek / Diğer` olarak
sınıflandırılır ve istenirse belirli bir **sürüme** bağlanır.

Dosyalar veritabanında değil, sunucuda **firmaya özel klasörde** saklanır:

```
server/uploads/contracts/<MÜŞTERİ_KODU>/<SÖZLEŞME_NO>/<uuid>.<uzantı>
```

Böylece bir firmanın tüm sözleşme evrakı tek klasörde toplanır; veritabanında
yalnızca üstverisi (özgün ad, tür, boyut, yükleyen, tarih) tutulur.

| Konu | Davranış |
| --- | --- |
| Kabul edilen türler | `application/pdf`, `image/png`, `image/jpeg` |
| Azami boyut | 20 MB (`UPLOAD_DIR` ile saklama dizini değiştirilebilir) |
| İçerik denetimi | Tarayıcının bildirdiği türe güvenilmez; dosyanın **imzası** (magic bytes) doğrulanır, uzantı taklidi engellenir |
| Erişim | Yükleme `oluştur`, silme `sil`, görüntüleme `görüntüle` yetkisine bağlıdır; dosya yalnızca oturum anahtarıyla indirilir |
| Önizleme | Görseller doğrudan, PDF gömülü çerçevede açılır - dosya blob olarak alınıp geçici URL üretilir |
| Temizlik | Evrak silindiğinde dosya diskten de silinir; sözleşme silindiğinde firma klasörü tamamen kaldırılır |

## 5. Satış sonrası hizmetler ve saha servisi

> Gereksinim dokümanında bu başlık "Üretilen endüstriyel makine veya sistemin
> teslimatı genellikle işin başlangıcıdır." cümlesinden sonra kesilmiş, alt
> maddeleri yazılmamıştı. Modül bu cümlenin mantığına göre tasarlandı;
> beklentiniz farklıysa kolayca daraltılıp genişletilebilir.

- **Sahadaki varlıklar:** seri no bazında teslim edilen makineler, garanti
  başlangıç/bitiş, bakım aralığı ve otomatik hesaplanan sonraki bakım tarihi.
- **Servis kayıtları:** arıza, periyodik bakım, devreye alma, eğitim, yedek
  parça ve şikâyet tipleri; SLA saatinden otomatik termin; gecikenler kırmızı.
- **Saha ziyaretleri:** teknisyen, işçilik saati, yol km'si, kullanılan
  parçalar ve otomatik maliyet; garanti kapsamındakiler faturalanmaz.
- Periyodik bakım kaydı kapandığında ilgili varlığın bakım takvimi otomatik
  ilerler.

## Davranış tahmini ve ürün önerileri

Makine öğrenmesi modeli değil, **açıklanabilir** kural tabanlı yaklaşım
kullanılır — satış ekibi her skorun neden o çıktığını müşteriye anlatabilmelidir.

**RFM analizi:** Yenilik (son siparişten bu yana geçen gün), Sıklık (sipariş
adedi) ve Parasal değer (toplam ciro). Her müşteri bu üç metrikte diğerlerine
göre 1-5 arası puanlanır; kombinasyondan segment (Champion, Düzenli, Risk
Altında, Kaybedilmiş, Potansiyel...) ve satın alma olasılığı türetilir. İptal
edilen siparişler analize girmez.

**Ürün önerileri:** müşterinin daha önce almadığı ürünler arasından (a) sık
aldığı ürün ailesinden olanlar, (b) aynı sektördeki diğer müşterilerin tercih
ettikleri ve (c) genel olarak çok satanlar puanlanır. Her öneri hangi gerekçeyle
önerildiğini gösterir.

**Aksiyona bağlama:** Gösterge panelindeki "Dikkat gerektiren müşteriler"
paneli, churn riski yüksek olduğu hâlde üzerinde açık görevi olmayan müşterileri
listeler ve tek tıkla takip görevi oluşturmayı sağlar — böylece davranış analizi
pasif bir rapor olmaktan çıkıp iş akışına döner.

## Giriş ekranı

Giriş paneline gelindiğinde `marpol_giris.mp4` tanıtım videosu tam ekran ve
**2.5x hızda** oynar, bittiğinde (veya "Geç ›" ile atlandığında) kaybolup şifre
paneli görünür. Tarayıcı otomatik oynatmayı engellerse video beklenmeden geçilir.
Logo olarak `marpol_svg.svg` hem giriş panelinde hem ShellBar'da kullanılır.

## Klasör yapısı

```
marpol crm/
├─ docker-compose.yml        PostgreSQL 17 konteyneri
├─ server/
│  ├─ prisma/schema.prisma   Veritabanı şeması (8 bölüm, ~40 model)
│  ├─ prisma/seed.ts         Başlangıç verisi
│  ├─ uploads/              Yüklenen sözleşme evrakı (firma klasörleri)
│  └─ src/
│     ├─ services/cpq.ts        Konfigüratör kuralları + maliyet motoru
│     ├─ services/analytics.ts  RFM analizi + öneri motoru
│     ├─ services/erp.ts        Marpol PPM istemcisi
│     ├─ lib/uploads.ts         Dosya saklama, tür ve boyut denetimi
│     ├─ middleware/auth.ts     JWT + sekme bazlı yetki kontrolü
│     └─ routes/                12 modülün API uçları
└─ web/
   ├─ public/                marpol.svg, marpol_giris.mp4
   └─ src/
      ├─ pages/              12 sekme + giriş ekranı
      ├─ components/ui.tsx   Ortak bileşenler ve durum rozetleri
      ├─ lib/format.ts       Etiket sözlükleri ve biçimlendiriciler
      └─ pdf/quotePdf.ts     Marpol antetli teklif PDF'i
```

## Sonraki aşama fikirleri

- Dokümanlar ve teknik şartnamelerde gerçek dosya yükleme (sözleşmelerde eklendi; burada hâlâ dosya adı/bağlantı tutuluyor)
- E-posta ve takvim entegrasyonuyla otomatik etkileşim kaydı
- Teklif onay akışının e-posta bildirimiyle desteklenmesi
- PPM'e üretim emri **oluşturma** (şu an yalnızca okuma yapılıyor)
- Çoklu para birimi ve kur takibi
