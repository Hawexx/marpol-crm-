import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler, badRequest, unauthorized } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { loginAccountLimiter, loginSprayLimiter, passwordLimiter } from '../lib/security.js';

export const authRouter = Router();

/**
 * Sifre kurallari.
 *
 * Uzunluk tek basina yeterli degildir: sozluk saldirilarinda en cok denenen
 * degerler ayrica reddedilir.
 */
const WEAK_PASSWORDS = new Set([
  'marpol2026!',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  'password',
  'sifre123',
  'qwerty',
  'admin123',
  'marpol',
]);

export const strongPassword = z
  .string()
  .min(8, 'Sifre en az 8 karakter olmalidir.')
  .max(128, 'Sifre en fazla 128 karakter olabilir.')
  .refine((value) => /[a-zA-Z]/.test(value) && /[0-9]/.test(value), {
    message: 'Sifre en az bir harf ve bir rakam icermelidir.',
  })
  .refine((value) => !WEAK_PASSWORDS.has(value.toLowerCase()), {
    message: 'Bu sifre cok yaygin kullaniliyor. Farkli bir sifre secin.',
  });

const loginSchema = z.object({
  username: z.string().min(1, 'Kullanici adi zorunludur.'),
  password: z.string().min(1, 'Sifre zorunludur.'),
});

/** Kullanicinin yetki matrisini istemcinin kullanacagi sade yapiya cevirir. */
async function buildSession(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { permissions: true },
  });

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    employeeNo: user.employeeNo,
    department: user.department,
    title: user.title,
    isAdmin: user.isAdmin,
    maxDiscountPct: user.maxDiscountPct,
    permissions: user.permissions.map((p) => ({
      module: p.module,
      canView: p.canView,
      canCreate: p.canCreate,
      canEdit: p.canEdit,
      canDelete: p.canDelete,
      canApprove: p.canApprove,
    })),
  };
}

authRouter.post(
  '/login',
  loginSprayLimiter,
  loginAccountLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });
    // Kullanici yok ya da sifre yanlis: ayni mesaj (kullanici adi sizdirmamak icin).
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw unauthorized('Kullanici adi veya sifre hatali.');
    }
    if (!user.isActive) throw unauthorized('Hesabiniz pasif durumda. Yonetici ile gorusun.');

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = signToken(user);
    req.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
      maxDiscountPct: user.maxDiscountPct,
    };
    await audit(req, 'LOGIN', 'User', user.id);

    res.json({ token, user: await buildSession(user.id) });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: await buildSession(req.user!.id) });
  }),
);

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Mevcut sifre zorunludur.'),
  newPassword: strongPassword,
});

authRouter.post(
  '/change-password',
  requireAuth,
  passwordLimiter,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = passwordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw badRequest('Mevcut sifre hatali.');
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw badRequest('Yeni sifre mevcut sifreyle ayni olamaz.');
    }

    // passwordChangedAt damgasi, bu andan once uretilmis jetonlari gecersiz kilar.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 12),
        passwordChangedAt: new Date(),
      },
    });
    await audit(req, 'CHANGE_PASSWORD', 'User', user.id);

    res.json({
      message: 'Sifreniz guncellendi. Diger cihazlardaki oturumlariniz kapatildi.',
    });
  }),
);
