import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { ModuleKey } from '@prisma/client';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { forbidden, unauthorized } from '../lib/http.js';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  isAdmin: boolean;
  maxDiscountPct: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface JwtPayload {
  sub: string;
  username: string;
  /** jsonwebtoken tarafindan eklenen uretim ani (saniye) */
  iat?: number;
}

export function signToken(user: { id: string; username: string }): string {
  return jwt.sign({ sub: user.id, username: user.username } satisfies JwtPayload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

/**
 * Jeton, sahibinin son sifre degisikliginden once mi uretilmis?
 *
 * `iat` saniye cozunurlugundedir; ayni saniye icinde yapilan sifre degisikligi
 * yeni jetonu da gecersiz kilmasin diye bir saniyelik pay birakilir.
 */
function issuedBeforePasswordChange(payload: JwtPayload, passwordChangedAt: Date | null): boolean {
  if (!passwordChangedAt || !payload.iat) return false;
  return payload.iat * 1000 < passwordChangedAt.getTime() - 1000;
}

/** Authorization: Bearer <token> basligini dogrular ve req.user'i doldurur. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized('Oturum acmaniz gerekiyor.');

    const payload = jwt.verify(header.slice(7), env.jwtSecret) as JwtPayload;
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user) throw unauthorized('Kullanici bulunamadi.');
    if (!user.isActive) throw forbidden('Kullanici hesabi pasif durumda.');

    // Sifre degistiginde eski jetonlar dusmelidir; aksi halde calinan bir jeton
    // sifre degistirilse bile suresi dolana kadar gecerli kalir.
    if (issuedBeforePasswordChange(payload, user.passwordChangedAt)) {
      throw unauthorized('Sifreniz degistirildigi icin oturumunuz sonlandirildi. Tekrar giris yapin.');
    }

    req.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
      maxDiscountPct: user.maxDiscountPct,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      next(unauthorized());
      return;
    }
    next(err);
  }
}

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve';

const ACTION_FIELD: Record<PermissionAction, string> = {
  view: 'canView',
  create: 'canCreate',
  edit: 'canEdit',
  delete: 'canDelete',
  approve: 'canApprove',
};

/**
 * Belirtilen sekme (modul) icin istenen yetkiyi kontrol eder.
 * Admin kullanicilar tum yetkilere sahiptir.
 */
export function requirePermission(module: ModuleKey, action: PermissionAction = 'view') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw unauthorized();
      if (req.user.isAdmin) return next();

      const permission = await prisma.permission.findUnique({
        where: { userId_module: { userId: req.user.id, module } },
      });

      const field = ACTION_FIELD[action] as keyof typeof permission;
      if (!permission || permission[field] !== true) {
        throw forbidden(`"${module}" modulu icin "${action}" yetkiniz bulunmuyor.`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Sadece yoneticiler. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (!req.user.isAdmin) return next(forbidden('Bu islem yalnizca yoneticiler icindir.'));
  next();
}

/**
 * Birden fazla modulden herhangi birinde yetki yeterlidir.
 * Ornek: musteri listesi hem Musteriler hem Firsatlar sekmesinden okunur.
 */
export function requireAnyPermission(modules: ModuleKey[], action: PermissionAction = 'view') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw unauthorized();
      if (req.user.isAdmin) return next();

      const rows = await prisma.permission.findMany({
        where: { userId: req.user.id, module: { in: modules } },
      });

      const field = ACTION_FIELD[action];
      const allowed = rows.some((row) => (row as unknown as Record<string, boolean>)[field]);
      if (!allowed) throw forbidden('Bu islem icin yetkiniz bulunmuyor.');
      next();
    } catch (err) {
      next(err);
    }
  };
}
