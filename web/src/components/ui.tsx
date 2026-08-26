import type { ReactNode } from 'react';
import { Icon, ObjectStatus, Title } from '@ui5/webcomponents-react';
import {
  ASSET_STATUS_LABEL,
  COMPLIANCE_LABEL,
  CONTRACT_STATUS_LABEL,
  CRITICALITY_LABEL,
  CUSTOMER_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  QUOTE_STATUS_LABEL,
  SENTIMENT_LABEL,
  STAGE_LABEL,
  TICKET_STATUS_LABEL,
} from '../lib/format.js';
import type {
  AssetStatus,
  ComplianceStatus,
  ContractStatus,
  Criticality,
  CustomerStatus,
  OpportunityStage,
  OrderStatus,
  QuoteStatus,
  Sentiment,
  TicketStatus,
} from '../api/types.js';

// Etiketler ve biçimlendiriciler UI'dan bağımsız modülde durur; sayfaların
// tek yerden alması için buradan yeniden dışarı verilir.
export * from '../lib/format.js';

type Tone = 'None' | 'Positive' | 'Critical' | 'Negative' | 'Information';

/** Sayfa başlığı ve sağ üstteki işlem butonları. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mp-page__header">
      <div>
        <Title level="H3">{title}</Title>
        {subtitle && <div className="mp-page__subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="mp-page__actions">{actions}</div>}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  tone = 'info',
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: 'info' | 'good' | 'warning' | 'critical';
  hint?: string;
}) {
  return (
    <div className={`mp-kpi mp-kpi--${tone}`}>
      <div className="mp-kpi__label">{label}</div>
      <div className="mp-kpi__value">{value}</div>
      {hint && <div className="mp-kpi__hint">{hint}</div>}
    </div>
  );
}

/**
 * Tarih girişi.
 *
 * UI5 Input'un `type` listesinde tarih yok, DatePicker ise yerelleştirilmiş
 * metin döndürüyor. API her yerde ISO (yyyy-aa-gg) beklediği için native
 * `<input type="date">` UI5 görünümüne yaklaştırılarak kullanılır.
 */
export function DateInput({
  value,
  onChange,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
}) {
  return (
    <input
      type="date"
      className="mp-date"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      style={style}
    />
  );
}

/** Alan/değer çiftlerini ızgara halinde gösterir - detay diyalogları için. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="mp-fields">{children}</div>;
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="mp-field">
      <div className="mp-field__label">{label}</div>
      <div className="mp-field__value">{value ?? '-'}</div>
    </div>
  );
}

/** Kart başlığı olan içerik bölümü. */
export function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mp-section">
      <div className="mp-section__head">
        <h4 className="mp-section__title">{title}</h4>
        {actions && <div className="mp-page__actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * Boş durum.
 *
 * Yalnızca "Kayıt yok." yazmak kullanıcıyı çıkmaza sokar; bir simge, kısa bir
 * açıklama ve mümkünse doğrudan eylem sunulur. `text` eski çağrılarla uyumlu
 * kalsın diye korunmuştur.
 */
export function EmptyRow({
  text = 'Kayıt yok.',
  hint,
  icon,
  action,
}: {
  text?: string;
  hint?: string;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mp-empty">
      {icon && <Icon name={icon} className="mp-empty__icon" />}
      <div className="mp-empty__title">{text}</div>
      {hint && <div className="mp-empty__hint">{hint}</div>}
      {action}
    </div>
  );
}

/**
 * Yükleniyor yer tutucusu.
 *
 * Dönen çark, gelecek içeriğin yerini tutmadığı için sayfa yüklendiğinde
 * zıplıyordu. İskelet satırlar hem bekleneni gösterir hem yerleşimi korur.
 */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true" aria-busy="true">
      <div className="mp-skeleton mp-skeleton--title" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="mp-skeleton mp-skeleton--row" style={{ opacity: 1 - i * 0.1 }} />
      ))}
      <span className="mp-visually-hidden">Yükleniyor...</span>
    </div>
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mp-kpis" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="mp-skeleton mp-skeleton--kpi" />
      ))}
    </div>
  );
}

