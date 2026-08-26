# Marpol CRM — Sistem Özellikleri (Tam Liste)

> Bu doküman, `marpol crm` projesinde **kodda fiilen mevcut olan** tüm özelliklerin
> envanteridir. Kaynak: `server/prisma/schema.prisma`, `server/src/**`, `web/src/**`.
> Son güncelleme: 26.08.2026

---

## 1. Genel Mimari ve Teknoloji

| Katman | Teknoloji / Ayrıntı |
| --- | --- |
| Veritabanı | PostgreSQL 17 (Docker, port **5444**) |
| ORM | Prisma (`schema.prisma` — 8 bölüm, ~40 model) |
| Sunucu | Node.js + TypeScript + Express (port **4100**) |
| Doğrulama | Zod şemaları ile istek gövdesi doğrulama |
| Kimlik doğrulama | JWT (Bearer token, varsayılan 12 saat) + bcrypt |
| Arayüz | React 18 + TypeScript + Vite (port **5174**) |
| Tasarım sistemi | SAP UI5 Web Components (Horizon / Horizon Dark) |
| Veri yönetimi | TanStack Query (önbellek + otomatik yenileme) |
| PDF | pdfmake (istemci tarafında, gömülü Roboto fontuyla Türkçe destekli) |
| Dosya yükleme | multer 2.x (bellekte tampon) + disk saklama, tür ve imza denetimi |
| Log | morgan (dev / combined) |
| Workspace | npm workspaces (`server`, `web`) + concurrently ile tek komutla çalıştırma |

**Portlar Marpol PPM ile çakışmayacak şekilde seçilmiştir** (PPM: 4000/5173/5433 — CRM: 4100/5174/5444); iki sistem aynı anda çalışabilir.

### Kurulum / çalıştırma komutları
- `npm run setup` — bağımlılıklar + DB konteyner + şema + seed
- `npm run db:up` / `npm run db:down` — PostgreSQL konteynerini aç / kapat
- `npm run prisma:push` — şemayı veritabanına uygula
- `npm run seed` — başlangıç verisi ve demo kullanıcılar
- `npm run dev` — API + arayüz birlikte (renk kodlu paralel çıktı)
- `npm run build` — sunucu + arayüz derlemesi

---

## 2. Kimlik Doğrulama ve Yetkilendirme

### 2.1 Oturum
- `POST /api/auth/login` — kullanıcı adı + şifre ile JWT üretimi, `lastLoginAt` güncellemesi
- `GET /api/auth/me` — oturumdaki kullanıcı + yetki matrisi
- `POST /api/auth/change-password` — kullanıcının kendi şifresini değiştirmesi (profil menüsünden diyalog)
- Pasif kullanıcı (`isActive = false`) girişte engellenir
- Token süresi dolduğunda / geçersiz olduğunda 401 ile oturum düşürülür
- CORS whitelist, `4mb` istek gövdesi sınırı

### 2.2 Modül (sekme) bazlı yetki modeli
Sistemde **12 modül anahtarı** (`ModuleKey`) vardır; yetkiler kullanıcı × modül kırılımında verilir:

`GOSTERGE_PANELI`, `MUSTERILER`, `FIRSATLAR`, `TEKLIFLER`, `URUN_KATALOGU`, `FIYATLANDIRMA`, `SIPARISLER`, `DOKUMANLAR`, `SOZLESMELER`, `SAHA_SERVIS`, `RAPORLAR`, `YETKILENDIRME`

Her modül için 5 ayrı bayrak:

| Yetki | Anlamı |
| --- | --- |
| `canView` | Sekmeyi görüntüleme (yetki yoksa sekme sol menüde **hiç görünmez**) |
| `canCreate` | Yeni kayıt açma |
| `canEdit` | Mevcut kaydı düzenleme |
| `canDelete` | Kayıt silme |
| `canApprove` | Teklif onaylama, iskonto onayı, sözleşme yürürlüğe alma, siparişe dönüştürme gibi özel işlemler |

- `isAdmin` kullanıcılar tüm yetkilere sahiptir (yetki kontrolü atlanır)
- Yetki kontrolü hem **sunucuda** (`requirePermission` middleware) hem **arayüzde** (`Guard` bileşeni + buton gizleme) uygulanır
- Yetkisiz rotaya erişimde "Bu sayfaya erişim yetkiniz yok" ekranı
- Kullanıcı başına **azami iskonto yetkisi** (`maxDiscountPct`) — teklif onay akışını tetikler

### 2.3 Kullanıcı yönetimi (Yetkilendirme Paneli)
- Kullanıcı listeleme + arama (ad, kullanıcı adı, sicil no, departman)
- Kullanıcı oluşturma / düzenleme / silme
- Alanlar: kullanıcı adı, şifre, ad soyad, sicil no, departman, ünvan, e-posta, telefon, sistem yöneticisi, aktiflik, azami iskonto yetkisi
- **Yetki matrisi ekranı**: 12 sekme × 5 yetki onay kutusu; tanımsız satırlar boş olarak tamamlanır
- `GET /api/users/modules` — sistemdeki sekme listesi
- Son giriş tarihi görüntüleme

### 2.4 Denetim kaydı (Audit Log)
- Tüm kritik işlemler `audit_logs` tablosuna yazılır: kullanıcı, aksiyon, varlık, varlık id, JSON detay, IP, zaman
- Kaydedilen aksiyon örnekleri: `CREATE`, `UPDATE`, `DELETE`, `STATUS_CHANGE`, `APPROVE`, `CONVERT`, `REVISE`, `REPRICE`, `HANDOVER`, `HANDOVER_STATUS`, `ERP_LINK`, `ERP_UNLINK`, `ERP_SYNC`, `UPLOAD`
- Log yazma hatası ana işlemi bozmaz (hata yutulur, konsola düşer)

