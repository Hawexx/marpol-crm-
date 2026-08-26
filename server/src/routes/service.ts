import { Router } from 'express';
import { z } from 'zod';
import { AssetStatus, Criticality, ModuleKey, TicketStatus, TicketType } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, nextSequence, listLimit } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const serviceRouter = Router();

const MODULE = ModuleKey.SAHA_SERVIS;

serviceRouter.use(requireAuth);

const nullableString = z.string().trim().optional().nullable();

// ---------------------------------------------------------------------------
// Sahadaki varliklar - teslim edilen makine/sistem
// ---------------------------------------------------------------------------

const assetBase = {
  serialNo: z.string().min(1, 'Seri no zorunludur.'),
  customerId: z.string().uuid('Musteri secilmelidir.'),
  orderId: z.string().uuid().optional().nullable(),
  orderItemId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  name: z.string().min(2, 'Varlik adi zorunludur.'),
  location: nullableString,
  installedAt: z.coerce.date().optional().nullable(),
  commissionedAt: z.coerce.date().optional().nullable(),
  warrantyStart: z.coerce.date().optional().nullable(),
  warrantyEnd: z.coerce.date().optional().nullable(),
  status: z.nativeEnum(AssetStatus).default(AssetStatus.CALISIYOR),
  maintenanceIntervalMonths: z.number().int().positive().optional().nullable(),
  lastServiceAt: z.coerce.date().optional().nullable(),
  nextServiceAt: z.coerce.date().optional().nullable(),
  notes: nullableString,
};

/** Bakim araligi verilmisse bir sonraki bakim tarihini hesaplar. */
function computeNextService(
  lastServiceAt: Date | null | undefined,
  intervalMonths: number | null | undefined,
  fallback: Date | null | undefined,
): Date | null {
  if (!intervalMonths) return fallback ?? null;
  const base = lastServiceAt ?? fallback;
  if (!base) return null;
  const next = new Date(base);
  next.setMonth(next.getMonth() + intervalMonths);
  return next;
}

serviceRouter.get(
  '/assets',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    res.json(
      await prisma.installedAsset.findMany({
        where: {
          ...(req.query.customerId ? { customerId: String(req.query.customerId) } : {}),
          ...(q
            ? {
                OR: [
                  { serialNo: { contains: q, mode: 'insensitive' } },
                  { name: { contains: q, mode: 'insensitive' } },
                  { location: { contains: q, mode: 'insensitive' } },
                  { customer: { name: { contains: q, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        include: {
          customer: { select: { id: true, code: true, name: true } },
          product: { select: { id: true, code: true, name: true } },
          _count: { select: { tickets: true } },
        },
        orderBy: { installedAt: 'desc' },
      }),
    );
  }),
);

serviceRouter.post(
  '/assets',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = z.object(assetBase).parse(req.body);
    const asset = await prisma.installedAsset.create({
      data: {
        ...data,
        nextServiceAt: computeNextService(
          data.lastServiceAt,
          data.maintenanceIntervalMonths,
          data.commissionedAt ?? data.installedAt,
        ),
      },
    });
    await audit(req, 'CREATE', 'InstalledAsset', asset.id, { serialNo: asset.serialNo });
    res.status(201).json(asset);
  }),
);

serviceRouter.put(
  '/assets/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = z.object(assetBase).partial().parse(req.body);
    const existing = await prisma.installedAsset.findUniqueOrThrow({ where: { id: req.params.id } });

    const asset = await prisma.installedAsset.update({
      where: { id: req.params.id },
      data: {
        ...data,
        nextServiceAt: computeNextService(
          data.lastServiceAt ?? existing.lastServiceAt,
          data.maintenanceIntervalMonths ?? existing.maintenanceIntervalMonths,
          data.commissionedAt ?? existing.commissionedAt ?? existing.installedAt,
        ),
      },
    });

    await audit(req, 'UPDATE', 'InstalledAsset', asset.id, data);
    res.json(asset);
  }),
);

serviceRouter.delete(
  '/assets/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.installedAsset.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'InstalledAsset', req.params.id);
    res.json({ message: 'Varlik silindi.' });
  }),
);

/** Bakimi yaklasan / gecmis varliklar - proaktif servis satisi icin. */
serviceRouter.get(
  '/assets/due',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const days = Number(req.query.days ?? 30);
    res.json(
      await prisma.installedAsset.findMany({
        where: {
          nextServiceAt: { lte: new Date(Date.now() + days * 86_400_000) },
          status: { not: AssetStatus.HIZMET_DISI },
        },
        include: { customer: { select: { id: true, code: true, name: true } } },
        orderBy: { nextServiceAt: 'asc' },
      }),
    );
  }),
);

// ---------------------------------------------------------------------------
// Servis kayitlari (ticket)
// ---------------------------------------------------------------------------

