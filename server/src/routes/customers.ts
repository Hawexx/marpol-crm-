import { Router } from 'express';
import { z } from 'zod';
import {
  CustomerStatus,
  InteractionType,
  ModuleKey,
  NegotiationStyle,
  PriceSensitivity,
  Sentiment,
  StakeholderDepartment,
  StakeholderRole,
  TaskStatus,
} from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, badRequest, nextSequence, listLimit } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { analyzeBehavior, recommendProducts, type CustomerFacts } from '../services/analytics.js';

export const customersRouter = Router();

const MODULE = ModuleKey.MUSTERILER;

customersRouter.use(requireAuth);

const nullableString = z.string().trim().optional().nullable();

const customerBase = {
  name: z.string().min(2, 'Firma unvani zorunludur.'),
  shortName: nullableString,
  industry: nullableString,
  status: z.nativeEnum(CustomerStatus).default(CustomerStatus.POTANSIYEL),
  phone: nullableString,
  email: z.string().email('Gecerli bir e-posta giriniz.').optional().nullable().or(z.literal('')),
  website: nullableString,
  address: nullableString,
  city: nullableString,
  country: nullableString,
  taxNumber: nullableString,
  taxOffice: nullableString,
  currency: z.string().default('TRY'),
  paymentTerms: nullableString,
  deliveryTerms: nullableString,
  creditLimit: z.number().nonnegative().optional().nullable(),
  standardDiscountPct: z.number().min(0).max(100).default(0),
  negotiationStyle: z.nativeEnum(NegotiationStyle).optional().nullable(),
  priceSensitivity: z.nativeEnum(PriceSensitivity).optional().nullable(),
  notes: nullableString,
  behaviorNotes: nullableString,
  competitors: nullableString,
  ownerId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
};

const createCustomerSchema = z.object(customerBase);
const updateCustomerSchema = z.object(customerBase).partial();