---

## 3. Gösterge Paneli (Dashboard)

`GET /api/dashboard`

### KPI kartları
- Aktif müşteri sayısı
- Açık fırsat sayısı
- Toplam pipeline değeri
- **Ağırlıklı pipeline** (beklenen değer × kazanma olasılığı)
- Açık teklif sayısı / onay bekleyen teklif sayısı
- Toplam ciro (lifetime value)
- Üretimdeki (aktif) sipariş sayısı
- **Termini geçen sipariş** sayısı
- Açık servis kaydı / SLA'sı geçmiş servis kaydı
- 30 gün içinde bitecek veya yenilenecek sözleşme sayısı
- Termini geçmiş görev sayısı

### Paneller
- **Dikkat gerektiren müşteriler**: churn riski yüksek olduğu hâlde üzerinde açık görev bulunmayan müşteriler; segment, son siparişten bu yana geçen gün ve satın alma olasılığıyla listelenir. Satırdan **tek tıkla takip görevi oluşturma**
- Segment dağılımı (RFM segmentlerine göre müşteri sayıları)
- Yaklaşan görevler (en yakın 8 kayıt; sorumlusu ve müşterisiyle)
- Son etkileşimler (en son 8 temas)
- Son siparişler (en son 8 sipariş)

### Canlı bileşenler
- `GET /api/dashboard/ticker` — ShellBar'da sağdan sola akan **canlı durum şeridi**: aktif müşteri, açık fırsat, bekleyen teklif, üretimdeki sipariş, termini geçen (kritik/kırmızı), açık servis (kritik/kırmızı). 60 saniyede bir yenilenir
- `GET /api/dashboard/erp` — **ERP bağlantı rozeti** (Marpol PPM erişilebilir mi)

---

## 4. Müşteriler (360° Müşteri Kartı)

### 4.1 Müşteri kaydı
- Kod (MST-XXXX), unvan, kısa ad, sektör, durum (`POTANSIYEL` / `AKTIF` / `PASIF` / `KARA_LISTE`)
- İletişim: telefon, e-posta, web sitesi, adres, şehir, ülke
- Vergi no / vergi dairesi
- **Ticari koşullar**: para birimi, ödeme koşulu, teslim koşulu, kredi limiti, sözleşmeli standart iskonto (%)
- **Davranış profili**: pazarlık tarzı, fiyat hassasiyeti
- Serbest notlar, pazarlık geçmişi / davranış gözlemleri, bilinen rakipler
- Satış temsilcisi (owner) ataması, aktif / pasif
- Liste araması, kayıt sayısı göstergesi

### 4.2 Pazarlık tarzı ve fiyat hassasiyeti
- `NegotiationStyle`: `ISBIRLIKCI`, `REKABETCI`, `FIYAT_ODAKLI`, `ILISKI_ODAKLI`, `ANALITIK`, `KACINGAN`
- `PriceSensitivity`: `DUSUK`, `ORTA`, `YUKSEK`

> Sistem, tarza göre satışçıya kısa bir **taktik notu** gösterir.

### 4.3 Paydaş (kişi) yönetimi ve hesap hiyerarşisi
- Kişi kartı: ad soyad, ünvan, e-posta, telefon, cep
- **Departman**: `SATIN_ALMA`, `MUHENDISLIK`, `URETIM`, `KALITE`, `FINANS`, `UST_YONETIM`, `BAKIM`, `DIGER`
- **Satın alma rolü**: `KARAR_VERICI`, `TEKNIK_ONAYCI`, `EKONOMIK_ONAYCI`, `KULLANICI`, `KAPI_BEKCISI`, `ETKILEYICI`
- **Etki gücü** (1–5) ve **tutum** (`DESTEKLIYOR` / `NOTR` / `KARSIT`)
- Kişi bazında pazarlık tarzı, fiyat hassasiyeti, geri dönüş hızı, serbest notlar
- **"Kime bağlı çalışıyor"** ilişkisiyle firma içi **hiyerarşi ağacı görselleştirmesi**
- Birincil kişi işareti, aktif / pasif
- CRUD: `GET/POST /api/customers/:id/contacts`, `PUT/DELETE /api/customers/contacts/:contactId`

### 4.4 Etkileşim geçmişi
- Tür: `TELEFON`, `EPOSTA`, `ZIYARET`, `TOPLANTI`, `FUAR`, `DEMO`, `TEKLIF_SUNUMU`, `SERVIS`, `DIGER`
- Konu, özet, **sonuç / alınan aksiyon**, duygu durumu, gerçekleşme tarihi, **takip tarihi**
- Kişi ve fırsatla ilişkilendirme, kaydeden kullanıcı
- `GET/POST /api/customers/:id/interactions`

### 4.5 Görevler / hatırlatıcılar
- Başlık, açıklama, termin, durum (`ACIK` / `TAMAMLANDI` / `IPTAL`), tamamlanma zamanı
- Müşteri, fırsat ve sorumlu kullanıcı bağlantısı
- `GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks/:id/status`, `DELETE /api/tasks/:id`

### 4.6 Davranış tahmini ve ürün önerileri (müşteri kartında)
- `GET /api/customers/:id/behavior` — o müşterinin RFM profili ve **açıklaması**
- `GET /api/customers/behavior/overview` — tüm müşterilerin davranış tablosu
- `GET /api/customers/:id/recommendations` — gerekçeli ürün önerileri
- Müşteri kartında davranış segmenti, satın alma olasılığı, son sipariş ve toplam ciro rozetleri

---

## 5. Fırsat Yönetimi (Uzun Satış Döngüsü)