const ticketBase = {
  customerId: z.string().uuid('Musteri secilmelidir.'),
  assetId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
  type: z.nativeEnum(TicketType).default(TicketType.ARIZA),
  priority: z.nativeEnum(Criticality).default(Criticality.ORTA),
  subject: z.string().min(2, 'Konu zorunludur.'),
  description: nullableString,
  isWarranty: z.boolean().default(false),
  slaHours: z.number().int().positive().optional().nullable(),
  dueAt: z.coerce.date().optional().nullable(),
  assigneeId: z.string().uuid().optional().nullable(),
};

serviceRouter.get(
  '/tickets',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const status = req.query.status ? String(req.query.status).split(',') : undefined;

    res.json(
      await prisma.serviceTicket.findMany({
        where: {
          ...(status ? { status: { in: status as TicketStatus[] } } : {}),
          ...(req.query.open === 'true'
            ? { status: { notIn: [TicketStatus.COZULDU, TicketStatus.KAPANDI] } }
            : {}),
          ...(req.query.customerId ? { customerId: String(req.query.customerId) } : {}),
          ...(q
            ? {
                OR: [
                  { ticketNo: { contains: q, mode: 'insensitive' } },
                  { subject: { contains: q, mode: 'insensitive' } },
                  { customer: { name: { contains: q, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        include: {
          customer: { select: { id: true, code: true, name: true } },
          asset: { select: { id: true, serialNo: true, name: true } },
          assignee: { select: { id: true, fullName: true } },
          _count: { select: { visits: true } },
        },
        orderBy: [{ status: 'asc' }, { priority: 'desc' }, { openedAt: 'desc' }],
        take: listLimit(req.query.limit),
      }),
    );
  }),
);

serviceRouter.get(
  '/tickets/:id',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.serviceTicket.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
          customer: { select: { id: true, code: true, name: true, phone: true } },
          asset: true,
          contact: { select: { id: true, fullName: true, phone: true, email: true } },
          order: { select: { id: true, orderNo: true } },
          assignee: { select: { id: true, fullName: true } },
          visits: {
            orderBy: { plannedAt: 'desc' },
            include: {
              technician: { select: { id: true, fullName: true } },
              rate: true,
              parts: { include: { material: { select: { id: true, code: true, name: true } } } },
            },
          },
        },
      }),
    );
  }),
);

serviceRouter.post(
  '/tickets',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = z.object(ticketBase).parse(req.body);
    const rows = await prisma.serviceTicket.findMany({ select: { ticketNo: true } });

    const ticket = await prisma.serviceTicket.create({
      data: {
        ...data,
        ticketNo: nextSequence('SRV', rows.map((r) => r.ticketNo)),
        // SLA saati verilmisse termin otomatik hesaplanir.
        dueAt: data.dueAt ?? (data.slaHours ? new Date(Date.now() + data.slaHours * 3_600_000) : null),
        status: data.assigneeId ? TicketStatus.ATANDI : TicketStatus.ACIK,
      },
      include: { customer: { select: { id: true, name: true } } },
    });

    await audit(req, 'CREATE', 'ServiceTicket', ticket.id, { ticketNo: ticket.ticketNo });
    res.status(201).json(ticket);
  }),
);

serviceRouter.put(
  '/tickets/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = z
      .object({ ...ticketBase, resolution: nullableString })
      .partial()
      .parse(req.body);
    const ticket = await prisma.serviceTicket.update({ where: { id: req.params.id }, data });
    await audit(req, 'UPDATE', 'ServiceTicket', ticket.id, data);
    res.json(ticket);
  }),
);

serviceRouter.patch(
  '/tickets/:id/status',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const { status, resolution } = z
      .object({ status: z.nativeEnum(TicketStatus), resolution: nullableString })
      .parse(req.body);

    const closed = status === TicketStatus.COZULDU || status === TicketStatus.KAPANDI;

    const ticket = await prisma.serviceTicket.update({
      where: { id: req.params.id },
      data: { status, resolution, closedAt: closed ? new Date() : null },
    });

    // Periyodik bakim kapandiginda varligin bakim takvimi ilerletilir.
    if (closed && ticket.assetId && ticket.type === TicketType.PERIYODIK_BAKIM) {
      const asset = await prisma.installedAsset.findUnique({ where: { id: ticket.assetId } });
      if (asset) {
        await prisma.installedAsset.update({
          where: { id: asset.id },
          data: {
            lastServiceAt: new Date(),
            nextServiceAt: computeNextService(new Date(), asset.maintenanceIntervalMonths, new Date()),
          },
        });
      }
    }

    await audit(req, 'STATUS_CHANGE', 'ServiceTicket', ticket.id, { status });
    res.json(ticket);
  }),
);

