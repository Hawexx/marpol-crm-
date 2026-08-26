import { Router } from 'express';
import multer, { MulterError } from 'multer';
import { z } from 'zod';
import { ContractFileKind, ContractStatus, ContractType, ModuleKey } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, badRequest, nextSequence, listLimit } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  MAX_FILE_BYTES,
  assertContentMatchesMime,
  isAllowedContractMime,
  removeStoredDirectory,
  removeStoredFile,
  resolveStoredPath,
  safeOriginalName,
  safeSegment,
  storeFile,
} from '../lib/uploads.js';

export const contractsRouter = Router();

const MODULE = ModuleKey.SOZLESMELER;

contractsRouter.use(requireAuth);

const nullableString = z.string().trim().optional().nullable();

const contractBase = {
  customerId: z.string().uuid('Musteri secilmelidir.'),
  type: z.nativeEnum(ContractType).default(ContractType.SATIS),
  status: z.nativeEnum(ContractStatus).default(ContractStatus.TASLAK),
  title: z.string().min(2, 'Sozlesme basligi zorunludur.'),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  renewalDate: z.coerce.date().optional().nullable(),
  autoRenew: z.boolean().default(false),
  value: z.number().nonnegative().optional().nullable(),
  currency: z.string().default('TRY'),
  warrantyMonths: z.number().int().nonnegative().optional().nullable(),
  deliveryTerms: nullableString,
  paymentTerms: nullableString,
  penaltyClause: nullableString,
  governingLaw: nullableString,
  notes: nullableString,
};

contractsRouter.get(
  '/',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const contracts = await prisma.contract.findMany({
      where: {
        ...(req.query.customerId ? { customerId: String(req.query.customerId) } : {}),
        ...(req.query.type ? { type: String(req.query.type) as ContractType } : {}),
        ...(req.query.status ? { status: String(req.query.status) as ContractStatus } : {}),
        ...(q
          ? {
              OR: [
                { contractNo: { contains: q, mode: 'insensitive' } },
                { title: { contains: q, mode: 'insensitive' } },
                { customer: { name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        versions: { where: { isCurrent: true }, take: 1 },
        _count: { select: { versions: true, files: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: listLimit(req.query.limit),
    });

    res.json(contracts);
  }),
);

/** Yenileme/bitis tarihi yaklasan sozlesmeler - gosterge panelinde hatirlatilir. */
contractsRouter.get(
  '/expiring',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const days = Number(req.query.days ?? 60);
    const limit = new Date(Date.now() + days * 86_400_000);

    res.json(
      await prisma.contract.findMany({
        where: {
          status: ContractStatus.YURURLUKTE,
          OR: [
            { endDate: { lte: limit, gte: new Date() } },
            { renewalDate: { lte: limit, gte: new Date() } },
          ],
        },
        include: { customer: { select: { id: true, code: true, name: true } } },
        orderBy: { endDate: 'asc' },
      }),
    );
  }),
);

contractsRouter.get(
  '/:id',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.contract.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
          customer: { select: { id: true, code: true, name: true } },
          versions: {
            orderBy: { version: 'desc' },
            include: { createdBy: { select: { id: true, fullName: true } } },
          },
          files: {
            orderBy: { createdAt: 'desc' },
            include: {
              uploadedBy: { select: { id: true, fullName: true } },
              version: { select: { id: true, version: true } },
            },
          },
        },
      }),
    );
  }),
);

contractsRouter.post(
  '/',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = z.object(contractBase).parse(req.body);
    const rows = await prisma.contract.findMany({ select: { contractNo: true } });

    const contract = await prisma.contract.create({
      data: {
        ...data,
        contractNo: nextSequence('SZL', rows.map((r) => r.contractNo)),
        // Her sozlesme 1. surumuyle baslar.
        versions: {
          create: {
            version: 1,
            isCurrent: true,
            changeNote: 'Ilk surum.',
            createdById: req.user!.id,
          },
        },
      },
      include: { versions: true },
    });

    await audit(req, 'CREATE', 'Contract', contract.id, { contractNo: contract.contractNo });
    res.status(201).json(contract);
  }),
);

