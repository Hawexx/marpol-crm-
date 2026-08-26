/**
 * Uygulama genelindeki guvenlik ara katmanlari.
 *
 * Buradaki her kural, kimlik dogrulamasindan **once** devreye girer:
 * kaba kuvvet denemeleri oturum acmadan durdurulur, guvenlik basliklari
 * hatali istekler dahil her yanita eklenir.
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import helmet from 'helmet';
import type { RequestHandler } from 'express';
import { env } from '../env.js';

/**
 * Guvenlik basliklari.
 *
 * API JSON dondurur; tek istisna sozlesme evraki uctur ve o uc kendi
 * `Content-Disposition` / `nosniff` basliklarini ayrica yazar. Bu yuzden
 * icerik guvenligi politikasi olabildigince dar tutulur.
 */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'none'"],
      'form-action': ["'none'"],
    },
  },
  // Tarayici, API'den donen dosyalari asla tahmin ederek yorumlamasin.
  xContentTypeOptions: true,
  // Capraz kaynak kaynak yuklemesi API icin gereksiz; onizleme blob ile yapilir.
  crossOriginResourcePolicy: { policy: 'same-site' },
  // HTTPS zorlamasi yalnizca uretimde anlamli.
  hsts: env.isProduction ? { maxAge: 15_552_000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'no-referrer' },
});

const LOGIN_BLOCKED = {
  error: 'Cok fazla basarisiz giris denemesi yapildi. Lutfen 15 dakika sonra tekrar deneyin.',
};

/**
 * Tek hesaba yonelik kaba kuvvet.
 *
 * IP + kullanici adi ciftine bakar: bir hesabin sifresini deneyerek bulmaya
 * calisan istemci 10 denemede durur. Basarili girisler sayaca islenmez,
 * boylece gunluk kullanim etkilenmez.
 */
export const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.username ?? '').toLowerCase()}`,
  message: LOGIN_BLOCKED,
});

/**
 * Sifre puskurtme (password spraying).
 *
 * Yukaridaki sayac hesap basina tutuldugu icin, tek bir sifreyi yuzlerce
 * kullanici adinda denemek onu hic tetiklemez. Bu ikinci sayac yalnizca IP'ye
 * bakar ve esigi daha yuksektir: ayni ofisten calisan bir ekibi engellemez,
 * ama kullanici adi listesi tarayan istemciyi durdurur.
 */
export const loginSprayLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
  message: LOGIN_BLOCKED,
});

/** Sifre degistirme de kaba kuvvete acik bir uctur. */
export const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Cok fazla deneme yapildi. Lutfen bir sure sonra tekrar deneyin.' },
});

/**
 * Genel API tavani. Normal kullanimin cok uzerinde; amaci tek bir
 * istemcinin sunucuyu mesgul etmesini engellemek.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Cok fazla istek gonderildi. Lutfen kisa bir sure bekleyin.' },
});
