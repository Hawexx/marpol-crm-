import { Router } from 'express';
import { z } from 'zod';
import { ModuleKey, Prisma, RuleSeverity, RuleType } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, badRequest } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { calculateCost, validateConfiguration } from '../services/cpq.js';

export const catalogRouter = Router();

const MODULE = ModuleKey.URUN_KATALOGU;
/** Teklif hazirlarken de urun/konfigurator okunur. */
const canRead = requireAnyPermission([MODULE, ModuleKey.TEKLIFLER], 'view');

catalogRouter.use(requireAuth);

const nullableString = z.string().trim().optional().nullable();

const productBase = {
  code: z.string().min(2, 'Urun kodu zorunludur.'),
  name: z.string().min(2, 'Urun adi zorunludur.'),
  family: nullableString,
  description: nullableString,
  unit: z.string().default('adet'),
  isConfigurable: z.boolean().default(true),
  listPrice: z.number().nonnegative().optional().nullable(),
  baseCost: z.number().nonnegative().default(0),
  leadTimeDays: z.number().int().nonnegative().default(30),
  notes: nullableString,
  isActive: z.boolean().default(true),
};

/** Konfigurator agacinin tamami - gruplar, secenekler, kurallar. */
const productInclude = {
  optionGroups: {
    orderBy: { sortOrder: 'asc' as const },
    include: { options: { orderBy: { sortOrder: 'asc' as const } } },
  },
  rules: { orderBy: { code: 'asc' as const } },
  bomLines: { include: { material: true }, orderBy: { sortOrder: 'asc' as const } },
  laborLines: { include: { rate: true }, orderBy: { sortOrder: 'asc' as const } },
};

catalogRouter.get(
  '/products',
  canRead,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    res.json(
      await prisma.product.findMany({
        where: {
          ...(req.query.active === 'true' ? { isActive: true } : {}),
          ...(q
            ? {
                OR: [
                  { code: { contains: q, mode: 'insensitive' } },
                  { name: { contains: q, mode: 'insensitive' } },
                  { family: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        include: { _count: { select: { optionGroups: true, rules: true } } },
        orderBy: { code: 'asc' },
      }),
    );
  }),
);

catalogRouter.get(
  '/products/:id',
  canRead,
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.product.findUniqueOrThrow({
        where: { id: req.params.id },
        include: productInclude,
      }),
    );
  }),
);

catalogRouter.post(
  '/products',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = z.object(productBase).parse(req.body);
    const product = await prisma.product.create({ data });
    await audit(req, 'CREATE', 'Product', product.id, { code: product.code });
    res.status(201).json(product);
  }),
);

catalogRouter.put(
  '/products/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = z.object(productBase).partial().parse(req.body);
    const product = await prisma.product.update({ where: { id: req.params.id }, data });
    await audit(req, 'UPDATE', 'Product', product.id, data);
    res.json(product);
  }),
);

catalogRouter.delete(
  '/products/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    const used = await prisma.quoteItem.count({ where: { productId: req.params.id } });
    if (used > 0) {
      throw badRequest(`Bu urun ${used} teklif kaleminde kullanilmis. Silmek yerine pasife alin.`);
    }
    await prisma.product.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'Product', req.params.id);
    res.json({ message: 'Urun silindi.' });
  }),
);

// ---------------------------------------------------------------------------
// Secenek gruplari ve secenekler
// ---------------------------------------------------------------------------

const groupSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(2),
  isRequired: z.boolean().default(true),
  isMultiple: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  helpText: nullableString,
});

catalogRouter.post(
  '/products/:id/groups',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = groupSchema.parse(req.body);
    const group = await prisma.optionGroup.create({ data: { ...data, productId: req.params.id } });
    await audit(req, 'CREATE', 'OptionGroup', group.id, data);
    res.status(201).json(group);
  }),
);

catalogRouter.put(
  '/groups/:groupId',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = groupSchema.partial().parse(req.body);
    const group = await prisma.optionGroup.update({ where: { id: req.params.groupId }, data });
    await audit(req, 'UPDATE', 'OptionGroup', group.id, data);
    res.json(group);
  }),
);

catalogRouter.delete(
  '/groups/:groupId',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.optionGroup.delete({ where: { id: req.params.groupId } });
    await audit(req, 'DELETE', 'OptionGroup', req.params.groupId);
    res.json({ message: 'Secenek grubu silindi.' });
  }),
);

const optionSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: nullableString,
  costDelta: z.number().default(0),
  priceDelta: z.number().default(0),
  leadTimeDelta: z.number().int().default(0),
  laborHours: z.number().nonnegative().default(0),
  attributes: z.record(z.unknown()).optional().nullable(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

catalogRouter.post(
  '/groups/:groupId/options',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = optionSchema.parse(req.body);
    const option = await prisma.productOption.create({
      data: { ...data, attributes: (data.attributes ?? undefined) as Prisma.InputJsonValue | undefined, groupId: req.params.groupId },
    });
    await audit(req, 'CREATE', 'ProductOption', option.id, data);
    res.status(201).json(option);
  }),
);

catalogRouter.put(
  '/options/:optionId',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = optionSchema.partial().parse(req.body);
    const option = await prisma.productOption.update({
      where: { id: req.params.optionId },
      data: { ...data, attributes: (data.attributes ?? undefined) as Prisma.InputJsonValue | undefined },
    });
    await audit(req, 'UPDATE', 'ProductOption', option.id, data);
    res.json(option);
  }),
);

catalogRouter.delete(
  '/options/:optionId',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.productOption.delete({ where: { id: req.params.optionId } });
    await audit(req, 'DELETE', 'ProductOption', req.params.optionId);
    res.json({ message: 'Secenek silindi.' });
  }),
);

