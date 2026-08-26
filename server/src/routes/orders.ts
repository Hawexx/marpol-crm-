import { Router } from 'express';
import { z } from 'zod';
import { HandoverStatus, ModuleKey, OrderStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, badRequest, nextSequence, listLimit } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  ErpUnavailableError,
  checkErpConnection,
  fetchProductionStatus,
  searchProductionOrders,
} from '../services/erp.js';

export const ordersRouter = Router();

const MODULE = ModuleKey.SIPARISLER;

ordersRouter.use(requireAuth);

const nullableString = z.string().trim().optional().nullable();

const orderInclude = {
  customer: { select: { id: true, code: true, name: true, phone: true, email: true } },
  quote: { select: { id: true, quoteNo: true, revision: true, title: true } },
  opportunity: { select: { id: true, code: true, title: true } },
  createdBy: { select: { id: true, fullName: true } },
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      product: { select: { id: true, code: true, name: true } },
      erpLink: true,
    },
  },
  history: { orderBy: { changedAt: 'desc' as const } },
  handovers: {
    orderBy: { createdAt: 'desc' as const },
    include: { createdBy: { select: { id: true, fullName: true } } },
  },
};

ordersRouter.get(
  '/',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const status = req.query.status ? String(req.query.status).split(',') : undefined;

    res.json(
      await prisma.order.findMany({
        where: {
          ...(status ? { status: { in: status as OrderStatus[] } } : {}),
          ...(req.query.customerId ? { customerId: String(req.query.customerId) } : {}),
          ...(q
            ? {
                OR: [
                  { orderNo: { contains: q, mode: 'insensitive' } },
                  { customerPoNo: { contains: q, mode: 'insensitive' } },
                  { customer: { name: { contains: q, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        include: {
          customer: { select: { id: true, code: true, name: true } },
          items: { select: { id: true, erpLink: true } },
          _count: { select: { items: true } },
        },
        orderBy: [{ orderDate: 'desc' }],
        take: listLimit(req.query.limit),
      }),
    );
  }),
);

ordersRouter.get(
  '/:id',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.order.findUniqueOrThrow({ where: { id: req.params.id }, include: orderInclude }),
    );
  }),
);

const orderBase = {
  customerId: z.string().uuid(),
  quoteId: z.string().uuid().optional().nullable(),
  opportunityId: z.string().uuid().optional().nullable(),
  promisedDate: z.coerce.date().optional().nullable(),
  currency: z.string().default('TRY'),
  customerPoNo: nullableString,
  deliveryTerms: nullableString,
  paymentTerms: nullableString,
  notes: nullableString,
};

ordersRouter.post(
  '/',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = z.object(orderBase).parse(req.body);
    const rows = await prisma.order.findMany({ select: { orderNo: true } });

    const order = await prisma.order.create({
      data: {
        ...data,
        orderNo: nextSequence('SPR', rows.map((r) => r.orderNo)),
        createdById: req.user!.id,
        history: { create: { toStatus: OrderStatus.ONAY_BEKLIYOR, note: 'Siparis olusturuldu.' } },
      },
      include: orderInclude,
    });

    await audit(req, 'CREATE', 'Order', order.id, { orderNo: order.orderNo });
    res.status(201).json(order);
  }),
);

ordersRouter.put(
  '/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = z.object(orderBase).partial().parse(req.body);
    const order = await prisma.order.update({ where: { id: req.params.id }, data });
    await audit(req, 'UPDATE', 'Order', order.id, data);
    res.json(order);
  }),
);

/**
 * Durum degisikligi. Siparis "Onaylandi"ya gectiginde BOM otomatik olarak
 * muhendislige aktarim kaydina donusur (PLM baglantisi).
 */
ordersRouter.patch(
  '/:id/status',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const { status, note } = z
      .object({ status: z.nativeEnum(OrderStatus), note: nullableString })
      .parse(req.body);

    const current = await prisma.order.findUniqueOrThrow({ where: { id: req.params.id } });

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        status,
        ...(status === OrderStatus.TESLIM_EDILDI ? { deliveredAt: new Date() } : {}),
        history: { create: { fromStatus: current.status, toStatus: status, note } },
      },
    });

    if (status === OrderStatus.ONAYLANDI) {
      await createHandover(req.params.id, req.user!.id);
    }

    await audit(req, 'STATUS_CHANGE', 'Order', order.id, { from: current.status, to: status });
    res.json(order);
  }),
);

ordersRouter.delete(
  '/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.order.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'Order', req.params.id);
    res.json({ message: 'Siparis silindi.' });
  }),
);

// ---------------------------------------------------------------------------
// Muhendislige aktarim (PLM)
// ---------------------------------------------------------------------------

/**
 * Siparisin kalemlerine bagli teklif BOM'unu toplayip mühendisliğe
 * aktarım kaydı olusturur. Aktarim aninda BOM dondurulur (snapshot),
 * boylece sonradan degisen hammadde fiyatlari uretim listesini bozmaz.
 */
async function createHandover(orderId: string, userId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true, quote: { include: { items: { include: { bomLines: true, laborLines: { include: { rate: true } } } } } } },
  });

  // Ayni siparis icin bekleyen aktarim varsa tekrar olusturma.
  const pending = await prisma.engineeringHandover.findFirst({
    where: { orderId, status: { in: [HandoverStatus.BEKLIYOR, HandoverStatus.GONDERILDI] } },
  });
  if (pending) return pending;

  const snapshot = {
    orderNo: order.orderNo,
    generatedAt: new Date().toISOString(),
    items: (order.quote?.items ?? []).map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      configuration: item.configSnapshot,
      bom: item.bomLines.map((b) => ({
        description: b.description,
        quantity: b.quantity,
        unit: b.unit,
        revision: b.revision,
      })),
      labor: item.laborLines.map((l) => ({
        description: l.description ?? l.rate.name,
        kind: l.rate.kind,
        hours: l.hours,
      })),
    })),
  };

  return prisma.engineeringHandover.create({
    data: {
      orderId,
      status: HandoverStatus.BEKLIYOR,
      bomSnapshot: snapshot,
      createdById: userId,
      note: 'Siparis onaylandi, malzeme listesi muhendislige hazir.',
    },
  });
}

