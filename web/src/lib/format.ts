/**
 * Etiket sözlükleri ve biçimlendirme yardımcıları.
 *
 * Bu modül bilerek UI kütüphanesinden bağımsız tutulur; böylece hem
 * arayüzde hem de PDF üretiminde kullanılabilir.
 */
import type {
  AssetStatus,
  ComplianceStatus,
  ContractFileKind,
  ContractStatus,
  ContractType,
  Criticality,
  CustomerStatus,
  DocumentType,
  InteractionType,
  NegotiationStyle,
  OpportunityStage,
  OrderStatus,
  PriceSensitivity,
  QuoteStatus,
  RateKind,
  RuleSeverity,
  RuleType,
  Sentiment,
  StakeholderDepartment,
  StakeholderRole,
  TaskStatus,
  TicketStatus,
  TicketType,
  HandoverStatus,
} from '../api/types.js';

export const MODULE_LABEL: Record<string, string> = {
  GOSTERGE_PANELI: 'Gösterge Paneli',
  MUSTERILER: 'Müşteriler',
  FIRSATLAR: 'Fırsatlar',
  TEKLIFLER: 'Teklifler (CPQ)',
  URUN_KATALOGU: 'Ürün Kataloğu',
  FIYATLANDIRMA: 'Fiyatlandırma',
  SIPARISLER: 'Siparişler',
  DOKUMANLAR: 'Doküman & Şartname',
  SOZLESMELER: 'Sözleşmeler',
  SAHA_SERVIS: 'Saha Servis',
  RAPORLAR: 'Raporlar',
  YETKILENDIRME: 'Yetkilendirme Paneli',
};

export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  POTANSIYEL: 'Potansiyel',
  AKTIF: 'Aktif',
  PASIF: 'Pasif',
  KARA_LISTE: 'Kara Liste',
};

export const NEGOTIATION_LABEL: Record<NegotiationStyle, string> = {
  ISBIRLIKCI: 'İşbirlikçi',
  REKABETCI: 'Rekabetçi',
  FIYAT_ODAKLI: 'Fiyat Odaklı',
  ILISKI_ODAKLI: 'İlişki Odaklı',
  ANALITIK: 'Analitik',
  KACINGAN: 'Kaçıngan',
};

/** Pazarlık tarzının satışçıya verdiği kısa taktik notu. */
export const NEGOTIATION_HINT: Record<NegotiationStyle, string> = {
  ISBIRLIKCI: 'Açık iletişim kurar, karşılıklı taviz mantığı işler.',
  REKABETCI: 'Sert pazarlık yapar; ilk teklifte pazarlık payı bırakın.',
  FIYAT_ODAKLI: 'Yalnızca fiyata bakar; toplam sahip olma maliyetini anlatın.',
  ILISKI_ODAKLI: 'Güven ve süreklilik önceliği; referans ve servis vurgulayın.',
  ANALITIK: 'Veri ve detay ister; teknik dokümanı eksiksiz gönderin.',
  KACINGAN: 'Kararı erteler; net termin ve takip takvimi koyun.',
};

export const PRICE_SENSITIVITY_LABEL: Record<PriceSensitivity, string> = {
  DUSUK: 'Düşük',
  ORTA: 'Orta',
  YUKSEK: 'Yüksek',
};

export const DEPARTMENT_LABEL: Record<StakeholderDepartment, string> = {
  SATIN_ALMA: 'Satın Alma',
  MUHENDISLIK: 'Mühendislik',
  URETIM: 'Üretim',
  KALITE: 'Kalite',
  FINANS: 'Finans',
  UST_YONETIM: 'Üst Yönetim',
  BAKIM: 'Bakım',
  DIGER: 'Diğer',
};

export const STAKEHOLDER_ROLE_LABEL: Record<StakeholderRole, string> = {
  KARAR_VERICI: 'Karar Verici',
  TEKNIK_ONAYCI: 'Teknik Onaycı',
  EKONOMIK_ONAYCI: 'Ekonomik Onaycı',
  KULLANICI: 'Kullanıcı',
  KAPI_BEKCISI: 'Kapı Bekçisi',
  ETKILEYICI: 'Etkileyici',
};

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  DESTEKLIYOR: 'Destekliyor',
  NOTR: 'Nötr',
  KARSIT: 'Karşıt',
};

export const INTERACTION_LABEL: Record<InteractionType, string> = {
  TELEFON: 'Telefon',
  EPOSTA: 'E-posta',
  ZIYARET: 'Ziyaret',
  TOPLANTI: 'Toplantı',
  FUAR: 'Fuar',
  DEMO: 'Demo',
  TEKLIF_SUNUMU: 'Teklif Sunumu',
  SERVIS: 'Servis',
  DIGER: 'Diğer',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  ACIK: 'Açık',
  TAMAMLANDI: 'Tamamlandı',
  IPTAL: 'İptal',
};