// ---------------------------------------------------------------------------
// Kisitlama kurallari
// ---------------------------------------------------------------------------

const ruleSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(2),
  type: z.nativeEnum(RuleType).default(RuleType.ENGELLER),
  severity: z.nativeEnum(RuleSeverity).default(RuleSeverity.ENGELLE),
  whenOptions: z.array(z.string()).min(1, 'En az bir tetikleyici secenek gerekir.'),
  thenOptions: z.array(z.string()).default([]),
  message: z.string().min(5, 'Kullaniciya gosterilecek aciklama zorunludur.'),
  isActive: z.boolean().default(true),
});

catalogRouter.post(
  '/products/:id/rules',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = ruleSchema.parse(req.body);
    const rule = await prisma.configRule.create({ data: { ...data, productId: req.params.id } });
    await audit(req, 'CREATE', 'ConfigRule', rule.id, data);
    res.status(201).json(rule);
  }),
);

catalogRouter.put(
  '/rules/:ruleId',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = ruleSchema.partial().parse(req.body);
    const rule = await prisma.configRule.update({ where: { id: req.params.ruleId }, data });
    await audit(req, 'UPDATE', 'ConfigRule', rule.id, data);
    res.json(rule);
  }),
);

catalogRouter.delete(
  '/rules/:ruleId',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.configRule.delete({ where: { id: req.params.ruleId } });
    await audit(req, 'DELETE', 'ConfigRule', req.params.ruleId);
    res.json({ message: 'Kural silindi.' });
  }),
);

// ---------------------------------------------------------------------------
// Konfigurator: dogrulama + anlik fiyatlama
// ---------------------------------------------------------------------------

/**
 * Secilen konfigurasyonu kurallara gore denetler ve gecerliyse guncel
 * hammadde/iscilik fiyatlariyla maliyet-fiyat hesaplar.
 *
 * Bu uc satis ekraninda her secim degisiminde cagrilir; teklif kaydedilmeden
 * once satisci hem engelleri hem de kar marjini gorur.
 */
catalogRouter.post(
  '/products/:id/configure',
  canRead,
  asyncHandler(async (req, res) => {
    const { selectedOptions, quantity, policyId } = z
      .object({
        selectedOptions: z.array(z.string()).default([]),
        quantity: z.number().positive().default(1),
        policyId: z.string().uuid().optional().nullable(),
      })
      .parse(req.body);

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: req.params.id },
      include: productInclude,
    });

    const validation = validateConfiguration(
      product.optionGroups,
      product.rules,
      selectedOptions,
    );

    const policy =
      (policyId ? await prisma.pricingPolicy.findUnique({ where: { id: policyId } }) : null) ??
      (await prisma.pricingPolicy.findFirst({ where: { isDefault: true } }));

    if (!policy) {
      throw badRequest('Varsayilan fiyat politikasi tanimli degil. Fiyatlandirma sekmesinden ekleyin.');
    }

    // Secilen seceneklerin tam kayitlari (maliyet/fiyat etkileri icin).
    const chosen = product.optionGroups
      .flatMap((g) => g.options)
      .filter((o) => selectedOptions.includes(o.code));

    // Seceneklerden gelen ek isciligin ucretlendirilecegi varsayilan atolye ucreti.
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
        // Hammadde fiyati anlik okunur - "dinamik maliyet" buradan gelir.
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

    res.json({
      validation,
      cost,
      quantity,
      policy: { id: policy.id, code: policy.code, name: policy.name, minMarginPct: policy.minMarginPct },
      lineCost: Math.round(cost.unitCost * quantity * 100) / 100,
      linePrice: Math.round(cost.suggestedUnitPrice * quantity * 100) / 100,
    });
  }),
);

// ---------------------------------------------------------------------------
// Urunun standart BOM'u ve iscilik satirlari
// ---------------------------------------------------------------------------

const bomSchema = z.object({
  materialId: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  unit: z.string().default('adet'),
  unitCost: z.number().nonnegative().default(0),
  scrapPct: z.number().min(0).max(100).default(0),
  revision: z.string().default('A'),
  notes: nullableString,
  sortOrder: z.number().int().default(0),
});

catalogRouter.post(
  '/products/:id/bom',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = bomSchema.parse(req.body);
    const line = await prisma.bomLine.create({
      data: { ...data, productId: req.params.id, lineCost: data.quantity * data.unitCost },
      include: { material: true },
    });
    await audit(req, 'CREATE', 'BomLine', line.id, data);
    res.status(201).json(line);
  }),
);

catalogRouter.delete(
  '/bom/:lineId',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.bomLine.delete({ where: { id: req.params.lineId } });
    await audit(req, 'DELETE', 'BomLine', req.params.lineId);
    res.json({ message: 'BOM satiri silindi.' });
  }),
);

const laborSchema = z.object({
  rateId: z.string().uuid(),
  description: nullableString,
  hours: z.number().nonnegative().default(0),
  sortOrder: z.number().int().default(0),
});

catalogRouter.post(
  '/products/:id/labor',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = laborSchema.parse(req.body);
    const rate = await prisma.laborRate.findUniqueOrThrow({ where: { id: data.rateId } });
    const line = await prisma.laborLine.create({
      data: {
        ...data,
        productId: req.params.id,
        hourlyRate: rate.hourlyRate,
        lineCost: data.hours * rate.hourlyRate,
      },
      include: { rate: true },
    });
    await audit(req, 'CREATE', 'LaborLine', line.id, data);
    res.status(201).json(line);
  }),
);

catalogRouter.delete(
  '/labor/:lineId',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.laborLine.delete({ where: { id: req.params.lineId } });
    await audit(req, 'DELETE', 'LaborLine', req.params.lineId);
    res.json({ message: 'Iscilik satiri silindi.' });
  }),
);
