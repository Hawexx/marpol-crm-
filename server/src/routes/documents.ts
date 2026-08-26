import { Router } from 'express';
import { z } from 'zod';
import { ComplianceStatus, Criticality, DocumentType, ModuleKey } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const documentsRouter = Router();

const MODULE = ModuleKey.DOKUMANLAR;

documentsRouter.use(requireAuth);

const nullableString = z.string().trim().optional().nullable();

/**
 * Dis baglanti alani.
 *
 * Serbest metin olarak birakilirsa `javascript:` ya da `data:` adresi
 * kaydedilebilir; bagi tiklayan kullanicinin oturum anahtari calinabilir.
 * Yalnizca http/https kabul edilir.
 */
const externalUrl = z
  .string()
  .trim()
  .max(2048, 'Baglanti cok uzun.')
  .refine(
    (value) => {
      if (!value) return true;
      try {
        const { protocol } = new URL(value);
        return protocol === 'http:' || protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Baglanti yalnizca http:// veya https:// ile baslayabilir.' },
  )
  .optional()
  .nullable();

// ---------------------------------------------------------------------------
// Genel dokumanlar
// ---------------------------------------------------------------------------

const documentSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  opportunityId: z.string().uuid().optional().nullable(),
  quoteId: z.string().uuid().optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
  type: z.nativeEnum(DocumentType).default(DocumentType.DIGER),
  title: z.string().min(2, 'Dokuman basligi zorunludur.'),
  docNo: nullableString,
  version: z.string().default('1.0'),
  fileName: nullableString,
  fileUrl: externalUrl,
  notes: nullableString,
});

documentsRouter.get(
  '/',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    res.json(
      await prisma.document.findMany({
        where: {
          ...(req.query.customerId ? { customerId: String(req.query.customerId) } : {}),
          ...(req.query.type ? { type: String(req.query.type) as DocumentType } : {}),
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: 'insensitive' } },
                  { docNo: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        include: {
          customer: { select: { id: true, code: true, name: true } },
          opportunity: { select: { id: true, code: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }),
);

documentsRouter.post(
  '/',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = documentSchema.parse(req.body);
    const document = await prisma.document.create({ data });
    await audit(req, 'CREATE', 'Document', document.id, { title: document.title });
    res.status(201).json(document);
  }),
);

documentsRouter.put(
  '/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = documentSchema.partial().parse(req.body);
    const document = await prisma.document.update({ where: { id: req.params.id }, data });
    await audit(req, 'UPDATE', 'Document', document.id, data);
    res.json(document);
  }),
);

documentsRouter.delete(
  '/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.document.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'Document', req.params.id);
    res.json({ message: 'Dokuman silindi.' });
  }),
);

// ---------------------------------------------------------------------------
// Teknik sartnameler ve uygunluk matrisi (Compliance Matrix)
// ---------------------------------------------------------------------------

const specSchema = z.object({
  customerId: z.string().uuid(),
  opportunityId: z.string().uuid().optional().nullable(),
  quoteId: z.string().uuid().optional().nullable(),
  title: z.string().min(2, 'Sartname basligi zorunludur.'),
  docNo: nullableString,
  revision: z.string().default('A'),
  receivedAt: z.coerce.date().default(() => new Date()),
  fileName: nullableString,
  fileUrl: externalUrl,
  notes: nullableString,
});

/** Uygunluk yuzdesi: kapsam disi maddeler paydaya girmez. */
function complianceSummary(rows: { status: ComplianceStatus; criticality: Criticality }[]) {
  const inScope = rows.filter((r) => r.status !== ComplianceStatus.KAPSAM_DISI);
  const met = inScope.filter((r) => r.status === ComplianceStatus.KARSILANIYOR).length;
  const partial = inScope.filter((r) => r.status === ComplianceStatus.KISMEN_KARSILANIYOR).length;
  const notMet = inScope.filter((r) => r.status === ComplianceStatus.KARSILANMIYOR).length;
  const open = inScope.filter((r) => r.status === ComplianceStatus.DEGERLENDIRILIYOR).length;

  // Kritik ve karsilanmayan maddeler teklifin en buyuk riskidir.
  const criticalGaps = inScope.filter(
    (r) =>
      r.status === ComplianceStatus.KARSILANMIYOR &&
      (r.criticality === Criticality.KRITIK || r.criticality === Criticality.YUKSEK),
  ).length;

  return {
    total: rows.length,
    inScope: inScope.length,
    met,
    partial,
    notMet,
    open,
    criticalGaps,
    // Kismen karsilanan maddeler yarim puan sayilir.
    compliancePct: inScope.length === 0 ? 0 : Math.round(((met + partial * 0.5) / inScope.length) * 100),
  };
}

