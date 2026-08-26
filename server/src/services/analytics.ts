/**
 * Müşteri davranış tahmini ve ürün önerileri.
 *
 * Bilinçli olarak makine öğrenmesi modeli değil, **açıklanabilir** kural
 * tabanlı bir yaklaşım kullanılır: satış ekibi her skorun neden o çıktığını
 * müşteriye anlatabilmelidir.
 *
 *   - Davranış: RFM (Recency / Frequency / Monetary) analizi
 *   - Öneri: kategori benzerliği + sektör benzerliği + genel satış performansı
 */

// ---------------------------------------------------------------------------
// RFM davranış analizi
// ---------------------------------------------------------------------------

export interface CustomerFacts {
  customerId: string;
  /** Son siparişin üzerinden geçen gün sayısı - hiç sipariş yoksa null */
  recencyDays: number | null;
  /** Toplam sipariş adedi */
  frequency: number;
  /** Toplam ciro */
  monetary: number;
  /** Müşterinin sisteme girdiği tarihten bu yana geçen gün */
  ageDays: number;
}

export interface BehaviorResult {
  customerId: string;
  recencyDays: number | null;
  frequency: number;
  monetary: number;
  /** 1-5 arası puanlar; sipariş geçmişi yoksa 0 */
  recencyScore: number;
  frequencyScore: number;
  monetaryScore: number;
  rfm: string;
  segment: string;
  /** Önümüzdeki dönemde satın alma olasılığı (%) */
  purchaseProbability: number;
  /** Kayıp (churn) riski */
  churnRisk: 'dusuk' | 'orta' | 'yuksek';
  /** Skorun gerekçesi - kullanıcıya gösterilir */
  explanation: string;
}

/**
 * Bir değeri, tüm müşterilerin dağılımı içindeki yerine göre 1-5 arası puanlar.
 * `invert` true ise küçük değer iyi demektir (yenilik/recency böyledir).
 */
function quintileScore(value: number, sorted: number[], invert = false): number {
  if (sorted.length === 0) return 3;
  // Değerden küçük olanların oranı -> yüzdelik dilim.
  let below = 0;
  for (const v of sorted) {
    if (v < value) below++;
    else break;
  }
  const pct = sorted.length === 1 ? 0.5 : below / (sorted.length - 1);
  const raw = Math.floor(pct * 5) + 1;
  const score = Math.min(5, Math.max(1, raw));
  return invert ? 6 - score : score;
}

/** Segment ve satın alma olasılığını R/F/M puanlarından türetir. */
function classify(r: number, f: number, m: number): { segment: string; probability: number } {
  const fm = (f + m) / 2;

  if (r >= 4 && fm >= 4) return { segment: 'Sadık Müşteri (Champion)', probability: 88 };
  if (r >= 4 && fm >= 3) return { segment: 'Düzenli Müşteri', probability: 74 };
  if (r >= 4 && fm < 3) return { segment: 'Yeni Müşteri', probability: 58 };
  if (r === 3 && fm >= 4) return { segment: 'Sadık ama Yavaşlayan', probability: 62 };
  if (r === 3) return { segment: 'Standart Müşteri', probability: 45 };
  if (r <= 2 && fm >= 4) return { segment: 'Risk Altında', probability: 32 };
  if (r <= 2 && fm >= 3) return { segment: 'Uykuya Dalmış', probability: 24 };
  return { segment: 'Kaybedilmiş Müşteri', probability: 12 };
}

function churnFromSegment(segment: string): 'dusuk' | 'orta' | 'yuksek' {
  if (segment === 'Risk Altında' || segment === 'Kaybedilmiş Müşteri' || segment === 'Uykuya Dalmış') {
    return 'yuksek';
  }
  if (segment === 'Standart Müşteri' || segment === 'Sadık ama Yavaşlayan') return 'orta';
  return 'dusuk';
}

/**
 * Tüm müşterilerin davranış profilini birlikte hesaplar.
 * Puanlar göreceli olduğu için tek müşteri için ayrı hesaplanamaz -
 * dağılımın tamamı gerekir.
 */
export function analyzeBehavior(facts: CustomerFacts[]): BehaviorResult[] {
  const withOrders = facts.filter((f) => f.frequency > 0 && f.recencyDays !== null);

  const recencies = withOrders.map((f) => f.recencyDays as number).sort((a, b) => a - b);
  const frequencies = withOrders.map((f) => f.frequency).sort((a, b) => a - b);
  const monetaries = withOrders.map((f) => f.monetary).sort((a, b) => a - b);

  return facts.map((f) => {
    // Hiç sipariş vermemiş müşteri: RFM tanımsız, potansiyel olarak işaretlenir.
    if (f.frequency === 0 || f.recencyDays === null) {
      const fresh = f.ageDays <= 90;
      return {
        customerId: f.customerId,
        recencyDays: null,
        frequency: 0,
        monetary: 0,
        recencyScore: 0,
        frequencyScore: 0,
        monetaryScore: 0,
        rfm: '-',
        segment: 'Potansiyel Müşteri',
        purchaseProbability: fresh ? 35 : 18,
        churnRisk: fresh ? 'orta' : 'yuksek',
        explanation: fresh
          ? 'Henüz siparişi yok, kayıt yeni. İlk siparişe dönüştürme fırsatı.'
          : 'Kayıtlı ancak hiç sipariş vermemiş. İlgi durumu yeniden değerlendirilmeli.',
      };
    }

    // Yenilikte küçük gün sayısı iyidir -> invert.
    const recencyScore = quintileScore(f.recencyDays, recencies, true);
    const frequencyScore = quintileScore(f.frequency, frequencies);
    const monetaryScore = quintileScore(f.monetary, monetaries);

    const { segment, probability } = classify(recencyScore, frequencyScore, monetaryScore);

    return {
      customerId: f.customerId,
      recencyDays: f.recencyDays,
      frequency: f.frequency,
      monetary: f.monetary,
      recencyScore,
      frequencyScore,
      monetaryScore,
      rfm: `${recencyScore}${frequencyScore}${monetaryScore}`,
      segment,
      purchaseProbability: probability,
      churnRisk: churnFromSegment(segment),
      explanation:
        `Son sipariş ${f.recencyDays} gün önce (yenilik ${recencyScore}/5), ` +
        `toplam ${f.frequency} sipariş (sıklık ${frequencyScore}/5), ` +
        `toplam ciro ${Math.round(f.monetary).toLocaleString('tr-TR')} (değer ${monetaryScore}/5).`,
    };
  });
}

