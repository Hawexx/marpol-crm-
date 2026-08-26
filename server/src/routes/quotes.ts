import { Router } from 'express';
import { z } from 'zod';
import { ModuleKey, Prisma, QuoteStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, badRequest, conflict, forbidden, nextSequence, listLimit } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { calculateCost, marginPct, needsApproval, validateConfiguration } from '../services/cpq.js';

export const quotesRouter = Router();

const MODULE = ModuleKey.TEKLIFLER;

quotesRouter.use(requireAuth);

const nullableString = z.string().trim().optional().nullable();

/**
 * 0 -> "Rev A", 25 -> "Rev Z", 26 -> "Rev AA" ...
 *
 * `% 26` ile 26. revizyon yeniden "Rev A" olup zincirdeki ilk teklifle
 * karisiyordu; elektronik tablo sutun mantigiyla harf eklenerek devam edilir.
 * web/src/lib/format.ts icindeki esdegeriyle ayni kalmalidir.
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

const quoteInclude = {
  customer: { select: { id: true, code: true, name: true, standardDiscountPct: true, currency: true } },
  opportunity: { select: { id: true, code: true, title: true, stage: true } },
  policy: true,
  createdBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      product: { select: { id: true, code: true, name: true, family: true } },
      options: { include: { option: { select: { id: true, code: true, name: true } } } },
      bomLines: { include: { material: { select: { id: true, code: true, name: true } } } },
      laborLines: { include: { rate: true } },
    },
  },
};

// ---------------------------------------------------------------------------
// Toplam hesaplama
// ---------------------------------------------------------------------------

/**
 * Teklifin toplamlarini kalemlerinden yeniden hesaplar.
 * Her kalem/iskonto degisiminden sonra cagrilir.
 */
/** Kurus farklarinin float aritmetiginde birikmesini onler. */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Musteriye uygulanan **gercek** iskonto orani (%).
 *
 * Teklifin `discountPct` alani yalnizca genel iskontodur; her kalemin ayrica
 * kendi `discountPct` alani ve elle girilebilen `unitPrice` degeri vardir.
 * Yetki denetimi bu ikisinin toplam etkisine bakmali, aksi halde satisci
 * genel iskontoyu 0 birakip kalem bazinda %90 vererek limiti asabilir.
 *
 * Liste degeri = Σ(birim fiyat x miktar); efektif iskonto, musteri tutarinin
 * bu degere gore ne kadar altinda kaldigidir.
 */
export function effectiveDiscountPct(
  items: { unitPrice: number; quantity: number }[],
  totalPrice: number,
): number {
  const gross = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  if (gross <= 0) return 0;
  return Math.max(0, Math.round((1 - totalPrice / gross) * 1000) / 10);
}

async function recalcQuote(quoteId: string) {
  const quote = await prisma.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: { items: true },
  });

  const subtotal = money(quote.items.reduce((sum, i) => sum + i.lineTotal, 0));
  const totalCost = money(quote.items.reduce((sum, i) => sum + i.lineCost, 0));
  const discountAmount = money(subtotal * (quote.discountPct / 100));
  const totalPrice = money(subtotal - discountAmount);
  const leadTimeDays = quote.items.reduce((max, i) => Math.max(max, i.leadTimeDays), 0);

  return prisma.quote.update({
    where: { id: quoteId },
    data: {
      subtotal,
      totalCost,
      discountAmount,
      totalPrice,
      marginPct: marginPct(totalPrice, totalCost),
      leadTimeDays,
    },
  });
}