contractsRouter.put(
  '/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = z.object(contractBase).partial().parse(req.body);
    const contract = await prisma.contract.update({ where: { id: req.params.id }, data });
    await audit(req, 'UPDATE', 'Contract', contract.id, data);
    res.json(contract);
  }),
);

contractsRouter.patch(
  '/:id/status',
  requirePermission(MODULE, 'approve'),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.nativeEnum(ContractStatus) }).parse(req.body);
    const contract = await prisma.contract.update({
      where: { id: req.params.id },
      data: { status },
    });
    await audit(req, 'STATUS_CHANGE', 'Contract', contract.id, { status });
    res.json(contract);
  }),
);

contractsRouter.delete(
  '/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    // Kayit silinmeden once yuklenen evrakin diskteki klasoru de temizlenir.
    const contract = await prisma.contract.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { customer: { select: { code: true } } },
    });

    await prisma.contract.delete({ where: { id: req.params.id } });
    await removeStoredDirectory(contractFolder(contract.customer.code, contract.contractNo));

    await audit(req, 'DELETE', 'Contract', req.params.id);
    res.json({ message: 'Sozlesme silindi.' });
  }),
);

// ---------------------------------------------------------------------------
// Surumler - her degisiklik yeni surum olarak saklanir, eskisi silinmez
// ---------------------------------------------------------------------------

const versionSchema = z.object({
  changeNote: z.string().min(2, 'Degisiklik notu zorunludur.'),
  body: nullableString,
  fileName: nullableString,
  fileUrl: nullableString,
});

contractsRouter.post(
  '/:id/versions',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = versionSchema.parse(req.body);

    const version = await prisma.$transaction(async (tx) => {
      const last = await tx.contractVersion.findFirst({
        where: { contractId: req.params.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      // Onceki surum arsivde kalir, yalnizca "guncel" isareti tasinir.
      await tx.contractVersion.updateMany({
        where: { contractId: req.params.id },
        data: { isCurrent: false },
      });

      return tx.contractVersion.create({
        data: {
          ...data,
          contractId: req.params.id,
          version: (last?.version ?? 0) + 1,
          isCurrent: true,
          createdById: req.user!.id,
        },
        include: { createdBy: { select: { id: true, fullName: true } } },
      });
    });

    await audit(req, 'CREATE', 'ContractVersion', version.id, { version: version.version });
    res.status(201).json(version);
  }),
);

// ---------------------------------------------------------------------------
// Sozlesme evraki - taranmis imzali kopya, taslak ve ekler (PDF / PNG / JPEG)
// ---------------------------------------------------------------------------

/** Firma bazli klasor yapisi: contracts/<MUSTERI_KODU>/<SOZLESME_NO> */
function contractFolder(customerCode: string, contractNo: string): string[] {
  return ['contracts', safeSegment(customerCode, 'musteri'), safeSegment(contractNo, 'sozlesme')];
}

const fileInclude = {
  uploadedBy: { select: { id: true, fullName: true } },
  version: { select: { id: true, version: true } },
} as const;

/**
 * Dosya bellekte tutulur, tur ve boyut dogrulandiktan sonra diske yazilir.
 * Boylece gecersiz bir yukleme diskte artik birakmaz.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedContractMime(file.mimetype)) {
      cb(badRequest('Yalnizca PDF, PNG ve JPEG dosyalari yuklenebilir.'));
      return;
    }
    cb(null, true);
  },
});

/** Multer'in kendi hatalarini kullaniciya anlasilir mesaja cevirir. */
const singleFile: import('express').RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(badRequest(`Dosya cok buyuk. Azami ${MAX_FILE_BYTES / (1024 * 1024)} MB yuklenebilir.`));
        return;
      }
      next(badRequest(`Dosya yuklenemedi: ${err.message}`));
      return;
    }
    next(err ?? undefined);
  });
};

const fileMetaSchema = z.object({
  kind: z.nativeEnum(ContractFileKind).default(ContractFileKind.IMZALI_KOPYA),
  versionId: z.string().uuid().optional().nullable(),
  notes: nullableString,
});