// ---------------------------------------------------------------------------
// Ürün önerileri
// ---------------------------------------------------------------------------

export interface PurchaseRecord {
  customerId: string;
  productId: string;
  /** Müşterinin bu üründen aldığı toplam tutar */
  amount: number;
}

export interface ProductInfo {
  id: string;
  code: string;
  name: string;
  family: string | null;
}

export interface Recommendation {
  productId: string;
  code: string;
  name: string;
  family: string | null;
  /** 0-100 arası öneri gücü */
  score: number;
  /** Neden önerildiği - kullanıcıya birebir gösterilir */
  reasons: string[];
}

/**
 * Müşterinin **daha önce almadığı** ürünler arasından öneri üretir.
 *
 * Puanlama üç kaynaktan beslenir:
 *   a) Müşterinin sık aldığı ürün ailesinden olması        (en güçlü sinyal)
 *   b) Aynı sektördeki diğer müşterilerin tercih etmesi
 *   c) Genel olarak çok satan bir ürün olması              (en zayıf sinyal)
 */
export function recommendProducts(params: {
  customerId: string;
  /** Müşterinin sektörü - sektör benzerliği için */
  industry: string | null;
  products: ProductInfo[];
  purchases: PurchaseRecord[];
  /** customerId -> sektör eşlemesi */
  industryByCustomer: Map<string, string | null>;
  limit?: number;
}): Recommendation[] {
  const { customerId, industry, products, purchases, industryByCustomer } = params;
  const limit = params.limit ?? 5;

  const productById = new Map(products.map((p) => [p.id, p]));
  const ownPurchases = purchases.filter((p) => p.customerId === customerId);
  const owned = new Set(ownPurchases.map((p) => p.productId));

  // (a) Müşterinin ürün ailesi tercihleri - aileye harcadığı tutara göre.
  const familySpend = new Map<string, number>();
  for (const purchase of ownPurchases) {
    const family = productById.get(purchase.productId)?.family;
    if (!family) continue;
    familySpend.set(family, (familySpend.get(family) ?? 0) + purchase.amount);
  }
  const maxFamilySpend = Math.max(1, ...familySpend.values());

  // (b) Aynı sektördeki diğer müşterilerin ürün tercihleri.
  const peerCount = new Map<string, number>();
  if (industry) {
    const peers = new Set<string>();
    for (const purchase of purchases) {
      if (purchase.customerId === customerId) continue;
      if (industryByCustomer.get(purchase.customerId) !== industry) continue;
      peers.add(purchase.customerId);
      peerCount.set(purchase.productId, (peerCount.get(purchase.productId) ?? 0) + 1);
    }
  }
  const maxPeerCount = Math.max(1, ...peerCount.values());

  // (c) Genel satış performansı.
  const globalSpend = new Map<string, number>();
  for (const purchase of purchases) {
    globalSpend.set(purchase.productId, (globalSpend.get(purchase.productId) ?? 0) + purchase.amount);
  }
  const maxGlobalSpend = Math.max(1, ...globalSpend.values());

  const results: Recommendation[] = [];

  for (const product of products) {
    if (owned.has(product.id)) continue;

    let score = 0;
    const reasons: string[] = [];

    if (product.family && familySpend.has(product.family)) {
      const weight = (familySpend.get(product.family) as number) / maxFamilySpend;
      score += weight * 55;
      reasons.push(`Müşterinin sık tercih ettiği "${product.family}" ailesinden.`);
    }

    if (peerCount.has(product.id)) {
      const weight = (peerCount.get(product.id) as number) / maxPeerCount;
      score += weight * 30;
      reasons.push(
        `${industry} sektöründeki ${peerCount.get(product.id)} müşteri bu ürünü alıyor.`,
      );
    }

    if (globalSpend.has(product.id)) {
      const weight = (globalSpend.get(product.id) as number) / maxGlobalSpend;
      score += weight * 15;
      if (weight > 0.5) reasons.push('Genel satışlarda öne çıkan ürün.');
    }

    // Hiç sinyal yoksa öneri listesine girmesin.
    if (reasons.length === 0) continue;

    results.push({
      productId: product.id,
      code: product.code,
      name: product.name,
      family: product.family,
      score: Math.round(Math.min(100, score)),
      reasons,
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
