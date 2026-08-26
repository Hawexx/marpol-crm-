# Marpol PPM — Arayüz Analiz Raporu

**Sistem:** Marpol Üretim Yönetim Sistemi (Production Process Management)  
**Teknoloji:** React 18 + TypeScript + Vite + SAP UI5 Web Components (`@ui5/webcomponents-react v2.6`)  
**Tarih:** 26 Ağustos 2026

---

## 1. Tema Sistemi

### Çift Tema Desteği (Light / Dark)

Sistem, SAP Horizon tema ailesini kullanır. Tema geçişi [ThemeContext.tsx](file:///c:/Users/deniz/Desktop/marpol_ppm/web/src/theme/ThemeContext.tsx) ile yönetilir:

| Mod | SAP Tema Adı | CSS İşareti |
|-----|-------------|-------------|
| Açık (Light) | `sap_horizon` | `data-mp-theme="light"` |
| Koyu (Dark) | `sap_horizon_dark` | `data-mp-theme="dark"` |

- **Varsayılan:** İşletim sistemi tercihi (`prefers-color-scheme`) okunur
- **Saklama:** `localStorage` anahtarı → `marpol.ppm.theme`
- Tema değişimi `ShellBar` üzerindeki güneş/ay ikonu ile veya profil menüsünden yapılır

### Koyu Tema CSS Özelleştirmeleri

SAP token'larının kapsamadığı yüzeyler özel CSS ile ayarlanır:

| Element | Koyu Tema Davranışı |
|---------|-------------------|
| Proses Tuvali noktaları | `#4a4f54` (açıkta `#d0d0d0`) |
| Düğüm gölgesi | Daha yoğun: `rgba(0,0,0,0.5)` |
| Login paneli gölgesi | Daha koyu: `rgba(0,0,0,0.6)` |
| Gecikmeli satır vurgusu | `rgba(255,90,90,0.12)` (açıkta `rgba(187,0,0,0.07)`) |
| ShellBar logosu | `brightness(1.15)` filtresi |

---

## 2. Renk Paleti

### Marpol Kurumsal Renkleri (CSS Değişkenleri)

```css
--marpol-red:       #e30613   /* Marpol Kırmızı */
--marpol-red-dark:  #b8040f   /* Kırmızı koyu varyant */
```

### SAP Fiori Durum Renkleri (Fallback Değerlerle)

| Anlamsal Renk | SAP Token | Fallback HEX | Kullanım Alanı |
|--------------|-----------|-------------|----------------|
| Negatif / Hata | `--sapNegativeElementColor` | `#bb0000` | Kritik KPI, gecikme, iptal |
| Uyarı / Kritik | `--sapCriticalElementColor` | `#e76500` | Onay bekleyen, bekleme |
| Pozitif / Başarı | `--sapPositiveElementColor` | `#107e3e` | Tamamlandı, başlangıç düğümü |
| Bilgilendirme | `--sapInformativeElementColor` | `#0070f2` | Üretimde, seçili element |
| Nötr | `--sapNeutralElementColor` | `#6a6d70` | Varsayılan KPI kenarı, ok uçları |

### İş Akışı Düğüm Renkleri (Üst Kenar Rengi)

| Düğüm Tipi | Renk Kodu | Görsel |
|------------|-----------|--------|
| START (Başlangıç) | `#107e3e` | 🟢 Yeşil |
| END (Bitiş) | `#bb0000` | 🔴 Kırmızı |
| MACHINE (Makine) | `#0070f2` | 🔵 Mavi |
| QUALITY (Kalite Kontrol) | `#e76500` | 🟠 Turuncu |
| DECISION (Karar) | `#7858ff` | 🟣 Mor |
| WAIT (Bekleme/Kurutma) | `#b8860b` | 🟤 Altın/Koyu Sarı |
| OPERATION (Operasyon) | `#6a6d70` | ⚪ Gri (varsayılan) |

### Giriş Ekranı Arka Plan Gradyanı

```css
background:
  radial-gradient(1200px 600px at 15% 10%, rgba(227,6,19,0.08), transparent 60%),
  linear-gradient(160deg, #0a2540 0%, #123a5e 55%, #0a2540 100%);
```

Koyu lacivert → mavi gradyan üzerine Marpol kırmızısının soluk radyal yansıması.

---

## 3. Tipografi

| Öğe | Font | Boyut | Ağırlık |
|-----|------|-------|---------|
| Gövde metni | `'72', '72full', Arial` (SAP font) | `--sapFontSize` | Normal |
| KPI değeri | Sistem fontu | `1.75rem` | 700 (Bold) |
| KPI etiketi | Sistem fontu | `0.75rem` | Normal, UPPERCASE |
| Düğüm etiketi | Sistem fontu | `0.875rem` | 600 (SemiBold) |
| Düğüm tipi | Sistem fontu | `0.6875rem` | Normal, UPPERCASE |
| Ticker etiketi | Sistem fontu | `0.6875rem` | Normal, UPPERCASE |
| Ticker değeri | Sistem fontu | `0.8125rem` | 700 (Bold) |
| Login başlığı | Sistem fontu | `1rem` | 600 |
| Login alt metin | Sistem fontu | `0.8125rem` | Normal |
| Login footer | Sistem fontu | `0.75rem` | Normal |

---

## 4. Uygulama Yapısı ve Navigasyon

### Genel Yerleşim (Layout)

```
┌──────────────────────────────────────────────────────────┐
│  ShellBar (üst çubuk):  Logo │ Başlık │ Ticker │ Profil │
├──────────┬───────────────────────────────────────────────┤
│ Side     │                                               │
│ Navi-    │         Ana İçerik Alanı                      │
│ gation   │         (mp-page, max-width: 1800px)         │
│ (sol     │                                               │
│ menü)    │                                               │
│          │                                               │
└──────────┴───────────────────────────────────────────────┘
```

### ShellBar Özellikleri

- **Yükseklik:** `3.75rem` (özelleştirilmiş, varsayılan SAP'den yüksek)
- **Logo:** `marpol.svg`, yükseklik `3.25rem`
- **Orta alan:** StatusTicker (canlı üretim özeti)
- **Sağ:** Tema geçiş ikonu + Kullanıcı adı + Profil avatarı (baş harfler)
- **Alt başlık:** Kullanıcının departmanı veya "Marpol A.Ş."

### Sol Menü (SideNavigation) — 7 Modül

| Sıra | Rota | Metin | İkon | Modül Anahtarı |
|------|------|-------|------|---------------|
| 1 | `/uretim-emri-olustur` | Üretim Emri Oluşturma | `add-document` | URETIM_EMRI_OLUSTUR |
| 2 | `/uretim-emirleri` | Üretim Emirleri | `sales-order-item` | URETIM_EMIRLERI |
| 3 | `/flanslar` | Flanş Çeşitleri | `circle-task-2` | FLANS |
| 4 | `/kumaslar` | Kumaş Çeşitleri | `grid` | KUMAS |
| 5 | `/receteler` | Kimyasal Reçete | `lab` | KIMYASAL_RECETE |
| 6 | `/proses-semalari` | İş Akışı / Proses | `process` | IS_AKISI |
| 7 | `/yetkilendirme` | Yetkilendirme Paneli | `shield` | YETKILENDIRME |

Menü öğeleri kullanıcı yetkisine göre filtrelenir. Yetkisiz modüller görünmez.

---

## 5. Sayfa ve Dashboard Detayları

### 5.1 Giriş Ekranı (LoginPage)

- **Tam ekran tanıtım videosu:** [marpol_giris.mp4](file:///c:/Users/deniz/Desktop/marpol_ppm/marpol_giris.mp4) → 2.5x hızda oynar → otomatik kapanır veya "Geç ›" butonuyla atlanır
- **Login paneli:** `420px` genişlik, beyaz kart, `0.75rem` köşe yuvarlaklığı, `box-shadow: 0 24px 60px rgba(0,0,0,0.35)`
- Üstte: Marpol SVG logosu (210px)
- Başlık: "Üretim Yönetim Sistemi"
- Alt metin: "Devam etmek için kurumsal hesabınızla giriş yapın."
- Formda: Kullanıcı Adı + Şifre + "Giriş Yap" (Emphasized buton)
- Footer: "Marpol A.Ş. · Üretim Yönetim Sistemi v1.0"

### 5.2 Üretim Emirleri (OrderListPage) — Ana Dashboard

#### KPI Kartları (6 Adet)

Grid düzeninde (`minmax(170px, 1fr)`), sol kenarlarında 4px renk çizgisi:

| KPI | Renk Tonu |
|-----|-----------|
| Toplam Emir | Mavi (info) |
| Onay Bekleyen | Turuncu (warning) |
| Üretimde | Mavi (info) |
| Tamamlanan | Yeşil (good) |
| Termini Geçen | Kırmızı (critical) |
| Kritik Aciliyet | Kırmızı (critical) |

#### Veri Listesi (AnalyticalTable)

SAP UI5 `AnalyticalTable` bileşeni, 13 satır görünür, filtrelenebilir:

| Sütun | Genişlik |
|-------|---------|
| Emir No | 150px |
| Durum | 140px → [StatusBadge](file:///c:/Users/deniz/Desktop/marpol_ppm/web/src/components/ui.tsx#77-80) |
| Aciliyet | 110px → [PriorityBadge](file:///c:/Users/deniz/Desktop/marpol_ppm/web/src/components/ui.tsx#81-88) |
| Müşteri | 180px |
| Kumaş | 200px |
| Flanş | 200px |
| Disk Çapı | 110px |
| Adet | 100px |
| Katman | 90px |
| Termin | 120px |
| Kalan Gün | 120px → Yeşil/Sarı/Kırmızı |
| Detay | 100px → İkon buton |

#### Emir Detay Diyaloğu (Tam Ekran Dialog)

Açıldığında gösterilen bölümler:
1. **Emir Bilgileri** — Grid yerleşimli alan/değer çiftleri (17 alan)
2. **Kimyasal Oranlaması** — Tablo: Kod, Ad, Oran (%), Not
3. **Üretim Proses Akışı** — Tablo: Adım, Tip, Makine, Durum, Operatör, İşlem (Başlat/Bitir butonları)
4. **Ürün Özeti** — Doğal dilde üretim tarifi

#### Durum Badge Renk Eşlemesi

| Durum | SAP ObjectStatus Tonu |
|-------|--------------------|
| Taslak | None (gri) |
| Onay Bekliyor | Critical (turuncu) |
| Planlandı | Information (mavi) |
| Üretimde | Information (mavi) |
| Beklemede | Critical (turuncu) |
| Tamamlandı | Positive (yeşil) |
| İptal | Negative (kırmızı) |

#### Öncelik Badge Renk Eşlemesi

| Öncelik | SAP ObjectStatus Tonu | Özel |
|---------|---------------------|------|
| Düşük | None (gri) | — |
| Normal | Positive (yeşil) | — |
| Yüksek | Critical (turuncu) | — |
| Kritik | Negative (kırmızı) | Varsayılan ikon gösterilir |

### 5.3 İş Akışı / Proses Şemaları (WorkflowPage)

#### Proses Tuvali (Canvas)

- **Boyut:** 2400×1400px (kaydırılabilir, dış çerçeve 620px yükseklik)
- **Arka plan:** Beyaz zemin + gri nokta ızgarası (20×20px aralıklı `#d0d0d0`, koyu temada `#4a4f54`)
- **Kenar:** `1px solid #d9d9d9`, `0.5rem` yuvarlaklık
- **Düğümler:** 210px genişlik, sürükle-bırak destekli, üstte 3px renk çizgisi
- **Bağlantılar:** SVG Bézier eğrileri, `#6a6d70` renkte, ok uçlu
- **Bağlantı silme:** Eğrinin ortasında kırmızı kenarlı beyaz daire (`r=8`)
- **Port (çıkış noktası):** Sağ kenarda 16px mavi daire, crosshair imleç

#### Sağ Panel — Adım Özellikleri

`320px` sabit genişlikte kart: Adım Tipi, Adım Adı, Makine/Hat, Tahmini Süre, Sıcaklık, Açıklama, Bağla/Sil butonları.

### 5.4 Diğer Sayfalar

| Sayfa | Dosya | İçerik |
|-------|-------|--------|
| Üretim Emri Oluşturma | [OrderCreatePage.tsx](file:///c:/Users/deniz/Desktop/marpol_ppm/web/src/pages/OrderCreatePage.tsx) (17.9 KB) | Form tabanlı yeni emir girişi |
| Flanş Çeşitleri | [FlangePage.tsx](file:///c:/Users/deniz/Desktop/marpol_ppm/web/src/pages/FlangePage.tsx) (8.6 KB) | CRUD listesi + dialog |
| Kumaş Çeşitleri | [FabricPage.tsx](file:///c:/Users/deniz/Desktop/marpol_ppm/web/src/pages/FabricPage.tsx) (22.9 KB) | CRUD listesi + kimyasal oranları |
| Kimyasal Reçete | [RecipePage.tsx](file:///c:/Users/deniz/Desktop/marpol_ppm/web/src/pages/RecipePage.tsx) (13.6 KB) | Reçete yönetimi + bileşen oranları |
| Yetkilendirme Paneli | [UsersPage.tsx](file:///c:/Users/deniz/Desktop/marpol_ppm/web/src/pages/UsersPage.tsx) (15.8 KB) | Kullanıcı yönetimi + yetki matrisi |
| Şifre Değiştir | [ChangePasswordDialog.tsx](file:///c:/Users/deniz/Desktop/marpol_ppm/web/src/pages/ChangePasswordDialog.tsx) (2.7 KB) | Profil menüsünden açılır dialog |

---

## 6. Ortak UI Bileşenleri

### StatusTicker (Canlı Üretim Şeridi)

ShellBar'ın orta alanında sağdan sola akan haber şeridi:

- **Genişlik:** `clamp(260px, 40vw, 820px)`
- **Animasyon:** 38 saniye sürekli döngü (`translateX` CSS animasyonu)
- **Kenar maskesi:** Solda ve sağda şeffaf gradient fade
- **Hover:** Animasyon duraklar (okunabilirlik için)
- **Erişilebilirlik:** `prefers-reduced-motion` medya sorgusunda animasyon devre dışı
- **Veri:** Toplam Emir, Onay Bekleyen, Üretimde, Tamamlanan, Termini Geçen, Kritik Aciliyet
- **Kritik uyarılar:** Kırmızı renkte müşteri adı ve emir numarası

### DataToolbar (Arama Çubuğu)

Tüm liste sayfalarında kullanılan standart araç çubuğu:
- Sol: Arama input (260px) + kayıt sayısı
- Sağ: Filtre ekstra alan + "Yenile" butonu + "Yeni" (Emphasized) butonu

### KpiTile (KPI Kartı)

4 ton varyantı: [info](file:///c:/Users/deniz/Desktop/marpol_ppm/web/tsconfig.tsbuildinfo) (mavi), `good` (yeşil), `warning` (turuncu), `critical` (kırmızı).  
Sol kenar 4px renk şeridi ile ayırt edilir.

### NotificationProvider

- **Toast:** 3.5 saniye süreli kısa bilgi mesajı
- **Error Strip:** Sayfa üstünde kalıcı kırmızı hata şeridi (kapatılabilir)

---

## 7. Erişilebilirlik ve Responsive Tasarım

| Özellik | Detay |
|---------|-------|
| Tema | OS tercihine otomatik uyum + manuel geçiş |
| Alt etiketler | Tüm ikonlara `tooltip` verilmiş |
| Klavye desteği | Login formu Enter ile gönderilebilir |
| Hareket azaltma | `prefers-reduced-motion` ticker animasyonunu kapatır |
| Sayfa genişliği | Maks 1800px, KPI grid responsive `auto-fit` |
| Login panel | `min(420px, 100%)` → mobilde tam genişlik |

---

## 8. Kullanılan SAP UI5 Bileşen Kataloğu

| Bileşen | Kullanım |
|---------|---------|
| `ShellBar`, `ShellBarBranding`, `ShellBarItem` | Uygulama üst çubuğu |
| `SideNavigation`, `SideNavigationItem` | Sol menü |
| `Avatar` | Profil (baş harfler) |
| `Menu`, `MenuItem` | Profil açılır menüsü |
| `Button` | Her yerde |
| [Input](file:///c:/Users/deniz/Desktop/marpol_ppm/web/src/lib/format.ts#87-92), `TextArea`, `Select`, `Option`, `CheckBox` | Formlar |
| `Label`, `Title`, `Text` | Metin öğeleri |
| `AnalyticalTable` | Emir listesi |
| `Dialog`, `MessageBox`, `MessageStrip` | Modal/bilgilendirme |
| `Form`, `FormGroup`, `FormItem` | Yapısal formlar |
| `Bar` | Dialog footer'ları |
| `ObjectStatus` | Durum/öncelik badge'leri |
| `IllustratedMessage` | "Erişim Yok" boş durumu |
| `FlexBox` | Yerleşim |
| `BusyIndicator` | Yükleme göstergesi |
| `Toast` | Bildirim |

---

## 9. Dosya ve Bağımlılık Özeti

| Bağımlılık | Versiyon | Amaç |
|-----------|---------|------|
| `@ui5/webcomponents-react` | ^2.6.0 | SAP Fiori UI bileşenleri |
| `react` | ^18.3.1 | Çekirdek framework |
| `react-router-dom` | ^6.28.1 | Client-side routing |
| `@tanstack/react-query` | ^5.64.1 | Sunucu durum yönetimi (cache, refetch) |
| `pdfmake` | ^0.2.23 | İstemci taraflı PDF üretimi |
| `vite` | ^6.0.7 | Derleme ve geliştirme sunucusu |
| `typescript` | ^5.7.3 | Tip kontrolü |
