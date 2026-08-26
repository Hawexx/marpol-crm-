/**
 * Yüklenen dosyaların disk üzerindeki yönetimi.
 *
 * Dosyalar veritabanında değil, sunucudaki `uploads/` dizininde saklanır;
 * veritabanında yalnızca üstveri (ad, tür, boyut, yol) tutulur. Klasör yapısı
 * firma bazlıdır, böylece bir müşterinin tüm evrakı tek yerde toplanır:
 *
 *   uploads/contracts/<MUSTERI_KODU>/<SOZLESME_NO>/<uuid>.<uzanti>
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { badRequest } from './http.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** `server/uploads` - kaynak koddan bağımsız, çalışma dizininden etkilenmez. */
export const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(here, '../../uploads');

/** Sözleşme ekleri için kabul edilen türler - istenen format listesi. */
export const CONTRACT_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;

/** Tek dosya için azami boyut (20 MB) - taranmış sözleşmeler için fazlasıyla yeterli. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const EXTENSION: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
};

/** Dosyanın ilk baytları gerçekten iddia edilen türe mi ait - uzantı taklidini engeller. */
const SIGNATURES: Record<string, (buf: Buffer) => boolean> = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/png': (b) =>
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};

export function isAllowedContractMime(mime: string): boolean {
  return (CONTRACT_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * İçeriğin türünü doğrular. Tarayıcının bildirdiği MIME'a güvenilmez;
 * dosyanın imzası (magic bytes) kontrol edilir.
 */
export function assertContentMatchesMime(buffer: Buffer, mime: string): void {
  const check = SIGNATURES[mime];
  if (!check || !check(buffer)) {
    throw badRequest('Dosya icerigi bildirilen bicimle uyusmuyor. Yalnizca PDF, PNG ve JPEG yuklenebilir.');
  }
}

/** Klasör/dosya adında kullanilabilecek guvenli bir metin uretir. */
export function safeSegment(value: string, fallback: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);
  return cleaned || fallback;
}

/** Kullanicinin gonderdigi dosya adini temizler - dizin gecisi (../) icermez. */
export function safeOriginalName(name: string): string {
  const base = path.basename(name || '').trim();
  return base.slice(0, 180) || 'dosya';
}

/**
 * Dosyayi diske yazar ve uploads koku ne gore goreli yolunu doner.
 * `segments` klasor hiyerarsisini olusturur (ör. ['contracts', 'MST-0001', 'SZL-2026-0001']).
 */
export async function storeFile(
  segments: string[],
  mimeType: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(...segments);
  await fs.mkdir(path.join(UPLOAD_ROOT, dir), { recursive: true });

  const storedPath = path.join(dir, `${randomUUID()}${EXTENSION[mimeType] ?? ''}`);
  await fs.writeFile(path.join(UPLOAD_ROOT, storedPath), buffer);

  // Veritabaninda her zaman '/' ayraciyla saklanir - platformdan bagimsiz kalir.
  return storedPath.split(path.sep).join('/');
}

/** Goreli yolu mutlak yola cevirir; uploads dizini disina cikan yollari reddeder. */
export function resolveStoredPath(storedPath: string): string {
  const absolute = path.resolve(UPLOAD_ROOT, storedPath);
  if (absolute !== UPLOAD_ROOT && !absolute.startsWith(UPLOAD_ROOT + path.sep)) {
    throw badRequest('Gecersiz dosya yolu.');
  }
  return absolute;
}

/** Dosyayi diskten siler. Zaten yoksa hata vermez - kayit temizligi surmelidir. */
export async function removeStoredFile(storedPath: string): Promise<void> {
  try {
    await fs.unlink(resolveStoredPath(storedPath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[UPLOAD] dosya silinemedi:', storedPath, err);
    }
  }
}

/** Verilen klasoru icerigiyle birlikte siler (sozlesme silindiginde cagrilir). */
export async function removeStoredDirectory(segments: string[]): Promise<void> {
  try {
    await fs.rm(resolveStoredPath(path.join(...segments)), { recursive: true, force: true });
  } catch (err) {
    console.error('[UPLOAD] klasor silinemedi:', segments.join('/'), err);
  }
}