ordersRouter.post(
  '/:id/handover',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const handover = await createHandover(req.params.id, req.user!.id);
    await audit(req, 'HANDOVER', 'Order', req.params.id, { handoverId: handover.id });
    res.status(201).json(handover);
  }),
);

ordersRouter.patch(
  '/handovers/:handoverId',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const { status, responseNote, erpReference } = z
      .object({
        status: z.nativeEnum(HandoverStatus),
        responseNote: nullableString,
        erpReference: nullableString,
      })
      .parse(req.body);

    const handover = await prisma.engineeringHandover.update({
      where: { id: req.params.handoverId },
      data: {
        status,
        responseNote,
        erpReference,
        ...(status === HandoverStatus.GONDERILDI ? { sentAt: new Date() } : {}),
      },
    });

    await audit(req, 'HANDOVER_STATUS', 'EngineeringHandover', handover.id, { status });
    res.json(handover);
  }),
);

// ---------------------------------------------------------------------------
// ERP (Marpol PPM) - uretim durumu gorunurlugu
// ---------------------------------------------------------------------------

/** Baglanti sagligi - gosterge panelinde rozet olarak gosterilir. */
ordersRouter.get(
  '/erp/status',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (_req, res) => {
    res.json(await checkErpConnection());
  }),
);

/** Siparis kalemini uretim emrine baglarken kullanilan arama. */
ordersRouter.get(
  '/erp/search',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    try {
      res.json(await searchProductionOrders(String(req.query.q ?? '')));
    } catch (err) {
      if (err instanceof ErpUnavailableError) {
        res.status(503).json({ error: err.message });
        return;
      }
      throw err;
    }
  }),
);

/** Siparis kalemini PPM'deki uretim emrine baglar. */
ordersRouter.post(
  '/items/:itemId/erp-link',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const { erpOrderNo } = z.object({ erpOrderNo: z.string().min(1) }).parse(req.body);

    const link = await prisma.erpLink.upsert({
      where: { orderItemId: req.params.itemId },
      create: { orderItemId: req.params.itemId, erpOrderNo },
      update: { erpOrderNo, lastSyncError: null },
    });

    await audit(req, 'ERP_LINK', 'OrderItem', req.params.itemId, { erpOrderNo });
    res.status(201).json(link);
  }),
);

ordersRouter.delete(
  '/items/:itemId/erp-link',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    await prisma.erpLink.delete({ where: { orderItemId: req.params.itemId } });
    await audit(req, 'ERP_UNLINK', 'OrderItem', req.params.itemId);
    res.json({ message: 'ERP baglantisi kaldirildi.' });
  }),
);

/**
 * Siparisin tum kalemleri icin PPM'den guncel uretim durumunu ceker.
 * PPM kapaliysa hata firlatilmaz; her kaleme "baglanti yok" notu yazilir,
 * boylece satis ekrani calismaya devam eder.
 */
ordersRouter.post(
  '/:id/erp-sync',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const links = await prisma.erpLink.findMany({
      where: { orderItem: { orderId: req.params.id }, erpOrderNo: { not: null } },
    });

    if (links.length === 0) {
      throw badRequest('Bu siparisin hicbir kalemi bir uretim emrine bagli degil.');
    }

    const results: { erpOrderNo: string; ok: boolean; message: string }[] = [];

    for (const link of links) {
      const erpOrderNo = link.erpOrderNo as string;
      try {
        const status = await fetchProductionStatus(erpOrderNo);
        await prisma.erpLink.update({
          where: { id: link.id },
          data: {
            erpOrderId: status.erpOrderId,
            erpStatus: status.erpStatus,
            currentStep: status.currentStep,
            progressPct: status.progressPct,
            producedQty: status.producedQty,
            erpDeadline: status.erpDeadline ? new Date(status.erpDeadline) : null,
            lastSyncedAt: new Date(),
            lastSyncError: null,
            raw: status.raw as object,
          },
        });
        results.push({
          erpOrderNo,
          ok: true,
          message: `${status.erpStatus} - %${status.progressPct}${status.currentStep ? ` (${status.currentStep})` : ''}`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Bilinmeyen hata.';
        await prisma.erpLink.update({
          where: { id: link.id },
          data: { lastSyncedAt: new Date(), lastSyncError: message },
        });
        results.push({ erpOrderNo, ok: false, message });
      }
    }

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: req.params.id },
      include: orderInclude,
    });

    await audit(req, 'ERP_SYNC', 'Order', req.params.id, { results });
    res.json({ order, results });
  }),
);

/** Siparis ozeti - gosterge paneli KPI'lari. */
ordersRouter.get(
  '/summary/kpi',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (_req, res) => {
    const [byStatus, total, late, revenue] = await Promise.all([
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.order.count(),
      prisma.order.count({
        where: {
          promisedDate: { lt: new Date() },
          status: { notIn: [OrderStatus.TESLIM_EDILDI, OrderStatus.FATURALANDI, OrderStatus.IPTAL] },
        },
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: { not: OrderStatus.IPTAL } },
      }),
    ]);

    res.json({
      total,
      late,
      revenue: revenue._sum.totalAmount ?? 0,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
    });
  }),
);