- Fırsat kodu (FRS-YYYY-XXXX), başlık, açıklama, müşteri
- **Aşamalar**: `KESIF` → `NITELENDIRME` → `TEKNIK_DEGERLENDIRME` → `TEKLIF` → `PAZARLIK` → `KAZANILDI` / `KAYBEDILDI`
- Kazanma olasılığı (%) — aşamaya göre önerilir, elle değiştirilebilir
- Beklenen değer, para birimi, beklenen kapanış tarihi, açılış / kapanış tarihi, **döngü süresi**
- Kaynak, rakip, **kayıp gerekçesi**, notlar, sorumlu satışçı
- **Aşama geçmişi** (`OpportunityStageHistory`): hangi aşamadan hangisine, ne zaman, hangi notla geçildi — `PATCH /api/opportunities/:id/stage`
- **Fırsat bazlı paydaş haritası**: aynı kişi farklı projede farklı rolde olabilir; rol, etki gücü, tutum ve not ayrı tutulur (`POST /api/opportunities/:id/stakeholders`)
- Fırsata bağlı teklifler, etkileşimler, görevler, dokümanlar ve şartnameler tek ekranda
- **Satış hunisi özeti**: `GET /api/opportunities/pipeline/summary` — aşama bazında adet / tutar, toplam ve ağırlıklı pipeline

---

## 6. Teklifler — CPQ (Yapılandır, Fiyatlandır, Teklif Ver)

Sistemin çekirdeği. `server/src/services/cpq.ts` içindeki iki saf (pure) fonksiyon üzerine kuruludur.

### 6.1 Kurallı ürün konfigüratörü (`validateConfiguration`)
Denetlenen durumlar:
- Zorunlu grupta seçim yapılmamış olması → **engelle**
- Tekli grupta birden fazla seçim → **engelle**
- Tanımsız seçenek kodu → **engelle**
- Artık üretilmeyen (pasif) seçenek → **engelle**
- Kısıtlama kuralları:

| Kural tipi | Anlamı |
| --- | --- |
| `GEREKTIRIR` | A seçilirse B de seçilmelidir |
| `ENGELLER` | A seçilirse B seçilemez |
| `UYARIR` | A + B riskli; engellenmez, uyarı verilir |

| Seviye | Davranış |
| --- | --- |
| `ENGELLE` | Teklif kalemi kaydedilemez, gerekçe gösterilir |
| `UYAR` | Uyarı gösterilir; satışçı **"Uyarıları kabul et"** demeden kaydedemez |

- `POST /api/catalog/products/:id/configure` — canlı konfigürasyon doğrulama + maliyet önizleme

### 6.2 Dinamik maliyet motoru (`calculateCost`)
Maliyet sabit liste fiyatından değil, **o anki** verilerden hesaplanır:

```
doğrudan maliyet = temel maliyet
                 + hammadde (güncel birim fiyat × miktar × (1 + fire%))
                 + atölye işçiliği (saat × güncel saatlik ücret)
                 + mühendislik eforu (saat × güncel saatlik ücret)
                 + seçeneklerin maliyet etkisi
                 + seçeneklerin getirdiği ek işçilik saati

toplam maliyet   = doğrudan maliyet + genel gider + mühendislik yükü + risk payı
önerilen fiyat   = toplam maliyet / (1 - hedef marj) + seçeneklerin fiyat etkisi
termin           = ürünün standart termini + seçeneklerin termin etkisi
```

Maliyet kırılımı arayüzde satır satır gösterilir: temel maliyet, hammadde, işçilik, mühendislik, seçenek etkisi, doğrudan maliyet, genel gider, mühendislik yükü, risk payı, birim maliyet, önerilen birim fiyat, termin.

- Kâr marjı hesabı: `(fiyat - maliyet) / fiyat × 100`
- **"Fiyatları güncelle" (reprice)**: `POST /api/quotes/:id/reprice` — hammadde zamlandığında açık teklifin tüm kalemlerini güncel fiyatlarla yeniden hesaplar

### 6.3 Onay akışı (`needsApproval`)
Teklif gönderilirken **iki eşik** kontrol edilir:
1. Kullanıcının **azami iskonto yetkisi** (Yetkilendirme panelinden atanır)
2. Fiyat politikasının **asgari kâr marjı**

Eşik aşılırsa teklif doğrudan gitmez, `ONAY_BEKLIYOR` durumuna düşer ve gerekçe metni otomatik yazılır (örn. *"İskonto %12,0, yetkiniz olan %5,0 sınırının üzerinde."*). `canApprove` yetkisi olan kullanıcı **"Onayla ve gönder"** ile geçirir (`POST /api/quotes/:id/approve`).

### 6.4 Revizyon zinciri
- `POST /api/quotes/:id/revise` — mevcut teklifin **birebir kopyası** bir sonraki revizyon olarak açılır (Rev A → Rev B → …)
- Eski revizyon **silinmez**, `REVIZE_EDILDI` olarak arşivde kalır; `isCurrent` bayrağı yeni revizyona geçer
- Kök teklif (`rootQuoteId`) ve ebeveyn (`parentQuoteId`) ilişkisiyle zincir gezilebilir
- Revizyon gerekçesi (`revisionNote`) saklanır
- Her revizyonun tutarı ve marjı karşılaştırılabilir

### 6.5 Teklif kaydı
- Teklif no (TKF-YYYY-XXXX) + revizyon, başlık, müşteri, fırsat, fiyat politikası
- **Durumlar**: `TASLAK`, `ONAY_BEKLIYOR`, `GONDERILDI`, `PAZARLIK`, `KABUL_EDILDI`, `REDDEDILDI`, `SURESI_DOLDU`, `REVIZE_EDILDI`
- Tarihler: düzenleme, geçerlilik, gönderim, karar
- Tutarlar: ara toplam, genel iskonto (% ve tutar), **toplam maliyet**, müşteriye çıkan tutar, **gerçekleşen kâr marjı**
- Ödeme koşulu, teslim koşulu, termin (gün), şartlar, notlar
- Hazırlayan / onaylayan kullanıcı ve onay notu
- Toplamlar her kalem ve iskonto değişiminde otomatik yeniden hesaplanır