/** Kalem icin konfigurasyonu dogrular ve guncel fiyatlarla maliyet cikarir. */
async function priceItem(input: {
  productId?: string | null;
  selectedOptions: string[];
  quantity: number;
  policyId: string | null;
  /** Elle girilen birim fiyat - bos ise onerilen fiyat kullanilir */
  unitPrice?: number | null;
  discountPct: number;
}) {
  const policy =
    (input.policyId ? await prisma.pricingPolicy.findUnique({ where: { id: input.policyId } }) : null) ??
    (await prisma.pricingPolicy.findFirst({ where: { isDefault: true } }));

  if (!policy) {
    throw badRequest('Varsayilan fiyat politikasi tanimli degil. Fiyatlandirma sekmesinden ekleyin.');
  }

  // Serbest metin kalemi (urun secilmemis): maliyet hesabi yapilmaz.
  if (!input.productId) {
    const unitPrice = input.unitPrice ?? 0;
    const lineTotal = unitPrice * input.quantity * (1 - input.discountPct / 100);
    return {
      policy,
      chosen: [] as { id: string; costDelta: number; priceDelta: number }[],
      unitCost: 0,
      unitPrice,
      lineCost: 0,
      lineTotal,
      leadTimeDays: 0,
      validation: { valid: true, blocking: [], warnings: [] },
    };
  }

  const product = await prisma.product.findUniqueOrThrow({
    where: { id: input.productId },
    include: {
      optionGroups: {
        orderBy: { sortOrder: 'asc' },
        include: { options: { orderBy: { sortOrder: 'asc' } } },
      },
      rules: true,
      bomLines: { include: { material: true } },
      laborLines: { include: { rate: true } },
    },
  });

  const validation = validateConfiguration(product.optionGroups, product.rules, input.selectedOptions);

  const chosen = product.optionGroups
    .flatMap((g) => g.options)
    .filter((o) => input.selectedOptions.includes(o.code));

  const shopRate = await prisma.laborRate.findFirst({
    where: { kind: 'ISCILIK', isActive: true },
    orderBy: { hourlyRate: 'asc' },
  });

  const cost = calculateCost({
    baseCost: product.baseCost,
    baseLeadTimeDays: product.leadTimeDays,
    bom: product.bomLines.map((b) => ({
      description: b.description,
      quantity: b.quantity,
      unitCost: b.material?.currentPrice ?? b.unitCost,
      scrapPct: b.material?.scrapPct ?? b.scrapPct,
    })),
    labor: product.laborLines.map((l) => ({
      description: l.description,
      kind: l.rate.kind,
      hours: l.hours,
      hourlyRate: l.rate.hourlyRate,
    })),
    options: chosen,
    optionLaborRate: shopRate?.hourlyRate ?? 0,
    policy,
  });

  const unitPrice = input.unitPrice ?? cost.suggestedUnitPrice;
  const lineTotal = unitPrice * input.quantity * (1 - input.discountPct / 100);
  const lineCost = cost.unitCost * input.quantity;

  return {
    policy,
    product,
    chosen,
    cost,
    unitCost: cost.unitCost,
    unitPrice,
    lineCost,
    lineTotal,
    leadTimeDays: cost.leadTimeDays,
    validation,
  };
}

// ---------------------------------------------------------------------------
// Liste ve detay
// ---------------------------------------------------------------------------