/** Firma kodu otomatik uretilir - MST-0001. */
async function nextCustomerCode(): Promise<string> {
  const rows = await prisma.customer.findMany({ select: { code: true } });
  const max = rows
    .map((r) => Number(r.code.replace('MST-', '')) || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return `MST-${String(max + 1).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Musteri listesi ve karti
// ---------------------------------------------------------------------------

customersRouter.get(
  '/',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const status = req.query.status ? String(req.query.status).split(',') : undefined;

    const customers = await prisma.customer.findMany({
      where: {
        ...(req.query.active === 'true' ? { isActive: true } : {}),
        ...(status ? { status: { in: status as CustomerStatus[] } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { code: { contains: q, mode: 'insensitive' } },
                { shortName: { contains: q, mode: 'insensitive' } },
                { industry: { contains: q, mode: 'insensitive' } },
                { city: { contains: q, mode: 'insensitive' } },
                { contacts: { some: { fullName: { contains: q, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      include: {
        owner: { select: { id: true, fullName: true } },
        contacts: { where: { isPrimary: true }, take: 1 },
        _count: { select: { contacts: true, opportunities: true, orders: true, quotes: true } },
      },
      orderBy: { name: 'asc' },
      take: listLimit(req.query.limit),
    });

    res.json(customers);
  }),
);

/** Musterinin 360 derece gorunumu - tum iliskili kayitlar tek istekte. */
customersRouter.get(
  '/:id',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        owner: { select: { id: true, fullName: true } },
        contacts: {
          orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }],
          include: { reportsTo: { select: { id: true, fullName: true } } },
        },
        interactions: {
          orderBy: { occurredAt: 'desc' },
          take: 50,
          include: {
            contact: { select: { id: true, fullName: true } },
            user: { select: { id: true, fullName: true } },
          },
        },
        tasks: { orderBy: { dueAt: 'asc' }, include: { assignee: { select: { id: true, fullName: true } } } },
        opportunities: { orderBy: { openedAt: 'desc' } },
        quotes: {
          where: { isCurrent: true },
          orderBy: { issuedAt: 'desc' },
          select: {
            id: true, quoteNo: true, revision: true, title: true, status: true,
            totalPrice: true, currency: true, issuedAt: true, validUntil: true,
          },
        },
        orders: {
          orderBy: { orderDate: 'desc' },
          select: {
            id: true, orderNo: true, status: true, orderDate: true,
            promisedDate: true, totalAmount: true, currency: true,
          },
        },
        contracts: { orderBy: { createdAt: 'desc' } },
        assets: { orderBy: { installedAt: 'desc' } },
        tickets: { orderBy: { openedAt: 'desc' }, take: 20 },
        specDocuments: { orderBy: { receivedAt: 'desc' } },
      },
    });

    res.json(customer);
  }),
);

customersRouter.post(
  '/',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = createCustomerSchema.parse(req.body);
    const customer = await prisma.customer.create({
      data: { ...data, email: data.email || null, code: await nextCustomerCode() },
    });
    await audit(req, 'CREATE', 'Customer', customer.id, { name: customer.name });
    res.status(201).json(customer);
  }),
);

customersRouter.put(
  '/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = updateCustomerSchema.parse(req.body);
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: { ...data, ...(data.email !== undefined ? { email: data.email || null } : {}) },
    });
    await audit(req, 'UPDATE', 'Customer', customer.id, data);
    res.json(customer);
  }),
);

customersRouter.delete(
  '/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.count({ where: { customerId: req.params.id } });
    if (orders > 0) {
      throw badRequest(
        `Bu musterinin ${orders} siparisi var. Silmek yerine "Pasif" durumuna alin.`,
      );
    }
    await prisma.customer.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'Customer', req.params.id);
    res.json({ message: 'Musteri silindi.' });
  }),
);

// ---------------------------------------------------------------------------
// Kisiler (paydas haritasi)
// ---------------------------------------------------------------------------

const contactBase = {
  fullName: z.string().min(2, 'Ad soyad zorunludur.'),
  title: nullableString,
  email: z.string().email('Gecerli bir e-posta giriniz.').optional().nullable().or(z.literal('')),
  phone: nullableString,
  mobile: nullableString,
  department: z.nativeEnum(StakeholderDepartment).default(StakeholderDepartment.DIGER),
  role: z.nativeEnum(StakeholderRole).default(StakeholderRole.ETKILEYICI),
  influence: z.number().int().min(1).max(5).default(3),
  sentiment: z.nativeEnum(Sentiment).default(Sentiment.NOTR),
  negotiationStyle: z.nativeEnum(NegotiationStyle).optional().nullable(),
  priceSensitivity: z.nativeEnum(PriceSensitivity).optional().nullable(),
  responsiveness: nullableString,
  notes: nullableString,
  reportsToId: z.string().uuid().optional().nullable(),
  isPrimary: z.boolean().default(false),
  isActive: z.boolean().default(true),
};

const createContactSchema = z.object(contactBase);
const updateContactSchema = z.object(contactBase).partial();

customersRouter.get(
  '/:id/contacts',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.contact.findMany({
        where: { customerId: req.params.id },
        include: { reportsTo: { select: { id: true, fullName: true } } },
        orderBy: [{ isPrimary: 'desc' }, { influence: 'desc' }, { fullName: 'asc' }],
      }),
    );
  }),
);

customersRouter.post(
  '/:id/contacts',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = createContactSchema.parse(req.body);

    const contact = await prisma.$transaction(async (tx) => {
      // Firmada tek bir birincil kisi olur.
      if (data.isPrimary) {
        await tx.contact.updateMany({
          where: { customerId: req.params.id },
          data: { isPrimary: false },
        });
      }
      return tx.contact.create({
        data: { ...data, email: data.email || null, customerId: req.params.id },
      });
    });

    await audit(req, 'CREATE', 'Contact', contact.id, { fullName: contact.fullName });
    res.status(201).json(contact);
  }),
);

customersRouter.put(
  '/contacts/:contactId',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = updateContactSchema.parse(req.body);
    const existing = await prisma.contact.findUniqueOrThrow({ where: { id: req.params.contactId } });

    // Kisi kendi kendine baglanamaz (hiyerarsi dongusu).
    if (data.reportsToId && data.reportsToId === req.params.contactId) {
      throw badRequest('Bir kisi kendisine bagli olamaz.');
    }

    const contact = await prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.contact.updateMany({
          where: { customerId: existing.customerId },
          data: { isPrimary: false },
        });
      }
      return tx.contact.update({
        where: { id: req.params.contactId },
        data: { ...data, ...(data.email !== undefined ? { email: data.email || null } : {}) },
      });
    });

    await audit(req, 'UPDATE', 'Contact', contact.id, data);
    res.json(contact);
  }),
);

customersRouter.delete(
  '/contacts/:contactId',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.contact.delete({ where: { id: req.params.contactId } });
    await audit(req, 'DELETE', 'Contact', req.params.contactId);
    res.json({ message: 'Kisi silindi.' });
  }),
);

// ---------------------------------------------------------------------------
// Etkilesim gecmisi
// ---------------------------------------------------------------------------

const interactionSchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  opportunityId: z.string().uuid().optional().nullable(),
  type: z.nativeEnum(InteractionType).default(InteractionType.TELEFON),
  subject: z.string().min(2, 'Konu zorunludur.'),
  summary: nullableString,
  outcome: nullableString,
  sentiment: z.nativeEnum(Sentiment).default(Sentiment.NOTR),
  occurredAt: z.coerce.date().default(() => new Date()),
  followUpAt: z.coerce.date().optional().nullable(),
});

customersRouter.get(
  '/:id/interactions',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.interaction.findMany({
        where: { customerId: req.params.id },
        include: {
          contact: { select: { id: true, fullName: true } },
          user: { select: { id: true, fullName: true } },
          opportunity: { select: { id: true, code: true, title: true } },
        },
        orderBy: { occurredAt: 'desc' },
      }),
    );
  }),
);

customersRouter.post(
  '/:id/interactions',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = interactionSchema.parse(req.body);
    const interaction = await prisma.interaction.create({
      data: { ...data, customerId: req.params.id, userId: req.user!.id },
      include: { contact: { select: { id: true, fullName: true } } },
    });
    await audit(req, 'CREATE', 'Interaction', interaction.id, { subject: interaction.subject });
    res.status(201).json(interaction);
  }),
);

// ---------------------------------------------------------------------------
// Davranis tahmini ve urun onerileri
// ---------------------------------------------------------------------------

/** Siparis gecmisinden RFM girdilerini toplar. */
async function collectFacts(): Promise<{ facts: CustomerFacts[]; now: number }> {
  const now = Date.now();
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      createdAt: true,
      orders: { select: { orderDate: true, totalAmount: true, status: true } },
    },
  });

  const facts = customers.map((c) => {
    // Iptal edilen siparisler davranis analizine girmez.
    const valid = c.orders.filter((o) => o.status !== 'IPTAL');
    const last = valid.reduce<Date | null>(
      (acc, o) => (!acc || o.orderDate > acc ? o.orderDate : acc),
      null,
    );
    return {
      customerId: c.id,
      recencyDays: last ? Math.floor((now - last.getTime()) / 86_400_000) : null,
      frequency: valid.length,
      monetary: valid.reduce((sum, o) => sum + o.totalAmount, 0),
      ageDays: Math.floor((now - c.createdAt.getTime()) / 86_400_000),
    };
  });

  return { facts, now };
}

/** Tum musterilerin davranis segmentleri - Raporlar sekmesi kullanir. */
customersRouter.get(
  '/behavior/overview',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (_req, res) => {
    const { facts } = await collectFacts();
    const results = analyzeBehavior(facts);

    const customers = await prisma.customer.findMany({
      select: { id: true, code: true, name: true, industry: true, status: true },
    });
    const byId = new Map(customers.map((c) => [c.id, c]));

    const rows = results
      .map((r) => ({ ...r, customer: byId.get(r.customerId) }))
      .filter((r) => r.customer)
      .sort((a, b) => b.purchaseProbability - a.purchaseProbability);

    const distribution: Record<string, number> = {};
    for (const row of rows) distribution[row.segment] = (distribution[row.segment] ?? 0) + 1;

    res.json({ rows, distribution });
  }),
);

customersRouter.get(
  '/:id/behavior',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const { facts } = await collectFacts();
    const result = analyzeBehavior(facts).find((r) => r.customerId === req.params.id);
    if (!result) throw badRequest('Musteri bulunamadi.');
    res.json(result);
  }),
);

customersRouter.get(
  '/:id/recommendations',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: req.params.id },
      select: { id: true, industry: true },
    });

    const [products, customers, orderItems] = await Promise.all([
      prisma.product.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, family: true },
      }),
      prisma.customer.findMany({ select: { id: true, industry: true } }),
      prisma.orderItem.findMany({
        where: { productId: { not: null }, order: { status: { not: 'IPTAL' } } },
        select: { productId: true, lineTotal: true, order: { select: { customerId: true } } },
      }),
    ]);

    const purchases = orderItems.map((item) => ({
      customerId: item.order.customerId,
      productId: item.productId as string,
      amount: item.lineTotal,
    }));

    res.json(
      recommendProducts({
        customerId: customer.id,
        industry: customer.industry,
        products,
        purchases,
        industryByCustomer: new Map(customers.map((c) => [c.id, c.industry])),
        limit: 6,
      }),
    );
  }),
);

// ---------------------------------------------------------------------------
// Gorevler / hatirlaticilar
// ---------------------------------------------------------------------------

const taskSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  opportunityId: z.string().uuid().optional().nullable(),
  assigneeId: z.string().uuid().optional().nullable(),
  title: z.string().min(2, 'Gorev basligi zorunludur.'),
  description: nullableString,
  dueAt: z.coerce.date(),
});

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

tasksRouter.get(
  '/',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const status = req.query.status ? String(req.query.status).split(',') : undefined;
    res.json(
      await prisma.task.findMany({
        where: {
          ...(status ? { status: { in: status as TaskStatus[] } } : {}),
          ...(req.query.mine === 'true' ? { assigneeId: req.user!.id } : {}),
        },
        include: {
          customer: { select: { id: true, code: true, name: true } },
          assignee: { select: { id: true, fullName: true } },
          opportunity: { select: { id: true, code: true, title: true } },
        },
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
      }),
    );
  }),
);

tasksRouter.post(
  '/',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = taskSchema.parse(req.body);
    const task = await prisma.task.create({
      data: { ...data, assigneeId: data.assigneeId ?? req.user!.id },
      include: { customer: { select: { id: true, name: true } } },
    });
    await audit(req, 'CREATE', 'Task', task.id, { title: task.title });
    res.status(201).json(task);
  }),
);

tasksRouter.patch(
  '/:id/status',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.nativeEnum(TaskStatus) }).parse(req.body);
    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: { status, completedAt: status === TaskStatus.TAMAMLANDI ? new Date() : null },
    });
    await audit(req, 'STATUS_CHANGE', 'Task', task.id, { status });
    res.json(task);
  }),
);

tasksRouter.delete(
  '/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.task.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'Task', req.params.id);
    res.json({ message: 'Gorev silindi.' });
  }),
);

// Fırsat kodu üretimi burada da kullanılır.
export async function nextOpportunityCode(): Promise<string> {
  const rows = await prisma.opportunity.findMany({ select: { code: true } });
  return nextSequence('FRS', rows.map((r) => r.code));
}