export const STAGE_LABEL: Record<OpportunityStage, string> = {
  KESIF: 'Keşif',
  NITELENDIRME: 'Nitelendirme',
  TEKNIK_DEGERLENDIRME: 'Teknik Değerlendirme',
  TEKLIF: 'Teklif',
  PAZARLIK: 'Pazarlık',
  KAZANILDI: 'Kazanıldı',
  KAYBEDILDI: 'Kaybedildi',
};

/** Pipeline sütun sırası. */
export const STAGE_ORDER: OpportunityStage[] = [
  'KESIF',
  'NITELENDIRME',
  'TEKNIK_DEGERLENDIRME',
  'TEKLIF',
  'PAZARLIK',
  'KAZANILDI',
  'KAYBEDILDI',
];

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  TASLAK: 'Taslak',
  ONAY_BEKLIYOR: 'Onay Bekliyor',
  GONDERILDI: 'Gönderildi',
  PAZARLIK: 'Pazarlık',
  KABUL_EDILDI: 'Kabul Edildi',
  REDDEDILDI: 'Reddedildi',
  SURESI_DOLDU: 'Süresi Doldu',
  REVIZE_EDILDI: 'Revize Edildi',
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  ONAY_BEKLIYOR: 'Onay Bekliyor',
  ONAYLANDI: 'Onaylandı',
  URETIMDE: 'Üretimde',
  KISMI_SEVK: 'Kısmi Sevk',
  SEVK_EDILDI: 'Sevk Edildi',
  TESLIM_EDILDI: 'Teslim Edildi',
  FATURALANDI: 'Faturalandı',
  IPTAL: 'İptal',
};

export const RULE_TYPE_LABEL: Record<RuleType, string> = {
  GEREKTIRIR: 'Gerektirir',
  ENGELLER: 'Engeller',
  UYARIR: 'Uyarır',
};

export const RULE_SEVERITY_LABEL: Record<RuleSeverity, string> = {
  ENGELLE: 'Engelle',
  UYAR: 'Uyar',
};

export const RATE_KIND_LABEL: Record<RateKind, string> = {
  ISCILIK: 'İşçilik',
  MUHENDISLIK: 'Mühendislik',
  SAHA_SERVIS: 'Saha Servis',
};

export const COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  KARSILANIYOR: 'Karşılanıyor',
  KISMEN_KARSILANIYOR: 'Kısmen Karşılanıyor',
  KARSILANMIYOR: 'Karşılanmıyor',
  DEGERLENDIRILIYOR: 'Değerlendiriliyor',
  KAPSAM_DISI: 'Kapsam Dışı',
};

export const CRITICALITY_LABEL: Record<Criticality, string> = {
  DUSUK: 'Düşük',
  ORTA: 'Orta',
  YUKSEK: 'Yüksek',
  KRITIK: 'Kritik',
};

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  NDA: 'Gizlilik (NDA)',
  CERCEVE: 'Çerçeve Anlaşma',
  SATIS: 'Satış Sözleşmesi',
  GARANTI: 'Garanti Şartları',
  BAKIM: 'Bakım / Servis',
  TESLIMAT: 'Teslimat Koşulları',
  DIGER: 'Diğer',
};

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  TASLAK: 'Taslak',
  INCELEMEDE: 'İncelemede',
  IMZA_BEKLIYOR: 'İmza Bekliyor',
  YURURLUKTE: 'Yürürlükte',
  SONA_ERDI: 'Sona Erdi',
  FESHEDILDI: 'Feshedildi',
};

export const CONTRACT_FILE_KIND_LABEL: Record<ContractFileKind, string> = {
  IMZALI_KOPYA: 'İmzalı Kopya',
  TASLAK: 'Taslak',
  EK: 'Ek / Zeyilname',
  DIGER: 'Diğer',
};

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  TEKNIK_SARTNAME: 'Teknik Şartname',
  CIZIM: 'Çizim',
  SERTIFIKA: 'Sertifika',
  TEST_RAPORU: 'Test Raporu',
  SUNUM: 'Sunum',
  YAZISMA: 'Yazışma',
  DIGER: 'Diğer',
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  DEVREYE_ALINDI: 'Devreye Alındı',
  CALISIYOR: 'Çalışıyor',
  ARIZALI: 'Arızalı',
  BAKIMDA: 'Bakımda',
  HIZMET_DISI: 'Hizmet Dışı',
};

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  ARIZA: 'Arıza',
  PERIYODIK_BAKIM: 'Periyodik Bakım',
  DEVREYE_ALMA: 'Devreye Alma',
  EGITIM: 'Eğitim',
  YEDEK_PARCA: 'Yedek Parça',
  SIKAYET: 'Şikâyet',
  DIGER: 'Diğer',
};

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  ACIK: 'Açık',
  ATANDI: 'Atandı',
  SAHADA: 'Sahada',
  BEKLEMEDE: 'Beklemede',
  COZULDU: 'Çözüldü',
  KAPANDI: 'Kapandı',
};

