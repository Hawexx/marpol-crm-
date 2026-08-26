import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

/** Kontrollu hata: istemciye mesaj ile birlikte doner. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new ApiError(400, msg, details);
export const unauthorized = (msg = 'Oturum gecersiz veya suresi dolmus.') => new ApiError(401, msg);
export const forbidden = (msg = 'Bu islem icin yetkiniz yok.') => new ApiError(403, msg);
export const notFound = (msg = 'Kayit bulunamadi.') => new ApiError(404, msg);
export const conflict = (msg: string) => new ApiError(409, msg);

/** async route handler'lari icin try/catch sarmalayici. */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}

/** Merkezi hata yakalayici. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Girilen veriler gecersiz.',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'alan';
      res.status(409).json({ error: `Bu ${target} degeri zaten kayitli.` });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({
        error: 'Bu kayit baska kayitlarla iliskili oldugu icin islem yapilamiyor.',
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Kayit bulunamadi.' });
      return;
    }
  }

  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }

  console.error('[HATA]', err);
  res.status(500).json({ error: 'Sunucu hatasi olustu.' });
}

/** Liste uclarinin varsayilan ve azami kayit sayisi. */
export const DEFAULT_LIST_LIMIT = 500;
export const MAX_LIST_LIMIT = 2000;

/**
 * Liste uclari icin sinirli kayit sayisi.
 *
 * Hicbir `findMany` cagrisinda `take` yoktu; tablo buyudukce tek bir istek
 * tum tabloyu bellege alip yaniti sisiriyordu. Istemci `?limit=` ile artirabilir,
 * ama ust sinir sabittir.
 */
export function listLimit(value: unknown, fallback = DEFAULT_LIST_LIMIT): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), MAX_LIST_LIMIT);
}

/**
 * Yil bazli sira numarasi uretir - ör. TKF-2026-0001.
 * Ayni yil icindeki en buyuk numaranin bir fazlasini alir.
 */
export function nextSequence(prefix: string, existing: string[], year = new Date().getFullYear()): string {
  const head = `${prefix}-${year}-`;
  const max = existing
    .filter((code) => code.startsWith(head))
    .map((code) => Number(code.slice(head.length)) || 0)
    .reduce((acc, n) => Math.max(acc, n), 0);
  return `${head}${String(max + 1).padStart(4, '0')}`;
}