quotesRouter.get(
  '/',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const status = req.query.status ? String(req.query.status).split(',') : undefined;

    res.json(
      await prisma.quote.findMany({
        where: {
          // Varsayilan olarak yalnizca guncel revizyonlar listelenir.
          ...(req.query.allRevisions === 'true' ? {} : { isCurrent: true }),
          ...(status ? { status: { in: status as QuoteStatus[] } } : {}),
          ...(req.query.customerId ? { customerId: String(req.query.customerId) } : {}),
          ...(q
            ? {
                OR: [
                  { quoteNo: { contains: q, mode: 'insensitive' } },
                  { title: { contains: q, mode: 'insensitive' } },
                  { customer: { name: { contains: q, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        include: {
          customer: { select: { id: true, code: true, name: true } },
          opportunity: { select: { id: true, code: true, title: true } },
          createdBy: { select: { id: true, fullName: true } },
          _count: { select: { items: true } },
        },
        orderBy: [{ issuedAt: 'desc' }],
        take: listLimit(req.query.limit),
      }),
    );
  }),
);

quotesRouter.get(
  '/:id',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const quote = await prisma.quote.findUniqueOrThrow({
      where: { id: req.params.id },
      include: quoteInclude,
    });

    // Revizyon zincirinin tamami - "Rev A'ya donup bakayim" icin.
    const chain = await prisma.quote.findMany({
      where: { rootQuoteId: quote.rootQuoteId ?? quote.id },
      select: {
        id: true, quoteNo: true, revision: true, isCurrent: true, status: true,
        totalPrice: true, marginPct: true, revisionNote: true, issuedAt: true, createdAt: true,
      },
      orderBy: { revision: 'asc' },
    });

    res.json({
      ...quote,
      revisionLabel: revisionLabel(quote.revision),
      chain: chain.map((c) => ({ ...c, revisionLabel: revisionLabel(c.revision) })),
    });
  }),
);

// ---------------------------------------------------------------------------
// Olusturma / guncelleme
// ---------------------------------------------------------------------------

const quoteBase = {
  customerId: z.string().uuid('Musteri secilmelidir.'),
  opportunityId: z.string().uuid().optional().nullable(),
  policyId: z.string().uuid().optional().nullable(),
  title: z.string().min(2, 'Teklif basligi zorunludur.'),
  currency: z.string().default('TRY'),
  validUntil: z.coerce.date().optional().nullable(),
  discountPct: z.number().min(0).max(100).default(0),
  paymentTerms: nullableString,
  deliveryTerms: nullableString,
  terms: nullableString,
  notes: nullableString,
};

quotesRouter.post(
  '/',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = z.object(quoteBase).parse(req.body);

    const [rows, customer, defaultPolicy] = await Promise.all([
      prisma.quote.findMany({ where: { revision: 0 }, select: { quoteNo: true } }),
      prisma.customer.findUniqueOrThrow({ where: { id: data.customerId } }),
      prisma.pricingPolicy.findFirst({ where: { isDefault: true } }),
    ]);

    const quote = await prisma.quote.create({
      data: {
        ...data,
        quoteNo: nextSequence('TKF', rows.map((r) => r.quoteNo)),
        revision: 0,
        isCurrent: true,
        // Musterinin sozlesmeli iskontosu varsayilan olarak uygulanir.
        // `??` kullanilir: acikca 0 girilen iskonto, musteri iskontosuna donmemeli.
        discountPct: data.discountPct ?? customer.standardDiscountPct,
        currency: data.currency || customer.currency,
        policyId: data.policyId ?? defaultPolicy?.id ?? null,
        paymentTerms: data.paymentTerms ?? customer.paymentTerms,
        deliveryTerms: data.deliveryTerms ?? customer.deliveryTerms,
        createdById: req.user!.id,
      },
    });

    // Kok teklif kendi kendinin koku olur; revizyonlar bu id'ye baglanir.
    const withRoot = await prisma.quote.update({
      where: { id: quote.id },
      data: { rootQuoteId: quote.id },
      include: quoteInclude,
    });

    await audit(req, 'CREATE', 'Quote', quote.id, { quoteNo: quote.quoteNo });
    res.status(201).json({ ...withRoot, revisionLabel: revisionLabel(withRoot.revision) });
  }),
);

quotesRouter.put(
  '/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = z.object(quoteBase).partial().parse(req.body);
    const existing = await prisma.quote.findUniqueOrThrow({ where: { id: req.params.id } });

    // Karara baglanmis teklif degistirilemez - yeni revizyon acilmalidir.
    if (existing.status === QuoteStatus.KABUL_EDILDI || existing.status === QuoteStatus.REVIZE_EDILDI) {
      throw conflict('Bu teklif kilitli. Degisiklik icin yeni revizyon olusturun.');
    }

    await prisma.quote.update({ where: { id: req.params.id }, data });
    const quote = await recalcQuote(req.params.id);
    await audit(req, 'UPDATE', 'Quote', quote.id, data);
    res.json(quote);
  }),
);

// ---------------------------------------------------------------------------
// Kalemler - konfigurasyon dogrulamasi burada devreye girer
// ---------------------------------------------------------------------------

const itemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().min(1, 'Kalem aciklamasi zorunludur.'),
  quantity: z.number().positive().default(1),
  unit: z.string().default('adet'),
  selectedOptions: z.array(z.string()).default([]),
  /** Bos birakilirsa CPQ'nun onerdigi fiyat kullanilir. */
  unitPrice: z.number().nonnegative().optional().nullable(),
  discountPct: z.number().min(0).max(100).default(0),
  notes: nullableString,
  sortOrder: z.number().int().default(0),
  /** Engelleyici olmayan uyarilari kabul edip devam etme. */
  acceptWarnings: z.boolean().default(false),
});

quotesRouter.post(
  '/:id/items',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = itemSchema.parse(req.body);
    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: req.params.id } });

    if (quote.status === QuoteStatus.KABUL_EDILDI || quote.status === QuoteStatus.REVIZE_EDILDI) {
      throw conflict('Bu teklif kilitli. Degisiklik icin yeni revizyon olusturun.');
    }

    const priced = await priceItem({ ...data, policyId: quote.policyId });

    // Mühendislik açısından imkânsız kombinasyon: kayda izin verilmez.
    if (!priced.validation.valid) {
      throw badRequest('Konfigurasyon mühendislik kurallarina uymuyor.', priced.validation.blocking);
    }
    if (priced.validation.warnings.length > 0 && !data.acceptWarnings) {
      // Riskli ama uretilebilir: satisci onaylamadan kaydedilmez.
      res.status(409).json({
        error: 'Konfigurasyon riskli kombinasyon iceriyor.',
        requiresAcknowledgement: true,
        warnings: priced.validation.warnings,
      });
      return;
    }

    const item = await prisma.quoteItem.create({
      data: {
        quoteId: req.params.id,
        productId: data.productId ?? null,
        description: data.description,
        quantity: data.quantity,
        unit: data.unit,
        unitCost: priced.unitCost,
        unitPrice: priced.unitPrice,
        discountPct: data.discountPct,
        lineTotal: priced.lineTotal,
        lineCost: priced.lineCost,
        marginPct: marginPct(priced.lineTotal, priced.lineCost),
        leadTimeDays: priced.leadTimeDays,
        notes: data.notes,
        sortOrder: data.sortOrder,
        // Secim anindaki maliyet dokumu teklife sabitlenir.
        configSnapshot: priced.cost
          ? ({ options: data.selectedOptions, breakdown: { ...priced.cost } } as Prisma.InputJsonValue)
          : undefined,
        options: {
          create: priced.chosen.map((o) => ({
            optionId: o.id,
            costDelta: o.costDelta,
            priceDelta: o.priceDelta,
          })),
        },
        // Urunun standart BOM'u teklife kopyalanir - mühendisliğe bu liste akar.
        bomLines: priced.product
          ? {
              create: priced.product.bomLines.map((b) => ({
                materialId: b.materialId,
                description: b.description,
                quantity: b.quantity * data.quantity,
                unit: b.unit,
                unitCost: b.material?.currentPrice ?? b.unitCost,
                scrapPct: b.material?.scrapPct ?? b.scrapPct,
                lineCost:
                  b.quantity * data.quantity * (b.material?.currentPrice ?? b.unitCost),
                revision: b.revision,
                sortOrder: b.sortOrder,
              })),
            }
          : undefined,
        laborLines: priced.product
          ? {
              create: priced.product.laborLines.map((l) => ({
                rateId: l.rateId,
                description: l.description,
                hours: l.hours * data.quantity,
                hourlyRate: l.rate.hourlyRate,
                lineCost: l.hours * data.quantity * l.rate.hourlyRate,
                sortOrder: l.sortOrder,
              })),
            }
          : undefined,
      },
      include: { options: { include: { option: true } }, bomLines: true, laborLines: true },
    });

    await recalcQuote(req.params.id);
    await audit(req, 'CREATE', 'QuoteItem', item.id, { description: item.description });
    res.status(201).json({ item, warnings: priced.validation.warnings });
  }),
);

