import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

/** Uretimde asla kullanilmamasi gereken, depoya islenmis ornek degerler. */
const KNOWN_WEAK_SECRETS = new Set([
  'bu-anahtari-uretimde-mutlaka-degistirin',
  'marpol-crm-gelistirme-anahtari-degistirin',
  'changeme',
  'secret',
]);

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Ortam degiskeni eksik: ${name}`);
  return value;
}

/**
 * JWT imza anahtari.
 *
 * Gelistirmede rahatlik icin bir varsayilan kabul edilir; uretimde ise
 * eksik ya da depoda yer alan ornek bir anahtarla acilmak, herkesin yonetici
 * jetonu uretebilmesi demektir. Bu yuzden uretimde surec baslamadan durur.
 */
function readJwtSecret(): string {
  const value = process.env.JWT_SECRET?.trim() ?? '';

  if (isProduction) {
    if (!value) {
      throw new Error('JWT_SECRET uretim ortaminda zorunludur. En az 32 karakterlik rastgele bir deger tanimlayin.');
    }
    if (KNOWN_WEAK_SECRETS.has(value)) {
      throw new Error('JWT_SECRET ornek dosyadaki deger olarak birakilmis. Uretimde benzersiz bir anahtar tanimlayin.');
    }
    if (value.length < 32) {
      throw new Error('JWT_SECRET en az 32 karakter olmalidir.');
    }
    return value;
  }

  if (!value) return 'marpol-crm-gelistirme-anahtari-degistirin';
  return value;
}

const jwtSecret = readJwtSecret();

if (!isProduction && KNOWN_WEAK_SECRETS.has(jwtSecret)) {
  console.warn(
    '[MARPOL CRM] UYARI: JWT_SECRET ornek degerde. Uretime cikmadan once server/.env icinde degistirin.',
  );
}

export const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT ?? 4100),
  databaseUrl: required(
    'DATABASE_URL',
    'postgresql://marpol_crm:marpol_crm@localhost:5444/marpol_crm?schema=public',
  ),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5174',
  /** Ters vekil arkasinda calisirken gercek istemci IP'sini okuyabilmek icin. */
  trustProxy: process.env.TRUST_PROXY ?? (isProduction ? '1' : ''),

  /** ERP / PLM (Marpol PPM) entegrasyonu */
  erp: {
    enabled: process.env.ERP_ENABLED !== 'false',
    baseUrl: process.env.ERP_BASE_URL ?? 'http://localhost:4000/api',
    username: process.env.ERP_USERNAME ?? '',
    password: process.env.ERP_PASSWORD ?? '',
  },
};
