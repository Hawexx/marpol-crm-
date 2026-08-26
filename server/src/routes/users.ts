import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ModuleKey } from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler, badRequest, forbidden } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { strongPassword } from './auth.js';

export const usersRouter = Router();

const MODULE = ModuleKey.YETKILENDIRME;

usersRouter.use(requireAuth);

const permissionSchema = z.object({
  module: z.nativeEnum(ModuleKey),
  canView: z.boolean().default(false),
  canCreate: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  canApprove: z.boolean().default(false),
});

const userBase = {
  fullName: z.string().min(2, 'Ad soyad zorunludur.'),
  employeeNo: z.string().trim().optional().nullable(),
  department: z.string().trim().optional().nullable(),
  title: z.string().trim().optional().nullable(),
  email: z.string().email('Gecerli bir e-posta giriniz.').optional().nullable().or(z.literal('')),
  phone: z.string().trim().optional().nullable(),
  isAdmin: z.boolean().default(false),
  isActive: z.boolean().default(true),
  maxDiscountPct: z.number().min(0).max(100).default(5),
  permissions: z.array(permissionSchema).default([]),
};

const createSchema = z.object({
  username: z.string().min(3, 'Kullanici adi en az 3 karakter olmalidir.'),
  password: strongPassword,
  ...userBase,
});

/**
 * Guncelleme semasi tamamen istege baglidir.
 *
 * `userBase` alanlarinin hepsinde `.default()` var; sema partial olmazsa
 * govdede gonderilmeyen her alan sessizce varsayilanina doner - `permissions`
 * gonderilmediginde kullanicinin tum yetki matrisi silinirdi.
 */
const updateSchema = z
  .object({
    username: z.string().min(3).optional(),
    password: strongPassword.optional().or(z.literal('')),
    ...userBase,
  })
  .partial();

const publicUser = {
  id: true,
  username: true,
  fullName: true,
  employeeNo: true,
  department: true,
  title: true,
  email: true,
  phone: true,
  isAdmin: true,
  isActive: true,
  maxDiscountPct: true,
  lastLoginAt: true,
  createdAt: true,
  permissions: true,
} as const;

/** Yetki matrisini bos alanlariyla birlikte tam liste halinde doner. */
function fullPermissionMatrix(rows: { module: ModuleKey }[]) {
  return Object.values(ModuleKey).map((module) => {
    const found = rows.find((r) => r.module === module) as Record<string, unknown> | undefined;
    return {
      module,
      canView: Boolean(found?.canView),
      canCreate: Boolean(found?.canCreate),
      canEdit: Boolean(found?.canEdit),
      canDelete: Boolean(found?.canDelete),
      canApprove: Boolean(found?.canApprove),
    };
  });
}

usersRouter.get(
  '/',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { username: { contains: q, mode: 'insensitive' } },
              { employeeNo: { contains: q, mode: 'insensitive' } },
              { department: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: publicUser,
      orderBy: { fullName: 'asc' },
    });

    res.json(users.map((u) => ({ ...u, permissions: fullPermissionMatrix(u.permissions) })));
  }),
);

/** Sistemdeki sekme listesi - yetki matrisinin satirlarini olusturur. */
usersRouter.get(
  '/modules',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (_req, res) => {
    res.json(Object.values(ModuleKey));
  }),
);

usersRouter.get(
  '/:id',
  requirePermission(MODULE, 'view'),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.params.id },
      select: publicUser,
    });
    res.json({ ...user, permissions: fullPermissionMatrix(user.permissions) });
  }),
);

usersRouter.post(
  '/',
  requirePermission(MODULE, 'create'),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);

    // Yoneticiyi yalnizca bir yonetici olusturabilir.
    if (data.isAdmin && !req.user!.isAdmin) {
      throw forbidden('Yonetici hesabini yalnizca bir yonetici olusturabilir.');
    }
    if (!req.user!.isAdmin && data.maxDiscountPct > req.user!.maxDiscountPct) {
      throw forbidden(
        `Kendi iskonto yetkinizin (%${req.user!.maxDiscountPct}) uzerinde bir limit tanimlayamazsiniz.`,
      );
    }

    const user = await prisma.user.create({
      data: {
        username: data.username.trim().toLowerCase(),
        passwordHash: await bcrypt.hash(data.password, 12),
        fullName: data.fullName,
        employeeNo: data.employeeNo || null,
        department: data.department || null,
        title: data.title || null,
        email: data.email || null,
        phone: data.phone || null,
        isAdmin: data.isAdmin,
        isActive: data.isActive,
        maxDiscountPct: data.maxDiscountPct,
        permissions: { create: data.permissions },
      },
      select: publicUser,
    });

    await audit(req, 'CREATE', 'User', user.id, { username: user.username });
    res.status(201).json({ ...user, permissions: fullPermissionMatrix(user.permissions) });
  }),
);