quotesRouter.put(
  '/items/:itemId',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        description: z.string().min(1).optional(),
        quantity: z.number().positive().optional(),
        unitPrice: z.number().nonnegative().optional(),
        discountPct: z.number().min(0).max(100).optional(),
        notes: nullableString,
      })
      .parse(req.body);

    const existing = await prisma.quoteItem.findUniqueOrThrow({ where: { id: req.params.itemId } });
    const quantity = data.quantity ?? existing.quantity;
    const unitPrice = data.unitPrice ?? existing.unitPrice;
    const discountPct = data.discountPct ?? existing.discountPct;

    // Miktar degistiginde birim maliyet sabit, satir maliyeti olceklenir.
    const lineCost = existing.unitCost * quantity;
    const lineTotal = unitPrice * quantity * (1 - discountPct / 100);

    const item = await prisma.quoteItem.update({
      where: { id: req.params.itemId },
      data: {
        ...data,
        quantity,
        unitPrice,
        discountPct,
        lineCost,
        lineTotal,
        marginPct: marginPct(lineTotal, lineCost),
      },
    });

    await recalcQuote(existing.quoteId);
    await audit(req, 'UPDATE', 'QuoteItem', item.id, data);
    res.json(item);
  }),
);

quotesRouter.delete(
  '/items/:itemId',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const item = await prisma.quoteItem.delete({ where: { id: req.params.itemId } });
    await recalcQuote(item.quoteId);
    await audit(req, 'DELETE', 'QuoteItem', req.params.itemId);
    res.json({ message: 'Kalem silindi.' });
  }),
);

// ---------------------------------------------------------------------------
// Revizyon yonetimi - "Su parcayi da eklersek ne olur?"
// ---------------------------------------------------------------------------

/**
 * Mevcut teklifin birebir kopyasini bir sonraki revizyon olarak olusturur.
 * Eski revizyon silinmez; REVIZE_EDILDI olarak isaretlenip arsivde kalir.
 */
quotesRouter.post(
  '/:id/revise',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const { revisionNote } = z.object({ revisionNote: nullableString }).parse(req.body);

    const source = await prisma.quote.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        items: { include: { options: true, bomLines: true, laborLines: true } },
      },
    });

    const rootId = source.rootQuoteId ?? source.id;

    const created = await prisma.$transaction(async (tx) => {
      // Zincirdeki en yuksek revizyon numarasinin bir fazlasi.
      const last = await tx.quote.findFirst({
        where: { rootQuoteId: rootId },
        orderBy: { revision: 'desc' },
        select: { revision: true },
      });
      const revision = (last?.revision ?? source.revision) + 1;

      // Zincirdeki tum eski revizyonlar guncel olmaktan cikar.
      await tx.quote.updateMany({ where: { rootQuoteId: rootId }, data: { isCurrent: false } });
      await tx.quote.update({
        where: { id: source.id },
        data: { status: QuoteStatus.REVIZE_EDILDI },
      });

      const copy = await tx.quote.create({
        data: {
          quoteNo: source.quoteNo,
          revision,
          rootQuoteId: rootId,
          parentQuoteId: source.id,
          isCurrent: true,
          revisionNote,
          customerId: source.customerId,
          opportunityId: source.opportunityId,
          policyId: source.policyId,
          title: source.title,
          status: QuoteStatus.TASLAK,
          currency: source.currency,
          validUntil: source.validUntil,
          discountPct: source.discountPct,
          paymentTerms: source.paymentTerms,
          deliveryTerms: source.deliveryTerms,
          terms: source.terms,
          notes: source.notes,
          createdById: req.user!.id,
        },
      });

      // Kalemler ve alt satirlari birebir kopyalanir.
      for (const item of source.items) {
        await tx.quoteItem.create({
          data: {
            quoteId: copy.id,
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitCost: item.unitCost,
            unitPrice: item.unitPrice,
            discountPct: item.discountPct,
            lineTotal: item.lineTotal,
            lineCost: item.lineCost,
            marginPct: item.marginPct,
            leadTimeDays: item.leadTimeDays,
            configSnapshot: (item.configSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
            notes: item.notes,
            sortOrder: item.sortOrder,
            options: {
              create: item.options.map((o) => ({
                optionId: o.optionId,
                costDelta: o.costDelta,
                priceDelta: o.priceDelta,
              })),
            },
            bomLines: {
              create: item.bomLines.map((b) => ({
                materialId: b.materialId,
                description: b.description,
                quantity: b.quantity,
                unit: b.unit,
                unitCost: b.unitCost,
                scrapPct: b.scrapPct,
                lineCost: b.lineCost,
                revision: b.revision,
                notes: b.notes,
                sortOrder: b.sortOrder,
              })),
            },
            laborLines: {
              create: item.laborLines.map((l) => ({
                rateId: l.rateId,
                description: l.description,
                hours: l.hours,
                hourlyRate: l.hourlyRate,
                lineCost: l.lineCost,
                sortOrder: l.sortOrder,
              })),
            },
          },
        });
      }

      return copy;
    });

    const quote = await recalcQuote(created.id);
    await audit(req, 'REVISE', 'Quote', quote.id, {
      quoteNo: quote.quoteNo,
      revision: quote.revision,
    });

    res.status(201).json({ ...quote, revisionLabel: revisionLabel(quote.revision) });
  }),
);

