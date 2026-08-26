import { Router } from 'express';
import { z } from 'zod';
import { ModuleKey, OpportunityStage, Sentiment, StakeholderRole } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, nextSequence, listLimit } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const opportunitiesRouter = Router();

const MODULE = ModuleKey.FIRSATLAR;

opportunitiesRouter.use(requireAuth);

const nullableString = z.string().trim().optional().nullable();

/** Aşamaya göre varsayılan kazanma olasılığı - kullanıcı elle değiştirebilir. */
const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  KESIF: 10,
  NITELENDIRME: 25,
  TEKNIK_DEGERLENDIRME: 40,
  TEKLIF: 60,
  PAZARLIK: 75,
  KAZANILDI: 100,
  KAYBEDILDI: 0,
};

const opportunityBase = {
  customerId: z.string().uuid('Musteri secilmelidir.'),
  title: z.string().min(2, 'Firsat basligi zorunludur.'),
  description: nullableString,
  stage: z.nativeEnum(OpportunityStage).default(OpportunityStage.KESIF),
  probability: z.number().min(0).max(100).optional(),
  expectedValue: z.number().nonnegative().default(0),
  currency: z.string().default('TRY'),
  expectedCloseDate: z.coerce.date().optional().nullable(),
  source: nullableString,
  competitor: nullableString,
  lossReason: nullableString,
  notes: nullableString,
  ownerId: z.string().uuid().optional().nullable(),
};

const createSchema = z.object(opportunityBase);
const updateSchema = z.object(opportunityBase).partial();

opportunitiesRouter.get(
  '/',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const stage = req.query.stage ? String(req.query.stage).split(',') : undefined;

    res.json(
      await prisma.opportunity.findMany({
        where: {
          ...(stage ? { stage: { in: stage as OpportunityStage[] } } : {}),
          ...(req.query.open === 'true'
            ? { stage: { notIn: [OpportunityStage.KAZANILDI, OpportunityStage.KAYBEDILDI] } }
            : {}),
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: 'insensitive' } },
                  { code: { contains: q, mode: 'insensitive' } },
                  { customer: { name: { contains: q, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        include: {
          customer: { select: { id: true, code: true, name: true, industry: true } },
          owner: { select: { id: true, fullName: true } },
          _count: { select: { quotes: true, stakeholders: true } },
        },
        orderBy: [{ stage: 'asc' }, { expectedCloseDate: 'asc' }],
        take: listLimit(req.query.limit),
      }),
    );
  }),
);

opportunitiesRouter.get(
  '/:id',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.opportunity.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
          customer: true,
          owner: { select: { id: true, fullName: true } },
          stakeholders: {
            include: {
              contact: {
                select: {
                  id: true, fullName: true, title: true, department: true,
                  email: true, phone: true, negotiationStyle: true, notes: true,
                },
              },
            },
            orderBy: { influence: 'desc' },
          },
          stageHistory: { orderBy: { changedAt: 'desc' } },
          quotes: {
            orderBy: [{ quoteNo: 'asc' }, { revision: 'asc' }],
            select: {
              id: true, quoteNo: true, revision: true, isCurrent: true, title: true,
              status: true, totalPrice: true, marginPct: true, currency: true, issuedAt: true,
            },
          },
          interactions: {
            orderBy: { occurredAt: 'desc' },
            take: 20,
            include: { contact: { select: { id: true, fullName: true } } },
          },
          tasks: { orderBy: { dueAt: 'asc' } },
          specDocuments: { include: { _count: { select: { requirements: true } } } },
        },
      }),
    );
  }),
);

opportunitiesRouter.post(
  '/',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const rows = await prisma.opportunity.findMany({ select: { code: true } });

    const opportunity = await prisma.opportunity.create({
      data: {
        ...data,
        code: nextSequence('FRS', rows.map((r) => r.code)),
        probability: data.probability ?? STAGE_PROBABILITY[data.stage],
        ownerId: data.ownerId ?? req.user!.id,
        stageHistory: { create: { toStage: data.stage, note: 'Firsat olusturuldu.' } },
      },
      include: { customer: { select: { id: true, name: true } } },
    });

    await audit(req, 'CREATE', 'Opportunity', opportunity.id, { title: opportunity.title });
    res.status(201).json(opportunity);
  }),
);