usersRouter.put(
  '/:id',
  requirePermission(MODULE, 'edit'),
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const id = req.params.id;
    const actor = req.user!;

    const target = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, isAdmin: true, maxDiscountPct: true },
    });

    // Kendini pasife alma / yoneticilikten cikarma kazasini engelle.
    if (id === actor.id && (data.isActive === false || data.isAdmin === false)) {
      throw badRequest('Kendi hesabinizin yetkilerini kaldiramazsiniz.');
    }

    // --- Yetki yukseltme korumalari -------------------------------------
    // "Yetkilendirme" sekmesinde duzenleme hakki, yonetici olmayi ya da bir
    // yoneticinin hesabini ele gecirmeyi kapsamaz.
    if (!actor.isAdmin) {
      if (target.isAdmin) {
        throw forbidden('Yonetici hesaplarini yalnizca yoneticiler duzenleyebilir.');
      }
      if (data.isAdmin === true) {
        throw forbidden('Yoneticilik yetkisini yalnizca bir yonetici verebilir.');
      }
      if (data.maxDiscountPct !== undefined && data.maxDiscountPct > actor.maxDiscountPct) {
        throw forbidden(
          `Kendi iskonto yetkinizin (%${actor.maxDiscountPct}) uzerinde bir limit tanimlayamazsiniz.`,
        );
      }
    }

    // Yalnizca govdede gonderilen alanlar guncellenir.
    const patch: Record<string, unknown> = {};
    if (data.username !== undefined) patch.username = data.username.trim().toLowerCase();
    if (data.fullName !== undefined) patch.fullName = data.fullName;
    if (data.employeeNo !== undefined) patch.employeeNo = data.employeeNo || null;
    if (data.department !== undefined) patch.department = data.department || null;
    if (data.title !== undefined) patch.title = data.title || null;
    if (data.email !== undefined) patch.email = data.email || null;
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (data.isAdmin !== undefined) patch.isAdmin = data.isAdmin;
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    if (data.maxDiscountPct !== undefined) patch.maxDiscountPct = data.maxDiscountPct;

    // Sifre sifirlandiginda hedefin acik oturumlari da dusmelidir.
    if (data.password) {
      patch.passwordHash = await bcrypt.hash(data.password, 12);
      patch.passwordChangedAt = new Date();
    }

    const user = await prisma.$transaction(async (tx) => {
      if (data.permissions !== undefined) {
        await tx.permission.deleteMany({ where: { userId: id } });
        patch.permissions = { create: data.permissions };
      }
      return tx.user.update({ where: { id }, data: patch, select: publicUser });
    });

    await audit(req, 'UPDATE', 'User', id, {
      username: user.username,
      // Denetim kaydinda sifrenin kendisi degil, sifirlandigi bilgisi tutulur.
      fields: Object.keys(patch).map((k) => (k === 'passwordHash' ? 'password' : k)),
    });
    res.json({ ...user, permissions: fullPermissionMatrix(user.permissions) });
  }),
);

usersRouter.delete(
  '/:id',
  requirePermission(MODULE, 'delete'),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) throw badRequest('Kendi hesabinizi silemezsiniz.');

    const target = await prisma.user.findUniqueOrThrow({
      where: { id: req.params.id },
      select: { isAdmin: true },
    });
    if (target.isAdmin && !req.user!.isAdmin) {
      throw forbidden('Yonetici hesaplarini yalnizca yoneticiler silebilir.');
    }

    // Uzerinde is gecmisi olan kullanicilar silinmez, pasife alinir.
    const [quotes, orders] = await Promise.all([
      prisma.quote.count({ where: { createdById: req.params.id } }),
      prisma.order.count({ where: { createdById: req.params.id } }),
    ]);

    if (quotes > 0 || orders > 0) {
      await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
      await audit(req, 'DEACTIVATE', 'User', req.params.id);
      res.json({
        message: `Kullanicinin ${quotes} teklifi ve ${orders} siparisi oldugu icin silinmedi, pasife alindi.`,
      });
      return;
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    await audit(req, 'DELETE', 'User', req.params.id);
    res.json({ message: 'Kullanici silindi.' });
  }),
);