/** Guncel fiyatlarla kalem maliyetlerini yeniden hesaplar (hammadde zamlandiginda). */
quotesRouter.post(
  '/:id/reprice',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const quote = await prisma.quote.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { items: { include: { options: { include: { option: true } } } } },
    });

    if (quote.status === QuoteStatus.KABUL_EDILDI || quote.status === QuoteStatus.REVIZE_EDILDI) {
      throw conflict('Kilitli teklifin fiyatlari guncellenemez.');
    }

    for (const item of quote.items) {
      if (!item.productId) continue;
      const priced = await priceItem({
        productId: item.productId,
        selectedOptions: item.options.map((o) => o.option.code),
        quantity: item.quantity,
        policyId: quote.policyId,
        unitPrice: item.unitPrice,
        discountPct: item.discountPct,
      });

      await prisma.quoteItem.update({
        where: { id: item.id },
        data: {
          unitCost: priced.unitCost,
          lineCost: priced.lineCost,
          marginPct: marginPct(item.lineTotal, priced.lineCost),
        },
      });
    }

    const updated = await recalcQuote(req.params.id);
    await audit(req, 'REPRICE', 'Quote', updated.id);
    res.json(updated);
  }),
);

// ---------------------------------------------------------------------------
// Durum akisi ve onay
// ---------------------------------------------------------------------------

quotesRouter.patch(
  '/:id/status',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.nativeEnum(QuoteStatus) }).parse(req.body);
    const quote = await prisma.quote.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { policy: true, items: true },
    });

    // Musteriye baglayici olan her gecis onaydan gecmelidir. Yalnizca
    // "Gonderildi" denetlenirse, teklif dogrudan "Kabul Edildi" yapilarak
    // iskonto limiti tamamen atlanabilir.
    const bindingTransition =
      status === QuoteStatus.GONDERILDI || status === QuoteStatus.KABUL_EDILDI;

    if (bindingTransition) {
      if (quote.items.length === 0) throw badRequest('Kalemi olmayan teklif gonderilemez.');

      // Yetki disi iskonto ya da dusuk marj varsa once onaya duser.
      // Kalem bazli iskontolari da kapsayan efektif oran kullanilir.
      const check = needsApproval({
        discountPct: effectiveDiscountPct(quote.items, quote.totalPrice),
        marginPct: quote.marginPct,
        userMaxDiscountPct: req.user!.maxDiscountPct,
        minMarginPct: quote.policy?.minMarginPct ?? 12,
      });

      if (check.required && !quote.approvedById && !req.user!.isAdmin) {
        const pending = await prisma.quote.update({
          where: { id: req.params.id },
          data: { status: QuoteStatus.ONAY_BEKLIYOR, approvalNote: check.reason },
        });
        await audit(req, 'APPROVAL_REQUIRED', 'Quote', pending.id, {
          reason: check.reason,
          requestedStatus: status,
        });
        res.status(202).json({
          quote: pending,
          message: `Teklif onaya gonderildi. ${check.reason}`,
        });
        return;
      }
    }

    const updated = await prisma.quote.update({
      where: { id: req.params.id },
      data: {
        status,
        ...(status === QuoteStatus.GONDERILDI ? { sentAt: new Date() } : {}),
        ...(status === QuoteStatus.KABUL_EDILDI || status === QuoteStatus.REDDEDILDI
          ? { decidedAt: new Date() }
          : {}),
      },
    });

    await audit(req, 'STATUS_CHANGE', 'Quote', updated.id, { status });
    res.json({ quote: updated });
  }),
);