opportunitiesRouter.put(
  '/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const opportunity = await prisma.opportunity.update({
      where: { id: req.params.id },
      data,
    });
    await audit(req, 'UPDATE', 'Opportunity', opportunity.id, data);
    res.json(opportunity);
  }),
);

/** Asama degisikligi - gecmise yazilir, kapanista tarih damgalanir. */
opportunitiesRouter.patch(
  '/:id/stage',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const { stage, note, lossReason } = z
      .object({
        stage: z.nativeEnum(OpportunityStage),
        note: nullableString,
        lossReason: nullableString,
      })
      .parse(req.body);

    const current = await prisma.opportunity.findUniqueOrThrow({ where: { id: req.params.id } });
    const closing = stage === OpportunityStage.KAZANILDI || stage === OpportunityStage.KAYBEDILDI;

    const opportunity = await prisma.opportunity.update({
      where: { id: req.params.id },
      data: {
        stage,
        probability: STAGE_PROBABILITY[stage],
        closedAt: closing ? new Date() : null,
        ...(stage === OpportunityStage.KAYBEDILDI ? { lossReason: lossReason || current.lossReason } : {}),
        stageHistory: { create: { fromStage: current.stage, toStage: stage, note } },
      },
    });

    await audit(req, 'STAGE_CHANGE', 'Opportunity', opportunity.id, { from: current.stage, to: stage });
    res.json(opportunity);
  }),
);

opportunitiesRouter.delete(
  '/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.opportunity.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'Opportunity', req.params.id);
    res.json({ message: 'Firsat silindi.' });
  }),
);

// ---------------------------------------------------------------------------
// Paydas haritasi - kim karar verici, kim teknik onayci
// ---------------------------------------------------------------------------

const stakeholderSchema = z.object({
  contactId: z.string().uuid(),
  role: z.nativeEnum(StakeholderRole).default(StakeholderRole.ETKILEYICI),
  influence: z.number().int().min(1).max(5).default(3),
  sentiment: z.nativeEnum(Sentiment).default(Sentiment.NOTR),
  notes: nullableString,
});

opportunitiesRouter.post(
  '/:id/stakeholders',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = stakeholderSchema.parse(req.body);
    // Ayni kisi ikinci kez eklenirse rolu guncellenir.
    const stakeholder = await prisma.opportunityStakeholder.upsert({
      where: { opportunityId_contactId: { opportunityId: req.params.id, contactId: data.contactId } },
      create: { ...data, opportunityId: req.params.id },
      update: data,
      include: { contact: { select: { id: true, fullName: true, department: true } } },
    });
    await audit(req, 'UPSERT', 'OpportunityStakeholder', stakeholder.id, data);
    res.status(201).json(stakeholder);
  }),
);

opportunitiesRouter.delete(
  '/stakeholders/:stakeholderId',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    await prisma.opportunityStakeholder.delete({ where: { id: req.params.stakeholderId } });
    await audit(req, 'DELETE', 'OpportunityStakeholder', req.params.stakeholderId);
    res.json({ message: 'Paydas kaldirildi.' });
  }),
);

/** Pipeline ozeti - asamaya gore adet ve agirlikli deger. */
opportunitiesRouter.get(
  '/pipeline/summary',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (_req, res) => {
    const open = await prisma.opportunity.findMany({
      where: { stage: { notIn: [OpportunityStage.KAZANILDI, OpportunityStage.KAYBEDILDI] } },
      select: { stage: true, expectedValue: true, probability: true },
    });

    const byStage: Record<string, { count: number; value: number; weighted: number }> = {};
    for (const stage of Object.values(OpportunityStage)) {
      byStage[stage] = { count: 0, value: 0, weighted: 0 };
    }
    for (const o of open) {
      const row = byStage[o.stage];
      row.count += 1;
      row.value += o.expectedValue;
      row.weighted += o.expectedValue * (o.probability / 100);
    }

    res.json({
      byStage,
      totalValue: open.reduce((s, o) => s + o.expectedValue, 0),
      weightedValue: open.reduce((s, o) => s + o.expectedValue * (o.probability / 100), 0),
      openCount: open.length,
    });
  }),
);