/** Bir sozlesmeye ait evrak listesi. */
contractsRouter.get(
  '/:id/files',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.contractFile.findMany({
        where: { contractId: req.params.id },
        include: fileInclude,
        orderBy: { createdAt: 'desc' },
      }),
    );
  }),
);

/** Evrak yukleme - multipart/form-data, `file` alani. */
contractsRouter.post(
  '/:id/files',
  requirePermission(MODULE, 'create'),
  singleFile,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Yuklenecek dosya secilmedi.');

    const meta = fileMetaSchema.parse({
      kind: req.body?.kind || undefined,
      versionId: req.body?.versionId || null,
      notes: req.body?.notes || null,
    });

    // Tarayicinin bildirdigi MIME yerine dosyanin kendi imzasi dogrulanir.
    assertContentMatchesMime(req.file.buffer, req.file.mimetype);

    const contract = await prisma.contract.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { customer: { select: { code: true } } },
    });

    if (meta.versionId) {
      const version = await prisma.contractVersion.findUnique({ where: { id: meta.versionId } });
      if (!version || version.contractId !== contract.id) {
        throw badRequest('Secilen surum bu sozlesmeye ait degil.');
      }
    }

    const storedPath = await storeFile(
      contractFolder(contract.customer.code, contract.contractNo),
      req.file.mimetype,
      req.file.buffer,
    );

    const file = await prisma.contractFile.create({
      data: {
        contractId: contract.id,
        versionId: meta.versionId ?? null,
        kind: meta.kind,
        originalName: safeOriginalName(req.file.originalname),
        storedPath,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        notes: meta.notes ?? null,
        uploadedById: req.user!.id,
      },
      include: fileInclude,
    });

    await audit(req, 'UPLOAD', 'ContractFile', file.id, {
      contractNo: contract.contractNo,
      originalName: file.originalName,
      kind: file.kind,
      sizeBytes: file.sizeBytes,
    });

    res.status(201).json(file);
  }),
);

/**
 * Evrak icerigi. Varsayilan olarak tarayicida onizlenir;
 * `?download=1` ile indirme olarak doner.
 */
contractsRouter.get(
  '/files/:fileId',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const file = await prisma.contractFile.findUniqueOrThrow({ where: { id: req.params.fileId } });
    const disposition = req.query.download ? 'attachment' : 'inline';

    res.sendFile(resolveStoredPath(file.storedPath), {
      headers: {
        'Content-Type': file.mimeType,
        // Turkce karakterli dosya adlari icin RFC 5987 kodlamasi.
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
        // Tarayici icerigi tahmin ederek baska bir tur gibi yorumlamasin.
        'X-Content-Type-Options': 'nosniff',
        // Dogrudan acilirsa bile betik calistiramasin (ör. PDF icindeki JS).
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    });
  }),
);

/** Evrakin sinifini / notunu / bagli surumunu gunceller - dosyanin kendisi degismez. */
contractsRouter.put(
  '/files/:fileId',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = fileMetaSchema.partial().parse(req.body);

    const current = await prisma.contractFile.findUniqueOrThrow({
      where: { id: req.params.fileId },
    });

    if (data.versionId) {
      const version = await prisma.contractVersion.findUnique({ where: { id: data.versionId } });
      if (!version || version.contractId !== current.contractId) {
        throw badRequest('Secilen surum bu sozlesmeye ait degil.');
      }
    }

    const file = await prisma.contractFile.update({
      where: { id: req.params.fileId },
      data,
      include: fileInclude,
    });

    await audit(req, 'UPDATE', 'ContractFile', file.id, data);
    res.json(file);
  }),
);

contractsRouter.delete(
  '/files/:fileId',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    const file = await prisma.contractFile.delete({ where: { id: req.params.fileId } });
    await removeStoredFile(file.storedPath);

    await audit(req, 'DELETE', 'ContractFile', file.id, { originalName: file.originalName });
    res.json({ message: 'Evrak silindi.' });
  }),
);