### 6.6 Teklif kalemleri
- Ürün seçimi, açıklama, miktar, birim
- Seçilen konfigürasyon seçenekleri ve bunların **o anki** maliyet / fiyat etkisi (sonradan değişse de teklif sabit kalır)
- Konfigürasyon **anlık görüntüsü** (`configSnapshot`) JSON olarak saklanır
- Kalem bazında BOM satırları ve işçilik / mühendislik satırları
- Kalem bazında birim maliyet, birim fiyat, iskonto, satır toplamı, satır maliyeti, marj, termin

### 6.7 Teklif PDF'i
- **Marpol antetli, kurumsal kırmızı (#e30613) teklif PDF'i** — `web/src/pdf/quotePdf.ts`
- Kalem tablosu, seçilen opsiyonların alt satırda listelenmesi, tutar / iskonto / toplam blokları
- İstemci tarafında üretilir (sunucuya yük binmez); gömülü fontla Türkçe karakter desteği
- Teklif ekranından **"PDF indir"** butonu

### 6.8 Siparişe dönüştürme
- `POST /api/quotes/:id/convert-to-order` (yalnız `canApprove` yetkisi)
- Yalnızca **"Kabul Edildi"** durumundaki teklifler dönüştürülebilir
- Aynı teklif ikinci kez dönüştürülemez (mükerrer sipariş koruması)
- Müşteri PO no ve taahhüt tarihi alınır; tarih verilmezse **teklifteki termin gününden otomatik hesaplanır**
- Tüm kalemler ve konfigürasyon anlık görüntüleri siparişe kopyalanır; sipariş durum geçmişine ilk kayıt düşülür

---

## 7. Ürün Kataloğu ve Konfigüratör Tanımları

- **Ürün**: kod, ad, ürün ailesi, açıklama, birim, konfigüre edilebilir mi, liste fiyatı (standart ürünler için), temel maliyet, standart termin (gün), notlar, aktiflik
- **Seçenek grupları**: kod, ad, zorunlu mu, çoklu seçim mi, sıra, yardım metni
- **Seçenekler**: kod, ad, açıklama, maliyet etkisi, fiyat etkisi, termin etkisi (gün), ek işçilik (saat), serbest teknik nitelikler (JSON: basınç, sıcaklık, malzeme sınıfı vb.), varsayılan / aktif / sıra
- **Kısıtlama kuralları**: kod, ad, tip (`GEREKTIRIR` / `ENGELLER` / `UYARIR`), seviye (`ENGELLE` / `UYAR`), tetikleyen seçenek kodları, hedef seçenek kodları, kullanıcıya gösterilecek mesaj, aktiflik
- **Standart BOM**: ürüne bağlı malzeme listesi satırları (malzeme, miktar, birim, birim maliyet, fire, revizyon işareti) — teklife kopyalanır
- **Standart işçilik**: ürüne bağlı işçilik / mühendislik satırları (ücret tipi, saat)
- Tam CRUD: ürün, grup, seçenek, kural, BOM satırı, işçilik satırı
- Ürün arama ve detay ekranı

### Başlangıç verisindeki hazır kural örnekleri
- *90 °C sıcak su modülü boyalı karbon çelik gövdeyle üretilemez* → **engeller**
- *Kurutma bölümü 1.5 kW tahrikle hat hızını sınırlar* → **uyarır**

---

## 8. Fiyatlandırma

### 8.1 Hammaddeler
- Kod, ad, kategori, birim, **güncel birim fiyat**, para birimi, son güncelleme tarihi
- **Fire oranı (%)** — maliyete doğrudan yansır
- Tedarikçi, notlar, aktiflik
- **Fiyat geçmişi**: fiyat her değiştiğinde eski değer otomatik olarak `material_price_history` tablosuna yazılır (fiyat, tarih, kaynak, not) — `GET /api/pricing/materials/:id/history`

### 8.2 İşçilik ve mühendislik ücretleri
- Kod, ad, **tip**: `ISCILIK` (atölye), `MUHENDISLIK` (tasarım / proje), `SAHA_SERVIS` (teknisyen)
- Saatlik ücret, para birimi, notlar, aktiflik
- Bu ücretler hem CPQ maliyetinde hem saha servis ziyaret maliyetinde kullanılır

### 8.3 Fiyat politikaları
- Kod, ad
- **Genel üretim gideri (%)**, **mühendislik / proje yönetim yükü (%)**, **risk payı (%)**
- **Hedef kâr marjı (%)** — önerilen satış fiyatını belirler
- **Asgari kâr marjı (%)** — altına inen teklifler onaya düşer
- Varsayılan politika işareti, aktiflik, notlar
- Teklif bazında politika seçilebilir

---

## 9. Siparişler ve ERP / PLM Entegrasyonu

### 9.1 Sipariş yönetimi
- Sipariş no (SPR-YYYY-XXXX), müşteri, kaynak teklif, fırsat
- **Durumlar**: `ONAY_BEKLIYOR`, `ONAYLANDI`, `URETIMDE`, `KISMI_SEVK`, `SEVK_EDILDI`, `TESLIM_EDILDI`, `FATURALANDI`, `IPTAL`
- Sipariş tarihi, **taahhüt edilen teslim tarihi**, teslim tarihi
- Tutar, para birimi, **müşterinin kendi PO numarası**, teslim / ödeme koşulu, notlar, oluşturan
- **Sipariş durum geçmişi**: her durum değişimi kimden kime, ne zaman, hangi notla (`PATCH /api/orders/:id/status`)
- Kalem bazında üretilen miktar / sevk edilen miktar takibi
- KPI özeti: `GET /api/orders/summary/kpi` — toplam sipariş, toplam ciro, onay bekleyen, üretimde, termini geçen
- **Termini geçen siparişler** ayrı vurgulanır

### 9.2 ERP entegrasyonu (Marpol PPM)
- Servis kullanıcısıyla PPM REST API'sine JWT ile bağlanır; token bellek içinde önbelleklenir
- **6 saniyelik zaman aşımlı fetch** — istekler sonsuza kadar beklemez
- `GET /api/orders/erp/status` — bağlantı sağlığı (gösterge panelinde ve sipariş ekranında rozet)
- `GET /api/orders/erp/search?q=` — PPM'de üretim emri arama
- `POST /api/orders/items/:itemId/erp-link` — sipariş kalemini üretim emrine bağlama
- `DELETE /api/orders/items/:itemId/erp-link` — bağlantıyı kaldırma
- `POST /api/orders/:id/erp-sync` — **"ERP senkronize et"**: siparişin tüm kalemleri için PPM'den güncel durumu çeker
- Okunan bilgiler: ERP durumu, **hangi proses adımında olduğu**, ilerleme yüzdesi, üretilen miktar, ERP termini, son senkronizasyon zamanı, ham cevap (JSON)
- **Dayanıklılık**: PPM kapalıysa CRM çalışmaya devam eder — hata fırlatılmaz, her kaleme "bağlantı yok" notu yazılır, ekranda uyarı çıkar, alanlar son senkronizasyondaki değerleri gösterir
- Yapılandırma: `ERP_ENABLED`, `ERP_BASE_URL`, `ERP_USERNAME`, `ERP_PASSWORD`

### 9.3 Mühendisliğe aktarım (PLM bağlantısı)
- Sipariş **Onaylandı** durumuna geçtiğinde BOM **dondurularak** (snapshot) mühendisliğe aktarım kaydına dönüşür
- Snapshot içeriği: sipariş no, üretim zamanı, kalem başına konfigürasyon, BOM satırları (revizyon işaretiyle), işçilik satırları (tip ve saat)
- Sonradan değişen hammadde fiyatları üretim listesini bozmaz
- Aktarım durumları: `BEKLIYOR`, `GONDERILDI`, `KABUL_EDILDI`, `REVIZE_ISTENDI` (`PATCH /api/orders/handovers/:handoverId`)
- Aynı sipariş için bekleyen aktarım varsa mükerrer kayıt oluşturulmaz
- ERP referansı ve mühendislik cevabı notu saklanır

---

## 10. Doküman ve Teknik Şartname Yönetimi

### 10.1 Dokümanlar
- Tür: `TEKNIK_SARTNAME`, `CIZIM`, `SERTIFIKA`, `TEST_RAPORU`, `SUNUM`, `YAZISMA`, `DIGER`
- Başlık, doküman no, sürüm, dosya adı, **harici bağlantı (paylaşılan sürücü / DMS)**, notlar
- Müşteri, fırsat, teklif ve siparişe bağlanabilir
- Tam CRUD + arama

### 10.2 Teknik şartnameler
- Müşteriden gelen şartname dokümanı: başlık, doküman no, revizyon, geliş tarihi, dosya / bağlantı, notlar
- Müşteri, fırsat ve teklif ilişkisi

### 10.3 Uygunluk matrisi (Compliance Matrix)
- Şartname **madde madde** sisteme girilir: madde no (ör. "4.2.1"), metin, kategori
- **Kritiklik**: `DUSUK`, `ORTA`, `YUKSEK`, `KRITIK`
- **Karşılanma durumu**: `KARSILANIYOR`, `KISMEN_KARSILANIYOR`, `KARSILANMIYOR`, `DEGERLENDIRILIYOR`, `KAPSAM_DISI`
- Marpol'ün maddeye cevabı; karşılanmıyorsa **önerilen alternatif / sapma**
- Madde sorumlusu ataması, maddeyi karşılayan **teklif kalemi** bağlantısı
- **Otomatik uygunluk oranı** hesabı (kapsam dışı maddeler paydaya girmez)
- **Kritik açık sayacı** — teklifin en büyük riski ayrıca sayılır
- Toplam madde / uygunluk oranı / kritik açık KPI kartları

---

## 11. Sözleşme Yaşam Döngüsü

- Sözleşme no, müşteri, başlık
- **Tür**: `NDA`, `CERCEVE`, `SATIS`, `GARANTI`, `BAKIM`, `TESLIMAT`, `DIGER`
- **Durum**: `TASLAK`, `INCELEMEDE`, `IMZA_BEKLIYOR`, `YURURLUKTE`, `SONA_ERDI`, `FESHEDILDI` (`PATCH /api/contracts/:id/status`)
- Başlangıç, bitiş, **yenileme hatırlatma tarihi**, otomatik yenileme bayrağı
- Bedel ve para birimi
- **Garanti süresi (ay)**, teslim koşulu (EXW / FCA / DAP …), ödeme koşulu, **cezai şart**, uygulanacak hukuk, notlar
- **Sürüm (versiyon) yönetimi**: her değişiklik yeni sürüm açar (`POST /api/contracts/:id/versions`); sürüm no, değişiklik notu, tam metin / özet, dosya / bağlantı, oluşturan, güncel sürüm işareti. Eski sürümler arşivde kalır
- **Evrak yükleme (PDF / PNG / JPEG)**: ıslak imzalı sözleşmenin taranmış kopyası, imzaya gitmeden önceki taslaklar ve ekler sözleşme kartına yüklenir
  - Sürükle-bırak veya dosya seçimi; her evrak `İmzalı Kopya` / `Taslak` / `Ek-Zeyilname` / `Diğer` olarak sınıflandırılır ve istenirse belirli bir **sürüme** bağlanır
  - **Firmaya özel klasör**: `server/uploads/contracts/<MÜŞTERİ_KODU>/<SÖZLEŞME_NO>/<uuid>.<uzantı>` — veritabanında yalnızca üstveri (özgün ad, tür, boyut, yükleyen, tarih, not)
  - Azami **20 MB**; yalnızca `application/pdf`, `image/png`, `image/jpeg`
  - **İçerik denetimi**: tarayıcının bildirdiği türe güvenilmez, dosyanın imzası (magic bytes) doğrulanır — uzantı taklidi engellenir
  - **Önizleme**: görseller doğrudan, PDF gömülü çerçevede; dosya oturum anahtarıyla blob olarak alınır, geçici URL üretilir (korumasız bağlantı oluşmaz)
  - İndirme (özgün dosya adıyla, RFC 5987 kodlaması) ve silme; evrak silindiğinde dosya diskten de silinir, sözleşme silindiğinde firma klasörü tamamen kaldırılır
  - Yükleme `oluştur`, silme `sil`, görüntüleme `görüntüle` yetkisine bağlıdır; her işlem denetim kaydına yazılır (`UPLOAD` / `DELETE`)
  - Sözleşme listesinde firma bazında **evrak sayısı** sütunu
- **Yaklaşan sözleşmeler**: `GET /api/contracts/expiring` — 60 gün içinde bitecek / yenilenecekler; gösterge panelinde ve Sözleşmeler sekmesinde uyarı olarak listelenir
- KPI kartları: toplam, yürürlükte, imza bekleyen, 60 gün içinde bitecek

---

## 12. Satış Sonrası Hizmetler ve Saha Servisi

### 12.1 Sahadaki varlıklar (Installed Base)
- **Seri no** bazında teslim edilen makine / sistem; müşteri, sipariş, sipariş kalemi ve ürün bağlantısı
- Varlık adı, konum, kurulum tarihi, devreye alma tarihi
- **Garanti başlangıç / bitiş** tarihleri
- **Durum**: `DEVREYE_ALINDI`, `CALISIYOR`, `ARIZALI`, `BAKIMDA`, `HIZMET_DISI`
- **Periyodik bakım aralığı (ay)**, son servis tarihi, **otomatik hesaplanan sonraki bakım tarihi**
- `GET /api/service/assets/due` — **bakımı yaklaşan varlıklar**

### 12.2 Servis kayıtları (Ticket)
- Kayıt no, müşteri, varlık, müşteri kişisi, sipariş bağlantısı
- **Tür**: `ARIZA`, `PERIYODIK_BAKIM`, `DEVREYE_ALMA`, `EGITIM`, `YEDEK_PARCA`, `SIKAYET`, `DIGER`
- **Durum**: `ACIK`, `ATANDI`, `SAHADA`, `BEKLEMEDE`, `COZULDU`, `KAPANDI`
- **Öncelik**: `DUSUK`, `ORTA`, `YUKSEK`, `KRITIK`
- Konu, açıklama, çözüm
- **Garanti kapsamında mı** (faturalanmaz) bayrağı
- **SLA süresi (saat)** — sözleşmedeki müdahale süresinden **otomatik termin hesabı**; geciken kayıtlar kırmızı gösterilir
- Açılış / termin / kapanış tarihleri, atanan teknisyen
- **Otomasyon**: periyodik bakım kaydı kapandığında ilgili varlığın `lastServiceAt` ve `nextServiceAt` alanları otomatik ilerler

### 12.3 Saha ziyaretleri
- Teknisyen, kullanılacak saatlik ücret tipi
- Planlanan / başlangıç / bitiş zamanı
- Yapılan iş, **yol km'si**, **işçilik saati**
- **Kullanılan parçalar**: malzeme, miktar, birim, birim fiyat, satır tutarı
- **Otomatik toplam maliyet** hesabı (işçilik saati × saatlik ücret + parça tutarları); parça eklendiğinde / silindiğinde yeniden hesaplanır
- **Faturalanacak mı** bayrağı — garanti kapsamındakiler faturalanmaz
- **Müşteri imzası** (imzalayan ad soyad), notlar

### 12.4 Servis özeti
- `GET /api/service/summary` — açık servis kaydı, SLA dışı kayıt, bakımı yaklaşan varlık, toplam servis maliyeti

---

## 13. Raporlar — Davranış Analizi ve Öneri Motoru

> Makine öğrenmesi modeli değil, bilinçli olarak **açıklanabilir** kural tabanlı yaklaşım: satış ekibi her skorun neden o çıktığını müşteriye anlatabilmelidir.

### 13.1 RFM analizi (`analyzeBehavior`)
- **Yenilik (R)**: son siparişten bu yana geçen gün (küçük olan iyi → ters puanlama)
- **Sıklık (F)**: geçerli sipariş adedi
- **Parasal değer (M)**: toplam ciro
- Her müşteri, tüm müşterilerin dağılımı içindeki yerine göre her metrikte **1–5 arası** puanlanır (quintile)
- **İptal edilen siparişler analize girmez**
- Hiç siparişi olmayan müşteri "Potansiyel Müşteri" olarak ayrılır; kayıt 90 günden yeniyse olasılık daha yüksek verilir

### 13.2 Segmentler ve satın alma olasılığı

| Segment | Koşul (R / FM) | Satın alma olasılığı |
| --- | --- | --- |
| Sadık Müşteri (Champion) | R ≥ 4, FM ≥ 4 | %88 |
| Düzenli Müşteri | R ≥ 4, FM ≥ 3 | %74 |
| Sadık ama Yavaşlayan | R = 3, FM ≥ 4 | %62 |
| Yeni Müşteri | R ≥ 4, FM < 3 | %58 |
| Standart Müşteri | R = 3 | %45 |
| Potansiyel Müşteri (yeni kayıt) | sipariş yok, ≤ 90 gün | %35 |
| Risk Altında | R ≤ 2, FM ≥ 4 | %32 |
| Uykuya Dalmış | R ≤ 2, FM ≥ 3 | %24 |
| Potansiyel Müşteri (eski kayıt) | sipariş yok, > 90 gün | %18 |
| Kaybedilmiş Müşteri | diğer | %12 |

- **Churn (kayıp) riski**: düşük / orta / yüksek olarak türetilir
- Her satır için **gerekçe metni** üretilir: *"Son sipariş 42 gün önce (yenilik 4/5), toplam 6 sipariş (sıklık 4/5), toplam ciro 3.250.000 (değer 5/5)."*

### 13.3 Ürün öneri motoru (`recommendProducts`)
Müşterinin **daha önce almadığı** ürünler arasından, üç sinyalin ağırlıklı toplamıyla 0–100 arası puanlanır:

| Sinyal | Ağırlık | Açıklama |
| --- | --- | --- |
| (a) Ürün ailesi benzerliği | 55 puan | Müşterinin sık aldığı ürün ailesinden olması |
| (b) Sektör benzerliği | 30 puan | Aynı sektördeki diğer müşterilerin tercih etmesi |
| (c) Genel satış performansı | 15 puan | Genel olarak çok satan bir ürün olması |

- Hiçbir sinyal üretmeyen ürünler öneri listesine girmez
- **Her öneri, hangi gerekçeyle önerildiğini birebir gösterir** (örn. *"Gıda sektöründeki 3 müşteri bu ürünü alıyor."*)
- Varsayılan olarak en yüksek puanlı 5 öneri döner

### 13.4 Raporlar sekmesi
- Analiz edilen müşteri sayısı, toplam ciro, sadık müşteri sayısı, yüksek kayıp riski sayısı
- Müşteri bazında tablo: segment, sektör, sipariş adedi, ciro, son sipariş, satın alma olasılığı, kayıp riski
- **"RFM nasıl okunur?"** yöntem açıklaması paneli (R / F / M tanımları)

### 13.5 Aksiyona bağlama
Gösterge panelindeki "Dikkat gerektiren müşteriler" paneli, churn riski yüksek olduğu hâlde üzerinde açık görevi olmayan müşterileri listeler ve **tek tıkla takip görevi** oluşturmayı sağlar — böylece davranış analizi pasif bir rapor olmaktan çıkıp iş akışına döner.

---

## 14. Arayüz Özellikleri

- **SAP Fiori / Horizon tasarım sistemi** — Marpol PPM ile bilinçli olarak aynı görsel dil
- **Açık / koyu tema** anahtarı: ShellBar ikonu ve profil menüsünden; tercih `localStorage`'a yazılır, kayıtlı tercih yoksa **işletim sistemi tercihine** uyar
- **ShellBar**: Marpol logosu (`marpol.svg`), sistem başlığı, kullanıcı departmanı, avatar (baş harfler)
- **Profil menüsü**: kullanıcı adı / ünvanı, Şifre Değiştir, tema değiştir, Oturumu Kapat
- **Canlı durum şeridi (ticker)**: ShellBar ortasında sağdan sola kesintisiz akan 6 metrik; kritik değerler kırmızı
- **Sol menü**: yalnızca yetkili sekmeler görünür; ilk yetkili sekme ana sayfa olur
- **Ortak veri araç çubuğu** (`DataToolbar`): arama kutusu, kayıt sayacı, Yenile, Yeni (yetkiye göre gizlenir), sayfaya özel ek butonlar
- **Bildirim altyapısı**: kısa süreli başarı / bilgi toast'ları (3,5 sn) + ekranın üstünde kapatılabilir kalıcı hata şeridi
- **Durum rozetleri** ve etiket sözlükleri (`lib/format.ts`) — tüm enum'lar için Türkçe etiket; para / tarih / yüzde / sayı biçimlendirme; revizyon etiketi (0 → "Rev A")
- Tüm sayfalarda yükleniyor göstergeleri ve boş durum ("kayıt yok") mesajları
- TanStack Query ile önbellek, otomatik yenileme ve mutasyon sonrası invalidasyon

### Giriş ekranı
- `marpol_giris.mp4` tanıtım videosu **tam ekran ve 2.5× hızda** oynar
- Video bittiğinde veya **"Geç ›"** ile atlandığında kaybolup şifre paneli görünür
- Tarayıcı otomatik oynatmayı engellerse video beklenmeden geçilir
- Logo olarak `marpol_svg.svg` hem giriş panelinde hem ShellBar'da kullanılır

---

## 15. API Uç Noktaları (Özet)

| Grup | Uçlar |
| --- | --- |
| **Auth** | `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password` |
| **Kullanıcılar** | `GET /users`, `GET /users/modules`, `GET /users/:id`, `POST /users`, `PUT /users/:id`, `DELETE /users/:id` |
| **Müşteriler** | `GET /customers`, `GET /customers/:id`, `POST /customers`, `PUT /customers/:id`, `DELETE /customers/:id` |
| **Kişiler** | `GET/POST /customers/:id/contacts`, `PUT/DELETE /customers/contacts/:contactId` |
| **Etkileşimler** | `GET/POST /customers/:id/interactions` |
| **Davranış** | `GET /customers/behavior/overview`, `GET /customers/:id/behavior`, `GET /customers/:id/recommendations` |
| **Görevler** | `GET /tasks`, `POST /tasks`, `PATCH /tasks/:id/status`, `DELETE /tasks/:id` |
| **Fırsatlar** | `GET /opportunities`, `GET /opportunities/:id`, `POST /opportunities`, `PUT /:id`, `PATCH /:id/stage`, `DELETE /:id`, `POST /:id/stakeholders`, `DELETE /stakeholders/:sid`, `GET /pipeline/summary` |
| **Katalog** | `/catalog/products` (CRUD), `/products/:id/groups`, `/groups/:gid`, `/groups/:gid/options`, `/options/:oid`, `/products/:id/rules`, `/rules/:rid`, `POST /products/:id/configure`, `/products/:id/bom`, `/bom/:lid`, `/products/:id/labor`, `/labor/:lid` |
| **Fiyatlandırma** | `/pricing/materials` (CRUD), `GET /materials/:id/history`, `/pricing/rates` (CRUD), `/pricing/policies` (CRUD) |
| **Teklifler** | `GET /quotes`, `GET /quotes/:id`, `POST /quotes`, `PUT /:id`, `POST /:id/items`, `PUT/DELETE /items/:iid`, `POST /:id/revise`, `POST /:id/reprice`, `PATCH /:id/status`, `POST /:id/approve`, `DELETE /:id`, `POST /:id/convert-to-order` |
| **Siparişler** | `GET /orders`, `GET /orders/:id`, `POST /orders`, `PUT /:id`, `PATCH /:id/status`, `DELETE /:id`, `POST /:id/handover`, `PATCH /handovers/:hid`, `GET /erp/status`, `GET /erp/search`, `POST /items/:iid/erp-link`, `DELETE /items/:iid/erp-link`, `POST /:id/erp-sync`, `GET /summary/kpi` |
| **Dokümanlar** | `/documents` (CRUD), `/documents/specs` (CRUD), `GET /specs/:id`, `POST /specs/:id/requirements`, `PUT/DELETE /requirements/:rid` |
| **Sözleşmeler** | `GET /contracts`, `GET /contracts/expiring`, `GET /contracts/:id`, `POST /contracts`, `PUT /:id`, `PATCH /:id/status`, `DELETE /:id`, `POST /:id/versions` |
| **Sözleşme evrakı** | `GET /contracts/:id/files`, `POST /contracts/:id/files` (multipart), `GET /contracts/files/:fileId` (`?download=1`), `PUT /contracts/files/:fileId`, `DELETE /contracts/files/:fileId` |
| **Saha servis** | `/service/assets` (CRUD), `GET /assets/due`, `/service/tickets` (CRUD), `GET /tickets/:id`, `PATCH /tickets/:id/status`, `POST /tickets/:id/visits`, `PUT/DELETE /visits/:vid`, `POST /visits/:vid/parts`, `DELETE /parts/:pid`, `GET /service/summary` |
| **Gösterge paneli** | `GET /dashboard`, `GET /dashboard/ticker`, `GET /dashboard/erp` |

---

## 16. Veri Modeli Özeti (~40 model, 8 bölüm)

1. **Yetkilendirme**: `User`, `Permission`
2. **Müşteri / kişi / etkileşim**: `Customer`, `Contact`, `Interaction`, `Task`
3. **Fırsat**: `Opportunity`, `OpportunityStakeholder`, `OpportunityStageHistory`
4. **CPQ**: `Material`, `MaterialPriceHistory`, `LaborRate`, `PricingPolicy`, `Product`, `OptionGroup`, `ProductOption`, `ConfigRule`, `Quote`, `QuoteItem`, `QuoteItemOption`, `BomLine`, `LaborLine`
5. **Doküman / şartname / sözleşme**: `Document`, `SpecDocument`, `SpecRequirement`, `Contract`, `ContractVersion`, `ContractFile`
6. **Sipariş / ERP-PLM**: `Order`, `OrderItem`, `OrderStatusHistory`, `ErpLink`, `EngineeringHandover`
7. **Satış sonrası**: `InstalledAsset`, `ServiceTicket`, `ServiceVisit`, `ServicePart`
8. **Denetim**: `AuditLog`

---

## 17. Başlangıç (Seed) Verisi

- 4 demo kullanıcı (şifre: `Marpol2026!`): `admin` (sistem yöneticisi, sınırsız iskonto), `ayse.yilmaz` (satış müdürü, onay yetkisi, %20), `cem.aydin` (satış temsilcisi, %5), `burak.sen` (saha servis şefi)
- Fiyat politikaları, hammaddeler (fiyat geçmişiyle), işçilik / mühendislik ücretleri
- **4 ürün**: Konveyörlü Yıkama Makinesi (tam konfigüre edilebilir), Paslanmaz Proses Tankı, Dozajlama Ünitesi, Filtre Presi — seçenek grupları ve kısıtlama kurallarıyla
- Müşteriler, paydaş haritaları (hiyerarşi dâhil), etkileşim geçmişi, görevler
- Fırsatlar ve fırsat bazlı paydaş haritaları
- **Revizyonlu teklif örnekleri**: Rev A → Rev B kapsam genişlemesi, onay bekleyen yüksek iskontolu teklif, gönderilmiş teklif, siparişe dönüşmüş kabul edilmiş teklif
- Siparişler ve ERP bağlantıları, **gecikmiş sipariş** örneği, mühendisliğe aktarım kaydı
- Teknik şartnameler ve uygunluk matrisi verisi
- Sözleşmeler, sahadaki varlıklar, servis kayıtları

---

## 18. Bilinen Sınırlar / Sonraki Aşama

- Dokümanlar ve teknik şartnamelerde **gerçek dosya yükleme yok** (şu an dosya adı / harici bağlantı tutuluyor) — sözleşmelerde eklendi
- E-posta ve takvim entegrasyonuyla otomatik etkileşim kaydı yok
- Teklif onay akışı e-posta bildirimiyle desteklenmiyor
- PPM'e üretim emri **oluşturma** yok (şu an yalnızca okuma yapılıyor)
- Çoklu para birimi alanları mevcut, ancak **kur takibi / dönüşümü** yok
- Saha servis modülü, gereksinim dokümanında alt maddeleri yazılmamış bir başlığın mantığına göre tasarlanmıştır; beklenti farklıysa daraltılıp genişletilebilir
