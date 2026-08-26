import { Router } from 'express';
import { z } from 'zod';
import { ModuleKey, RateKind } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';

export const pricingRouter = Router();

const MODULE = ModuleKey.FIYATLANDIRMA;
/** Teklif ve urun katalogu da bu tanimlari okur. */
const canRead = requireAnyPermission([MODULE, ModuleKey.TEKLIFLER, ModuleKey.URUN_KATALOGU], 'view');

pricingRouter.use(requireAuth);

const nullableString = z.string().trim().optional().nullable();

// ---------------------------------------------------------------------------
// Hammaddeler - guncel fiyatlar dogrudan maliyet hesabina girer
// ---------------------------------------------------------------------------

const materialSchema = z.object({
  code: z.string().min(1, 'Malzeme kodu zorunludur.'),
  name: z.string().min(2, 'Malzeme adi zorunludur.'),
  category: nullableString,
  unit: z.string().default('kg'),
  currentPrice: z.number().nonnegative().default(0),
  currency: z.string().default('TRY'),
  scrapPct: z.number().min(0).max(100).default(0),
  supplier: nullableString,
  notes: nullableString,
  isActive: z.boolean().default(true),
});

pricingRouter.get(
  '/materials',
  canRead,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    res.json(
      await prisma.material.findMany({
        where: {
          ...(req.query.active === 'true' ? { isActive: true } : {}),
          ...(q
            ? {
                OR: [
                  { code: { contains: q, mode: 'insensitive' } },
                  { name: { contains: q, mode: 'insensitive' } },
                  { category: { contains: q, mode: 'insensitive' } },
                  { supplier: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { code: 'asc' },
      }),
    );
  }),
);

pricingRouter.get(
  '/materials/:id/history',
  canRead,
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.materialPriceHistory.findMany({
        where: { materialId: req.params.id },
        orderBy: { validFrom: 'desc' },
        take: 50,
      }),
    );
  }),
);

pricingRouter.post(
  '/materials',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = materialSchema.parse(req.body);
    const material = await prisma.material.create({
      data: {
        ...data,
        // Ilk fiyat da gecmise yazilir; boylece fiyat serisi bastan tutulur.
        priceHistory: { create: { price: data.currentPrice, currency: data.currency, source: 'Ilk kayit' } },
      },
    });
    await audit(req, 'CREATE', 'Material', material.id, { code: material.code });
    res.status(201).json(material);
  }),
);

pricingRouter.put(
  '/materials/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = materialSchema.partial().parse(req.body);
    const existing = await prisma.material.findUniqueOrThrow({ where: { id: req.params.id } });

    // Fiyat degistiyse gecmise yeni satir eklenir ve guncelleme tarihi damgalanir.
    const priceChanged =
      data.currentPrice !== undefined && data.currentPrice !== existing.currentPrice;

    const material = await prisma.material.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(priceChanged
          ? {
              priceUpdatedAt: new Date(),
              priceHistory: {
                create: {
                  price: data.currentPrice as number,
                  currency: data.currency ?? existing.currency,
                  source: 'Elle guncelleme',
                },
              },
            }
          : {}),
      },
    });

    await audit(req, 'UPDATE', 'Material', material.id, data);
    res.json(material);
  }),
);

pricingRouter.delete(
  '/materials/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.material.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'Material', req.params.id);
    res.json({ message: 'Malzeme silindi.' });
  }),
);

// ---------------------------------------------------------------------------
// Iscilik / muhendislik saatlik ucretleri
// ---------------------------------------------------------------------------

const rateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(2),
  kind: z.nativeEnum(RateKind).default(RateKind.ISCILIK),
  hourlyRate: z.number().nonnegative(),
  currency: z.string().default('TRY'),
  notes: nullableString,
  isActive: z.boolean().default(true),
});

pricingRouter.get(
  '/rates',
  canRead,
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.laborRate.findMany({
        where: {
          ...(req.query.active === 'true' ? { isActive: true } : {}),
          ...(req.query.kind ? { kind: String(req.query.kind) as RateKind } : {}),
        },
        orderBy: [{ kind: 'asc' }, { code: 'asc' }],
      }),
    );
  }),
);

pricingRouter.post(
  '/rates',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = rateSchema.parse(req.body);
    const rate = await prisma.laborRate.create({ data });
    await audit(req, 'CREATE', 'LaborRate', rate.id, data);
    res.status(201).json(rate);
  }),
);

pricingRouter.put(
  '/rates/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = rateSchema.partial().parse(req.body);
    const rate = await prisma.laborRate.update({ where: { id: req.params.id }, data });
    await audit(req, 'UPDATE', 'LaborRate', rate.id, data);
    res.json(rate);
  }),
);

pricingRouter.delete(
  '/rates/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.laborRate.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'LaborRate', req.params.id);
    res.json({ message: 'Ucret tanimi silindi.' });
  }),
);

// ---------------------------------------------------------------------------
// Fiyat politikalari - yukler ve hedef marj
// ---------------------------------------------------------------------------

const policySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(2),
  overheadPct: z.number().min(0).max(200).default(12),
  engineeringPct: z.number().min(0).max(200).default(8),
  contingencyPct: z.number().min(0).max(200).default(5),
  targetMarginPct: z.number().min(0).max(95).default(25),
  minMarginPct: z.number().min(0).max(95).default(12),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  notes: nullableString,
});

pricingRouter.get(
  '/policies',
  canRead,
  asyncHandler(async (_req, res) => {
    res.json(await prisma.pricingPolicy.findMany({ orderBy: { code: 'asc' } }));
  }),
);

pricingRouter.post(
  '/policies',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = policySchema.parse(req.body);
    const policy = await prisma.$transaction(async (tx) => {
      // Sistemde tek bir varsayilan politika olur.
      if (data.isDefault) await tx.pricingPolicy.updateMany({ data: { isDefault: false } });
      return tx.pricingPolicy.create({ data });
    });
    await audit(req, 'CREATE', 'PricingPolicy', policy.id, data);
    res.status(201).json(policy);
  }),
);

pricingRouter.put(
  '/policies/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = policySchema.partial().parse(req.body);
    const policy = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.pricingPolicy.updateMany({ data: { isDefault: false } });
      return tx.pricingPolicy.update({ where: { id: req.params.id }, data });
    });
    await audit(req, 'UPDATE', 'PricingPolicy', policy.id, data);
    res.json(policy);
  }),
);

pricingRouter.delete(
  '/policies/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.pricingPolicy.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'PricingPolicy', req.params.id);
    res.json({ message: 'Fiyat politikasi silindi.' });
  }),
);