serviceRouter.delete(
  '/tickets/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.serviceTicket.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'ServiceTicket', req.params.id);
    res.json({ message: 'Servis kaydi silindi.' });
  }),
);

// ---------------------------------------------------------------------------
// Saha ziyaretleri ve kullanilan parcalar
// ---------------------------------------------------------------------------

const visitSchema = z.object({
  technicianId: z.string().uuid().optional().nullable(),
  rateId: z.string().uuid().optional().nullable(),
  plannedAt: z.coerce.date().optional().nullable(),
  startedAt: z.coerce.date().optional().nullable(),
  endedAt: z.coerce.date().optional().nullable(),
  workDone: nullableString,
  travelKm: z.number().nonnegative().default(0),
  laborHours: z.number().nonnegative().default(0),
  billable: z.boolean().default(true),
  customerSignedBy: nullableString,
  notes: nullableString,
});

/** Ziyaretin toplam maliyetini isçilik + parça üzerinden yeniden hesaplar. */
async function recalcVisit(visitId: string) {
  const visit = await prisma.serviceVisit.findUniqueOrThrow({
    where: { id: visitId },
    include: { rate: true, parts: true },
  });

  const laborCost = visit.laborHours * (visit.rate?.hourlyRate ?? 0);
  const partsCost = visit.parts.reduce((sum, p) => sum + p.lineTotal, 0);

  return prisma.serviceVisit.update({
    where: { id: visitId },
    data: { totalCost: Math.round((laborCost + partsCost) * 100) / 100 },
  });
}

serviceRouter.post(
  '/tickets/:id/visits',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = visitSchema.parse(req.body);
    const visit = await prisma.serviceVisit.create({
      data: { ...data, ticketId: req.params.id },
    });
    const withCost = await recalcVisit(visit.id);
    await audit(req, 'CREATE', 'ServiceVisit', visit.id);
    res.status(201).json(withCost);
  }),
);

serviceRouter.put(
  '/visits/:visitId',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = visitSchema.partial().parse(req.body);
    await prisma.serviceVisit.update({ where: { id: req.params.visitId }, data });
    const visit = await recalcVisit(req.params.visitId);
    await audit(req, 'UPDATE', 'ServiceVisit', visit.id, data);
    res.json(visit);
  }),
);

serviceRouter.delete(
  '/visits/:visitId',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.serviceVisit.delete({ where: { id: req.params.visitId } });
    await audit(req, 'DELETE', 'ServiceVisit', req.params.visitId);
    res.json({ message: 'Ziyaret silindi.' });
  }),
);

const partSchema = z.object({
  materialId: z.string().uuid().optional().nullable(),
  description: z.string().min(1, 'Parca aciklamasi zorunludur.'),
  quantity: z.number().positive().default(1),
  unit: z.string().default('adet'),
  unitPrice: z.number().nonnegative().default(0),
});

serviceRouter.post(
  '/visits/:visitId/parts',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = partSchema.parse(req.body);

    // Malzeme secilmis ve fiyat girilmemisse guncel hammadde fiyati kullanilir.
    let unitPrice = data.unitPrice;
    if (data.materialId && !unitPrice) {
      const material = await prisma.material.findUnique({ where: { id: data.materialId } });
      unitPrice = material?.currentPrice ?? 0;
    }

    const part = await prisma.servicePart.create({
      data: {
        ...data,
        visitId: req.params.visitId,
        unitPrice,
        lineTotal: Math.round(data.quantity * unitPrice * 100) / 100,
      },
    });

    await recalcVisit(req.params.visitId);
    await audit(req, 'CREATE', 'ServicePart', part.id, data);
    res.status(201).json(part);
  }),
);

serviceRouter.delete(
  '/parts/:partId',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    const part = await prisma.servicePart.delete({ where: { id: req.params.partId } });
    await recalcVisit(part.visitId);
    await audit(req, 'DELETE', 'ServicePart', req.params.partId);
    res.json({ message: 'Parca silindi.' });
  }),
);

/** Saha servis ozeti - gosterge paneli. */
serviceRouter.get(
  '/summary',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (_req, res) => {
    const [byStatus, open, overdue, assets, dueSoon] = await Promise.all([
      prisma.serviceTicket.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.serviceTicket.count({
        where: { status: { notIn: [TicketStatus.COZULDU, TicketStatus.KAPANDI] } },
      }),
      prisma.serviceTicket.count({
        where: {
          dueAt: { lt: new Date() },
          status: { notIn: [TicketStatus.COZULDU, TicketStatus.KAPANDI] },
        },
      }),
      prisma.installedAsset.count(),
      prisma.installedAsset.count({
        where: { nextServiceAt: { lte: new Date(Date.now() + 30 * 86_400_000) } },
      }),
    ]);

    res.json({
      open,
      overdue,
      assets,
      dueSoon,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
    });
  }),
);
