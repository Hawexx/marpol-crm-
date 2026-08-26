/**
 * CPQ motoru - Yapılandırma, Fiyatlandırma, Teklif.
 *
 * İki bağımsız parça içerir:
 *   1. `validateConfiguration` - kısıtlama (constraint) tabanlı konfigüratör
 *      denetimi. Mühendislik açısından imkânsız kombinasyonları engeller,
 *      riskli olanlar için uyarı üretir.
 *   2. `calculateCost` - güncel hammadde fiyatları, işçilik süreleri ve
 *      mühendislik eforundan otomatik maliyet ve önerilen satış fiyatı.
 *
 * Bilerek saf (pure) fonksiyonlar hâlinde tutulur: veritabanına dokunmaz,
 * böylece hem API uçlarından hem de testlerden aynı şekilde çağrılabilir.
 */

import { RateKind, RuleSeverity, RuleType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Konfigüratör - kısıtlama denetimi
// ---------------------------------------------------------------------------

export interface OptionLike {
  code: string;
  name: string;
  costDelta: number;
  priceDelta: number;
  leadTimeDelta: number;
  laborHours: number;
  isActive: boolean;
}

export interface OptionGroupLike {
  code: string;
  name: string;
  isRequired: boolean;
  isMultiple: boolean;
  options: OptionLike[];
}

export interface RuleLike {
  code: string;
  name: string;
  type: RuleType;
  severity: RuleSeverity;
  whenOptions: string[];
  thenOptions: string[];
  message: string;
  isActive: boolean;
}

export interface ConfigViolation {
  ruleCode: string;
  ruleName: string;
  severity: RuleSeverity;
  message: string;
}

export interface ConfigValidation {
  /** Engelleyici ihlal yoksa true - teklif kalemi kaydedilebilir. */
  valid: boolean;
  /** Teklif verilmesini engelleyen ihlaller. */
  blocking: ConfigViolation[];
  /** Satışçının görmesi gereken ama engellemeyen riskler. */
  warnings: ConfigViolation[];
}

/**
 * Seçilen seçenek kodlarını ürünün grup yapısı ve kısıtlama kurallarına göre denetler.
 *
 * Denetimler:
 *   - Zorunlu gruplarda seçim yapılmış mı
 *   - Tekli gruplarda birden fazla seçim var mı
 *   - Tanımsız / pasif seçenek kodu gönderilmiş mi
 *   - GEREKTIRIR / ENGELLER / UYARIR kuralları
 */
export function validateConfiguration(
  groups: OptionGroupLike[],
  rules: RuleLike[],
  selectedCodes: string[],
): ConfigValidation {
  const blocking: ConfigViolation[] = [];
  const warnings: ConfigViolation[] = [];
  const selected = new Set(selectedCodes);

  const allOptions = new Map<string, { option: OptionLike; group: OptionGroupLike }>();
  for (const group of groups) {
    for (const option of group.options) allOptions.set(option.code, { option, group });
  }

  // Tanımsız veya pasif seçenek.
  for (const code of selected) {
    const found = allOptions.get(code);
    if (!found) {
      blocking.push({
        ruleCode: 'BILINMEYEN_SECENEK',
        ruleName: 'Tanımsız seçenek',
        severity: RuleSeverity.ENGELLE,
        message: `"${code}" bu ürünün seçenekleri arasında değil.`,
      });
    } else if (!found.option.isActive) {
      blocking.push({
        ruleCode: 'PASIF_SECENEK',
        ruleName: 'Pasif seçenek',
        severity: RuleSeverity.ENGELLE,
        message: `"${found.option.name}" artık üretilmiyor, seçilemez.`,
      });
    }
  }

  // Grup düzeyi kurallar.
  for (const group of groups) {
    const chosen = group.options.filter((o) => selected.has(o.code));

    if (group.isRequired && chosen.length === 0) {
      blocking.push({
        ruleCode: `ZORUNLU_${group.code}`,
        ruleName: 'Zorunlu seçim eksik',
        severity: RuleSeverity.ENGELLE,
        message: `"${group.name}" grubunda seçim yapılmalıdır.`,
      });
    }

    if (!group.isMultiple && chosen.length > 1) {
      blocking.push({
        ruleCode: `TEKLI_${group.code}`,
        ruleName: 'Birden fazla seçim',
        severity: RuleSeverity.ENGELLE,
        message: `"${group.name}" grubunda yalnızca bir seçenek işaretlenebilir.`,
      });
    }
  }

  // Kısıtlama kuralları.
  for (const rule of rules) {
    if (!rule.isActive) continue;

    // Kural yalnızca "when" tarafındaki seçeneklerin hepsi seçiliyse tetiklenir.
    const triggered = rule.whenOptions.length > 0 && rule.whenOptions.every((c) => selected.has(c));
    if (!triggered) continue;

    let violated = false;
    if (rule.type === RuleType.GEREKTIRIR) {
      // "then" tarafındaki seçeneklerden en az biri eksikse ihlal.
      violated = !rule.thenOptions.every((c) => selected.has(c));
    } else if (rule.type === RuleType.ENGELLER) {
      // "then" tarafından herhangi biri seçiliyse ihlal.
      violated = rule.thenOptions.some((c) => selected.has(c));
    } else {
      // UYARIR: then boşsa yalnız "when" yeter, doluysa kesişim aranır.
      violated =
        rule.thenOptions.length === 0 || rule.thenOptions.some((c) => selected.has(c));
    }

    if (!violated) continue;

    const violation: ConfigViolation = {
      ruleCode: rule.code,
      ruleName: rule.name,
      severity: rule.severity,
      message: rule.message,
    };
    if (rule.severity === RuleSeverity.ENGELLE) blocking.push(violation);
    else warnings.push(violation);
  }

  return { valid: blocking.length === 0, blocking, warnings };
}

// ---------------------------------------------------------------------------
// Dinamik maliyet hesaplama
// ---------------------------------------------------------------------------

export interface BomInput {
  description: string;
  quantity: number;
  /** Hammaddenin güncel birim fiyatı */
  unitCost: number;
  /** Fire oranı (%) */
  scrapPct: number;
}

export interface LaborInput {
  description?: string | null;
  kind: RateKind;
  hours: number;
  hourlyRate: number;
}

export interface PolicyInput {
  overheadPct: number;
  engineeringPct: number;
  contingencyPct: number;
  targetMarginPct: number;
  minMarginPct: number;
}

export interface CostBreakdown {
  /** Ürünün konfigürasyondan bağımsız temel maliyeti */
  baseCost: number;
  /** Hammadde (BOM) maliyeti - fire dahil */
  materialCost: number;
  /** Atölye işçiliği */
  laborCost: number;
  /** Mühendislik eforu (saat bazlı) */
  engineeringCost: number;
  /** Seçeneklerin maliyet etkisi */
  optionCost: number;
  /** Yükler öncesi doğrudan maliyet */
  directCost: number;
  /** Genel üretim gideri */
  overhead: number;
  /** Mühendislik/proje yönetim yükü (oransal) */
  engineeringLoad: number;
  /** Risk payı */
  contingency: number;
  /** Birim toplam maliyet */
  unitCost: number;
  /** Politikanın hedef marjıyla önerilen birim satış fiyatı */
  suggestedUnitPrice: number;
  /** Seçeneklerin fiyata doğrudan etkisi (öneriye dahildir) */
  optionPrice: number;
  /** Konfigürasyondan gelen toplam termin (gün) */
  leadTimeDays: number;
}

/** Sayıyı 2 haneye yuvarlar - kuruş farklarının birikmesini önler. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Bir teklif kalemi için birim maliyeti ve önerilen fiyatı hesaplar.
 *
 * Maliyet zinciri:
 *   doğrudan maliyet = temel + hammadde(fire dahil) + işçilik + mühendislik + seçenek etkisi
 *   toplam maliyet   = doğrudan maliyet + genel gider + mühendislik yükü + risk payı
 *   önerilen fiyat   = toplam maliyet / (1 - hedef marj) + seçeneklerin fiyat etkisi
 */
export function calculateCost(input: {
  baseCost: number;
  baseLeadTimeDays: number;
  bom: BomInput[];
  labor: LaborInput[];
  options: Pick<OptionLike, 'costDelta' | 'priceDelta' | 'leadTimeDelta' | 'laborHours'>[];
  /** Seçeneklerden gelen ek işçilik saatinin ücretlendirileceği saatlik ücret */
  optionLaborRate?: number;
  policy: PolicyInput;
}): CostBreakdown {
  const { baseCost, bom, labor, options, policy } = input;

  const materialCost = bom.reduce(
    (sum, line) => sum + line.quantity * line.unitCost * (1 + (line.scrapPct || 0) / 100),
    0,
  );

  const laborCost = labor
    .filter((l) => l.kind === RateKind.ISCILIK)
    .reduce((sum, l) => sum + l.hours * l.hourlyRate, 0);

  const engineeringCost = labor
    .filter((l) => l.kind === RateKind.MUHENDISLIK)
    .reduce((sum, l) => sum + l.hours * l.hourlyRate, 0);

  const optionCost = options.reduce((sum, o) => sum + o.costDelta, 0);
  const optionPrice = options.reduce((sum, o) => sum + o.priceDelta, 0);

  // Seçeneklerin getirdiği ek işçilik saati de maliyete girer.
  const optionLaborCost =
    (input.optionLaborRate ?? 0) * options.reduce((sum, o) => sum + o.laborHours, 0);

  const directCost =
    baseCost + materialCost + laborCost + engineeringCost + optionCost + optionLaborCost;

  const overhead = directCost * (policy.overheadPct / 100);
  const engineeringLoad = directCost * (policy.engineeringPct / 100);
  const contingency = directCost * (policy.contingencyPct / 100);

  const unitCost = directCost + overhead + engineeringLoad + contingency;

  // Hedef marj satış fiyatı üzerinden tanımlıdır: fiyat = maliyet / (1 - marj).
  const marginRatio = Math.min(Math.max(policy.targetMarginPct, 0), 95) / 100;
  const suggestedUnitPrice = unitCost / (1 - marginRatio) + optionPrice;

  const leadTimeDays =
    input.baseLeadTimeDays + options.reduce((sum, o) => sum + o.leadTimeDelta, 0);

  return {
    baseCost: round(baseCost),
    materialCost: round(materialCost),
    laborCost: round(laborCost + optionLaborCost),
    engineeringCost: round(engineeringCost),
    optionCost: round(optionCost),
    directCost: round(directCost),
    overhead: round(overhead),
    engineeringLoad: round(engineeringLoad),
    contingency: round(contingency),
    unitCost: round(unitCost),
    suggestedUnitPrice: round(suggestedUnitPrice),
    optionPrice: round(optionPrice),
    leadTimeDays,
  };
}

/** Satış fiyatı ve maliyetten kâr marjı (%) - fiyat 0 ise 0 döner. */
export function marginPct(price: number, cost: number): number {
  if (price <= 0) return 0;
  return round(((price - cost) / price) * 100);
}

/**
 * Teklifin onaya düşmesi gerekip gerekmediğine karar verir.
 * İki eşik vardır: kullanıcının iskonto limiti ve politikanın asgari marjı.
 */
export function needsApproval(params: {
  discountPct: number;
  marginPct: number;
  userMaxDiscountPct: number;
  minMarginPct: number;
}): { required: boolean; reason: string | null } {
  const reasons: string[] = [];

  if (params.discountPct > params.userMaxDiscountPct) {
    reasons.push(
      `İskonto %${params.discountPct.toFixed(1)}, yetkiniz olan %${params.userMaxDiscountPct.toFixed(1)} sınırının üzerinde.`,
    );
  }
  if (params.marginPct < params.minMarginPct) {
    reasons.push(
      `Kâr marjı %${params.marginPct.toFixed(1)}, asgari %${params.minMarginPct.toFixed(1)} sınırının altında.`,
    );
  }

  return { required: reasons.length > 0, reason: reasons.join(' ') || null };
}