/** Tam sayfa yükleme - KPI şeridi + tablo iskeleti. */
export function PageSkeleton({ kpis = 4, rows = 6 }: { kpis?: number; rows?: number }) {
  return (
    <div className="mp-page" aria-busy="true">
      <KpiSkeleton count={kpis} />
      <TableSkeleton rows={rows} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Durum rozetleri
// ---------------------------------------------------------------------------

const CUSTOMER_TONE: Record<CustomerStatus, Tone> = {
  POTANSIYEL: 'Information',
  AKTIF: 'Positive',
  PASIF: 'Critical',
  KARA_LISTE: 'Negative',
};

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return <ObjectStatus state={CUSTOMER_TONE[status]}>{CUSTOMER_STATUS_LABEL[status]}</ObjectStatus>;
}

const STAGE_TONE: Record<OpportunityStage, Tone> = {
  KESIF: 'None',
  NITELENDIRME: 'Information',
  TEKNIK_DEGERLENDIRME: 'Information',
  TEKLIF: 'Critical',
  PAZARLIK: 'Critical',
  KAZANILDI: 'Positive',
  KAYBEDILDI: 'Negative',
};

export function StageBadge({ stage }: { stage: OpportunityStage }) {
  return <ObjectStatus state={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</ObjectStatus>;
}

const QUOTE_TONE: Record<QuoteStatus, Tone> = {
  TASLAK: 'None',
  ONAY_BEKLIYOR: 'Critical',
  GONDERILDI: 'Information',
  PAZARLIK: 'Critical',
  KABUL_EDILDI: 'Positive',
  REDDEDILDI: 'Negative',
  SURESI_DOLDU: 'Negative',
  REVIZE_EDILDI: 'None',
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return <ObjectStatus state={QUOTE_TONE[status]}>{QUOTE_STATUS_LABEL[status]}</ObjectStatus>;
}

const ORDER_TONE: Record<OrderStatus, Tone> = {
  ONAY_BEKLIYOR: 'Critical',
  ONAYLANDI: 'Information',
  URETIMDE: 'Information',
  KISMI_SEVK: 'Critical',
  SEVK_EDILDI: 'Information',
  TESLIM_EDILDI: 'Positive',
  FATURALANDI: 'Positive',
  IPTAL: 'Negative',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <ObjectStatus state={ORDER_TONE[status]}>{ORDER_STATUS_LABEL[status]}</ObjectStatus>;
}

const COMPLIANCE_TONE: Record<ComplianceStatus, Tone> = {
  KARSILANIYOR: 'Positive',
  KISMEN_KARSILANIYOR: 'Critical',
  KARSILANMIYOR: 'Negative',
  DEGERLENDIRILIYOR: 'Information',
  KAPSAM_DISI: 'None',
};

export function ComplianceBadge({ status }: { status: ComplianceStatus }) {
  return <ObjectStatus state={COMPLIANCE_TONE[status]}>{COMPLIANCE_LABEL[status]}</ObjectStatus>;
}

const CRITICALITY_TONE: Record<Criticality, Tone> = {
  DUSUK: 'None',
  ORTA: 'Positive',
  YUKSEK: 'Critical',
  KRITIK: 'Negative',
};

export function CriticalityBadge({ level }: { level: Criticality }) {
  return (
    <ObjectStatus state={CRITICALITY_TONE[level]} showDefaultIcon={level === 'KRITIK'}>
      {CRITICALITY_LABEL[level]}
    </ObjectStatus>
  );
}

const CONTRACT_TONE: Record<ContractStatus, Tone> = {
  TASLAK: 'None',
  INCELEMEDE: 'Information',
  IMZA_BEKLIYOR: 'Critical',
  YURURLUKTE: 'Positive',
  SONA_ERDI: 'None',
  FESHEDILDI: 'Negative',
};

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return <ObjectStatus state={CONTRACT_TONE[status]}>{CONTRACT_STATUS_LABEL[status]}</ObjectStatus>;
}

const TICKET_TONE: Record<TicketStatus, Tone> = {
  ACIK: 'Critical',
  ATANDI: 'Information',
  SAHADA: 'Information',
  BEKLEMEDE: 'Critical',
  COZULDU: 'Positive',
  KAPANDI: 'None',
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <ObjectStatus state={TICKET_TONE[status]}>{TICKET_STATUS_LABEL[status]}</ObjectStatus>;
}

const ASSET_TONE: Record<AssetStatus, Tone> = {
  DEVREYE_ALINDI: 'Information',
  CALISIYOR: 'Positive',
  ARIZALI: 'Negative',
  BAKIMDA: 'Critical',
  HIZMET_DISI: 'None',
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return <ObjectStatus state={ASSET_TONE[status]}>{ASSET_STATUS_LABEL[status]}</ObjectStatus>;
}

const SENTIMENT_TONE: Record<Sentiment, Tone> = {
  DESTEKLIYOR: 'Positive',
  NOTR: 'None',
  KARSIT: 'Negative',
};

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  return <ObjectStatus state={SENTIMENT_TONE[sentiment]}>{SENTIMENT_LABEL[sentiment]}</ObjectStatus>;
}

/** Kâr marjı - asgari sınırın altındaysa kırmızı. */
export function MarginBadge({ value, min = 15 }: { value: number; min?: number }) {
  const state: Tone = value < min ? 'Negative' : value < min + 8 ? 'Critical' : 'Positive';
  return <ObjectStatus state={state}>{`%${value.toFixed(1)}`}</ObjectStatus>;
}

/** Etki gücü 1-5 - dolu/boş kare gösterimi. */
export function InfluenceMeter({ value }: { value: number }) {
  return (
    <span className="mp-influence" title={`Etki gücü: ${value}/5`} role="img" aria-label={`Etki gücü ${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`mp-influence__dot${n <= value ? ' mp-influence__dot--on' : ''}`} />
      ))}
    </span>
  );
}

/** Yüzde ilerleme çubuğu - üretim ilerlemesi ve uygunluk oranı için. */
export function ProgressBar({
  value,
  tone = 'info',
  label,
}: {
  value: number;
  tone?: 'info' | 'good' | 'warning' | 'critical';
  /** Ekran okuyucuya neyin ilerlemesi olduğunu söyler. */
  label?: string;
}) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      className="mp-progress"
      title={`%${Math.round(pct)}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={`mp-progress__fill mp-progress__fill--${tone}`} style={{ width: `${pct}%` }} />
      <span className="mp-progress__text">%{Math.round(pct)}</span>
    </div>
  );
}