export const HANDOVER_STATUS_LABEL: Record<HandoverStatus, string> = {
  BEKLIYOR: 'Bekliyor',
  GONDERILDI: 'Gönderildi',
  KABUL_EDILDI: 'Kabul Edildi',
  REVIZE_ISTENDI: 'Revize İstendi',
};

/** PPM'den gelen üretim emri durumları. */
export const ERP_STATUS_LABEL: Record<string, string> = {
  TASLAK: 'Taslak',
  ONAY_BEKLIYOR: 'Onay Bekliyor',
  PLANLANDI: 'Planlandı',
  URETIMDE: 'Üretimde',
  BEKLEMEDE: 'Beklemede',
  TAMAMLANDI: 'Tamamlandı',
  IPTAL: 'İptal',
};

// ---------------------------------------------------------------------------
// Biçimlendiriciler
// ---------------------------------------------------------------------------

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNumber(value?: number | null, digits = 0): string {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Para birimi - büyük tutarlarda kuruş göstermez. */
export function formatMoney(value?: number | null, currency = 'TRY'): string {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatPct(value?: number | null, digits = 1): string {
  if (value === null || value === undefined) return '-';
  return `%${value.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Termine kalan gün sayısı (negatif ise gecikmiş). */
export function daysUntil(deadline?: string | null): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
}

/**
 * `<input type="date">` için yyyy-aa-gg parçası — **yerel** takvime göre.
 *
 * `toISOString()` UTC'ye çevirir; Türkiye (UTC+3) saat 21:00'den sonra
 * "bugün" bir önceki güne kayardı. Bu yüzden yerel alanlar tek tek okunur.
 */
export function toDateInput(value?: string | number | Date | null): string {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Bugünün tarihi, form varsayılanları için. */
export function today(): string {
  return toDateInput(new Date());
}

/**
 * Form alanındaki metni sayıya çevirir; boş/geçersizse yedeğe düşer.
 *
 * `Number('')` 0, `Number('abc')` NaN üretir ve `JSON.stringify` NaN'ı `null`
 * yapar — sunucuya `null` giden bir sayı alanı, kullanıcının anlamadığı bir
 * doğrulama hatasına dönüşür. Tek kapıdan geçirmek bunu önler.
 */
export function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Bugünden `days` gün sonrası — geçerlilik/vade varsayılanları için. */
export function daysFromToday(days: number): string {
  return toDateInput(new Date(Date.now() + days * 86_400_000));
}

/**
 * Kullanıcının girdiği dış bağlantıyı güvenli hâle getirir.
 *
 * `javascript:` ya da `data:` adresleri, bağlantıya tıklayan kullanıcının
 * oturum anahtarını çalabilir. Yalnızca http/https geçerli sayılır; diğerleri
 * için `null` dönerek çağıran tarafın düz metin basmasını sağlar.
 */
export function safeExternalUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const { protocol } = new URL(value, window.location.origin);
    return protocol === 'http:' || protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/** Ad soyadın baş harfleri - avatar için. */
export function initials(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('tr-TR') ?? '')
    .join('');
}

/** Bayt cinsinden boyutu okunabilir birime çevirir - 1.4 MB gibi. */
export function formatFileSize(bytes?: number | null): string {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${units[unit]}`;
}

/** Dosya türüne göre UI5 ikon adı. */
export function fileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf-attachment';
  if (mimeType.startsWith('image/')) return 'attachment-photo';
  return 'document';
}

/**
 * 0 -> "Rev A", 25 -> "Rev Z", 26 -> "Rev AA" ...
 *
 * Eski hâli `revision % 26` kullanıyordu; 26. revizyon yeniden "Rev A" olup
 * revizyon zincirinde ilk teklifle karışıyordu. Elektronik tablo sütun
 * mantığıyla harf eklenerek devam edilir.
 */
export function revisionLabel(revision: number): string {
  if (!Number.isFinite(revision) || revision < 0) return 'Rev A';
  let n = Math.floor(revision);
  let label = '';
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Rev ${label}`;
}