documentsRouter.get(
  '/specs',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const specs = await prisma.specDocument.findMany({
      where: {
        ...(req.query.customerId ? { customerId: String(req.query.customerId) } : {}),
        ...(req.query.opportunityId ? { opportunityId: String(req.query.opportunityId) } : {}),
      },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        opportunity: { select: { id: true, code: true, title: true } },
        requirements: { select: { status: true, criticality: true } },
      },
      orderBy: { receivedAt: 'desc' },
    });

    res.json(
      specs.map((s) => ({
        ...s,
        requirements: undefined,
        summary: complianceSummary(s.requirements),
      })),
    );
  }),
);

documentsRouter.get(
  '/specs/:id',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const spec = await prisma.specDocument.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        opportunity: { select: { id: true, code: true, title: true } },
        quote: { select: { id: true, quoteNo: true, revision: true, title: true } },
        requirements: {
          orderBy: [{ sortOrder: 'asc' }, { clauseNo: 'asc' }],
          include: {
            owner: { select: { id: true, fullName: true } },
            quoteItem: { select: { id: true, description: true } },
          },
        },
      },
    });

    res.json({ ...spec, summary: complianceSummary(spec.requirements) });
  }),
);

documentsRouter.post(
  '/specs',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = specSchema.parse(req.body);
    const spec = await prisma.specDocument.create({ data });
    await audit(req, 'CREATE', 'SpecDocument', spec.id, { title: spec.title });
    res.status(201).json(spec);
  }),
);

documentsRouter.put(
  '/specs/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = specSchema.partial().parse(req.body);
    const spec = await prisma.specDocument.update({ where: { id: req.params.id }, data });
    await audit(req, 'UPDATE', 'SpecDocument', spec.id, data);
    res.json(spec);
  }),
);

documentsRouter.delete(
  '/specs/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.specDocument.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'SpecDocument', req.params.id);
    res.json({ message: 'Sartname silindi.' });
  }),
);

const requirementSchema = z.object({
  clauseNo: z.string().min(1, 'Madde no zorunludur.'),
  text: z.string().min(2, 'Madde metni zorunludur.'),
  category: nullableString,
  criticality: z.nativeEnum(Criticality).default(Criticality.ORTA),
  status: z.nativeEnum(ComplianceStatus).default(ComplianceStatus.DEGERLENDIRILIYOR),
  response: nullableString,
  deviation: nullableString,
  ownerId: z.string().uuid().optional().nullable(),
  quoteItemId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

documentsRouter.post(
  '/specs/:id/requirements',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    // Tek tek ya da toplu madde eklemeye izin ver (sartnameler uzun olur).
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    const rows = z.array(requirementSchema).parse(payload);

    const created = await prisma.$transaction(
      rows.map((data) =>
        prisma.specRequirement.create({ data: { ...data, specDocumentId: req.params.id } }),
      ),
    );

    await audit(req, 'CREATE', 'SpecRequirement', req.params.id, { count: created.length });
    res.status(201).json(created);
  }),
);

documentsRouter.put(
  '/requirements/:requirementId',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = requirementSchema.partial().parse(req.body);
    const requirement = await prisma.specRequirement.update({
      where: { id: req.params.requirementId },
      data,
    });
    await audit(req, 'UPDATE', 'SpecRequirement', requirement.id, data);
    res.json(requirement);
  }),
);

documentsRouter.delete(
  '/requirements/:requirementId',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    await prisma.specRequirement.delete({ where: { id: req.params.requirementId } });
    await audit(req, 'DELETE', 'SpecRequirement', req.params.requirementId);
    res.json({ message: 'Madde silindi.' });
  }),
);
