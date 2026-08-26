/**
 * ERP / PLM entegrasyonu - Marpol PPM (Üretim Yönetim Sistemi).
 *
 * CRM tek başına bir ada değildir: satış ekibi "Siparişim ne durumda?"
 * sorusuna, üretim emrinin PPM'deki hangi proses adımında olduğunu okuyarak
 * CRM üzerinden cevap verebilmelidir.
 *
 * PPM'in REST API'sine servis kullanıcısıyla JWT ile bağlanılır. PPM
 * çalışmıyorsa CRM çalışmaya devam eder; ilgili alanlar "bağlantı yok"
 * olarak işaretlenir (ErpUnavailableError).
 */

import { env } from '../env.js';

export class ErpUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErpUnavailableError';
  }
}

/** PPM'den okunan, CRM'in ihtiyaç duyduğu sadeleştirilmiş üretim durumu. */
export interface ErpProductionStatus {
  erpOrderId: string;
  erpOrderNo: string;
  erpStatus: string;
  /** Şu anda üzerinde çalışılan proses adımı - ör. "Emdirme" */
  currentStep: string | null;
  progressPct: number;
  producedQty: number;
  quantity: number;
  erpDeadline: string | null;
  customer: string | null;
  raw: unknown;
}

interface PpmStepLog {
  status: string;
  node?: { label?: string | null } | null;
  operator?: { fullName?: string | null } | null;
}

interface PpmOrder {
  id: string;
  orderNo: string;
  status: string;
  quantity: number;
  producedQty: number;
  deadline: string | null;
  customer: string | null;
  stepLogs?: PpmStepLog[];
}

// Token'ı her istekte yeniden almamak için basit bellek içi önbellek.
let cachedToken: { value: string; expiresAt: number } | null = null;

export function isErpEnabled(): boolean {
  return env.erp.enabled && Boolean(env.erp.baseUrl && env.erp.username && env.erp.password);
}

/** İstekleri sonsuza kadar bekletmemek için zaman aşımlı fetch. */
async function timedFetch(url: string, init: RequestInit, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError' ? 'zaman aşımı' : 'bağlantı kurulamadı';
    throw new ErpUnavailableError(`Marpol PPM'e ulaşılamıyor (${reason}): ${env.erp.baseUrl}`);
  } finally {
    clearTimeout(timer);
  }
}

async function login(): Promise<string> {
  const res = await timedFetch(`${env.erp.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: env.erp.username, password: env.erp.password }),
  });

  if (!res.ok) {
    throw new ErpUnavailableError(
      `Marpol PPM oturumu açılamadı (HTTP ${res.status}). ERP_USERNAME / ERP_PASSWORD ayarlarını kontrol edin.`,
    );
  }

  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new ErpUnavailableError('Marpol PPM geçerli bir oturum anahtarı döndürmedi.');

  // Token 12 saat geçerli; 10 saat sonra kendimiz yeniliyoruz.
  cachedToken = { value: body.token, expiresAt: Date.now() + 10 * 60 * 60 * 1000 };
  return body.token;
}

async function token(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  return login();
}

async function erpGet<T>(path: string): Promise<T> {
  if (!isErpEnabled()) {
    throw new ErpUnavailableError('ERP entegrasyonu kapalı. server/.env içinde ERP_* ayarlarını doldurun.');
  }

  let bearer = await token();
  let res = await timedFetch(`${env.erp.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });

  // Token süresi dolmuşsa bir kez yeniden giriş yapıp tekrar dene.
  if (res.status === 401) {
    cachedToken = null;
    bearer = await token();
    res = await timedFetch(`${env.erp.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
  }

  if (!res.ok) {
    throw new ErpUnavailableError(`Marpol PPM isteği başarısız (HTTP ${res.status}): ${path}`);
  }

  return (await res.json()) as T;
}

/** Proses adımı kayıtlarından ilerleme yüzdesi ve güncel adımı çıkarır. */
function progressFrom(stepLogs: PpmStepLog[] | undefined): {
  progressPct: number;
  currentStep: string | null;
} {
  if (!stepLogs?.length) return { progressPct: 0, currentStep: null };

  const done = stepLogs.filter((s) => s.status === 'TAMAMLANDI' || s.status === 'ATLANDI').length;
  const progressPct = Math.round((done / stepLogs.length) * 100);

  // Güncel adım: başlamış olan ilk adım, yoksa bekleyen ilk adım.
  const active = stepLogs.find((s) => s.status === 'BASLADI') ?? stepLogs.find((s) => s.status === 'BEKLIYOR');
  return { progressPct, currentStep: active?.node?.label ?? null };
}

function normalize(order: PpmOrder): ErpProductionStatus {
  const { progressPct, currentStep } = progressFrom(order.stepLogs);
  return {
    erpOrderId: order.id,
    erpOrderNo: order.orderNo,
    erpStatus: order.status,
    currentStep,
    // Adım kaydı yoksa üretilen adet üzerinden ilerleme hesapla.
    progressPct:
      progressPct > 0
        ? progressPct
        : order.quantity > 0
          ? Math.round((order.producedQty / order.quantity) * 100)
          : 0,
    producedQty: order.producedQty ?? 0,
    quantity: order.quantity ?? 0,
    erpDeadline: order.deadline ?? null,
    customer: order.customer ?? null,
    raw: order,
  };
}

/** Üretim emri numarasına göre PPM'den güncel üretim durumunu okur. */
export async function fetchProductionStatus(erpOrderNo: string): Promise<ErpProductionStatus> {
  const orders = await erpGet<PpmOrder[]>(`/orders?q=${encodeURIComponent(erpOrderNo)}`);
  const match = orders.find((o) => o.orderNo === erpOrderNo);
  if (!match) {
    throw new ErpUnavailableError(`Marpol PPM'de "${erpOrderNo}" numaralı üretim emri bulunamadı.`);
  }
  return normalize(match);
}

/** Sipariş kalemini bir üretim emrine bağlarken kullanılacak arama. */
export async function searchProductionOrders(q: string): Promise<ErpProductionStatus[]> {
  const orders = await erpGet<PpmOrder[]>(`/orders?q=${encodeURIComponent(q)}`);
  return orders.slice(0, 25).map(normalize);
}

/** Bağlantı sağlık kontrolü - gösterge panelinde rozet olarak gösterilir. */
export async function checkErpConnection(): Promise<{
  enabled: boolean;
  connected: boolean;
  baseUrl: string;
  message: string;
}> {
  if (!isErpEnabled()) {
    return {
      enabled: false,
      connected: false,
      baseUrl: env.erp.baseUrl,
      message: 'ERP entegrasyonu kapalı.',
    };
  }

  try {
    const summary = await erpGet<{ total: number }>('/orders/summary');
    return {
      enabled: true,
      connected: true,
      baseUrl: env.erp.baseUrl,
      message: `Bağlantı kuruldu. PPM'de ${summary.total} üretim emri var.`,
    };
  } catch (err) {
    return {
      enabled: true,
      connected: false,
      baseUrl: env.erp.baseUrl,
      message: err instanceof Error ? err.message : 'Bilinmeyen bağlantı hatası.',
    };
  }
}