quotesRouter.post(
  '/:id/approve',
  requirePermission(MODULE, 'approve'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.quote.findUniqueOrThrow({
      where: { id: req.params.id },
      select: { id: true, status: true, createdById: true, approvalNote: true },
    });

    // Onay yalnizca onaya dusmus bir teklif icin anlamlidir; aksi halde
    // "onayla" ucu, durum akisini atlamanin kestirme yolu olur.
    if (existing.status !== QuoteStatus.ONAY_BEKLIYOR) {
      throw conflict('Yalnizca "Onay Bekliyor" durumundaki teklifler onaylanabilir.');
    }

    // Gorevler ayriligi: kendi teklifini onaylamak limiti anlamsiz kilar.
    if (existing.createdById === req.user!.id && !req.user!.isAdmin) {
      throw forbidden('Kendi hazirladiginiz teklifi onaylayamazsiniz. Baska bir onaycıya iletin.');
    }

    const quote = await prisma.quote.update({
      where: { id: req.params.id },
      data: {
        status: QuoteStatus.GONDERILDI,
        approvedById: req.user!.id,
        approvedAt: new Date(),
        sentAt: new Date(),
      },
    });
    await audit(req, 'APPROVE', 'Quote', quote.id, { reason: existing.approvalNote });
    res.json(quote);
  }),
);

quotesRouter.delete(
  '/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.count({ where: { quoteId: req.params.id } });
    if (orders > 0) throw badRequest('Siparise donusmus teklif silinemez.');
    await prisma.quote.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'Quote', req.params.id);
    res.json({ message: 'Teklif silindi.' });
  }),
);

// ---------------------------------------------------------------------------
// Siparise donusturme
// ---------------------------------------------------------------------------

quotesRouter.post(
  '/:id/convert-to-order',
  requirePermission(MODULE, 'approve'),
  asyncHandler(async (req, res) => {
    const { customerPoNo, promisedDate } = z
      .object({ customerPoNo: nullableString, promisedDate: z.coerce.date().optional().nullable() })
      .parse(req.body);

    const quote = await prisma.quote.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { items: true },
    });

    if (quote.status !== QuoteStatus.KABUL_EDILDI) {
      throw badRequest('Yalnizca "Kabul Edildi" durumundaki teklifler siparise donusturulebilir.');
    }

    const existing = await prisma.order.findFirst({ where: { quoteId: quote.id } });
    if (existing) throw conflict(`Bu teklif zaten ${existing.orderNo} numarali siparise donusturulmus.`);

    const rows = await prisma.order.findMany({ select: { orderNo: true } });

    const order = await prisma.order.create({
      data: {
        orderNo: nextSequence('SPR', rows.map((r) => r.orderNo)),
        customerId: quote.customerId,
        quoteId: quote.id,
        opportunityId: quote.opportunityId,
        currency: quote.currency,
        totalAmount: quote.totalPrice,
        customerPoNo,
        promisedDate:
          promisedDate ??
          // Teklifteki termin gunu kadar ileri bir tarih varsayilan olur.
          (quote.leadTimeDays
            ? new Date(Date.now() + quote.leadTimeDays * 86_400_000)
            : null),
        deliveryTerms: quote.deliveryTerms,
        paymentTerms: quote.paymentTerms,
        createdById: req.user!.id,
        items: {
          create: quote.items.map((i) => ({
            productId: i.productId,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal,
            configSnapshot: i.configSnapshot ?? undefined,
            sortOrder: i.sortOrder,
          })),
        },
        history: { create: { toStatus: 'ONAY_BEKLIYOR', note: `${quote.quoteNo} teklifinden olusturuldu.` } },
      },
      include: { items: true },
    });

    await audit(req, 'CONVERT', 'Quote', quote.id, { orderNo: order.orderNo });
    res.status(201).json(order);
  }),
);
