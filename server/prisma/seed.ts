/**
 * Marpol CRM - başlangıç verisi.
 *
 * Amaç: sistemin her ekranının gerçekçi veriyle açılması. Veri seti bilinçli
 * olarak RFM segmentlerinin hepsini (Champion, Düzenli, Risk Altında,
 * Kaybedilmiş, Yeni, Potansiyel) örnekleyecek şekilde kurgulanmıştır.
 *
 * Çalıştırma:  npm run seed
 */

import bcrypt from 'bcryptjs';
import {
  AssetStatus,
  ComplianceStatus,
  ContractStatus,
  ContractType,
  Criticality,
  CustomerStatus,
  DocumentType,
  InteractionType,
  ModuleKey,
  NegotiationStyle,
  OpportunityStage,
  OrderStatus,
  PriceSensitivity,
  PriceSensitivity as PS,
  PrismaClient,
  QuoteStatus,
  RateKind,
  RuleSeverity,
  RuleType,
  Sentiment,
  StakeholderDepartment,
  StakeholderRole,
  TaskStatus,
  TicketStatus,
  TicketType,
} from '@prisma/client';

const prisma = new PrismaClient();

/** Bugünden N gün önce / sonra. */
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000);

const ALL_MODULES = Object.values(ModuleKey);

/** Verilen modüllere tam yetki, diğerlerine hiç yetki vermeyen matris. */
function grant(modules: ModuleKey[], opts: { approve?: boolean; readOnly?: ModuleKey[] } = {}) {
  return ALL_MODULES.filter((m) => modules.includes(m) || opts.readOnly?.includes(m)).map((module) => {
    const readOnly = opts.readOnly?.includes(module) && !modules.includes(module);
    return {
      module,
      canView: true,
      canCreate: !readOnly,
      canEdit: !readOnly,
      canDelete: false,
      canApprove: !readOnly && Boolean(opts.approve),
    };
  });
}

async function main() {
  console.log('[SEED] Mevcut veriler temizleniyor...');

  // Bağımlılık sırasına göre temizlik (cascade olmayanlar için).
  await prisma.auditLog.deleteMany();
  await prisma.servicePart.deleteMany();
  await prisma.serviceVisit.deleteMany();
  await prisma.serviceTicket.deleteMany();
  await prisma.installedAsset.deleteMany();
  await prisma.engineeringHandover.deleteMany();
  await prisma.erpLink.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.specRequirement.deleteMany();
  await prisma.specDocument.deleteMany();
  await prisma.document.deleteMany();
  await prisma.contractVersion.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.bomLine.deleteMany();
  await prisma.laborLine.deleteMany();
  await prisma.quoteItemOption.deleteMany();
  await prisma.quoteItem.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.opportunityStakeholder.deleteMany();
  await prisma.opportunityStageHistory.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.task.deleteMany();
  await prisma.interaction.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.configRule.deleteMany();
  await prisma.productOption.deleteMany();
  await prisma.optionGroup.deleteMany();
  await prisma.product.deleteMany();
  await prisma.materialPriceHistory.deleteMany();
  await prisma.material.deleteMany();
  await prisma.laborRate.deleteMany();
  await prisma.pricingPolicy.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.user.deleteMany();

  // -------------------------------------------------------------------------
  // Kullanıcılar ve yetkiler
  // -------------------------------------------------------------------------
  console.log('[SEED] Kullanicilar...');

  const hash = (pw: string) => bcrypt.hash(pw, 10);

  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash: await hash('Marpol2026!'),
      fullName: 'Sistem Yöneticisi',
      employeeNo: 'MRP-001',
      department: 'Bilgi İşlem',
      title: 'Sistem Yöneticisi',
      email: 'admin@marpol.com',
      isAdmin: true,
      maxDiscountPct: 100,
    },
  });

  const manager = await prisma.user.create({
    data: {
      username: 'ayse.yilmaz',
      passwordHash: await hash('Marpol2026!'),
      fullName: 'Ayşe Yılmaz',
      employeeNo: 'MRP-014',
      department: 'Satış',
      title: 'Satış Müdürü',
      email: 'ayse.yilmaz@marpol.com',
      phone: '+90 532 000 00 14',
      // Müdür yüksek iskonto onaylayabilir.
      maxDiscountPct: 20,
      permissions: {
        create: grant(
          [
            ModuleKey.GOSTERGE_PANELI,
            ModuleKey.MUSTERILER,
            ModuleKey.FIRSATLAR,
            ModuleKey.TEKLIFLER,
            ModuleKey.SIPARISLER,
            ModuleKey.DOKUMANLAR,
            ModuleKey.SOZLESMELER,
            ModuleKey.RAPORLAR,
          ],
          { approve: true, readOnly: [ModuleKey.URUN_KATALOGU, ModuleKey.FIYATLANDIRMA, ModuleKey.SAHA_SERVIS] },
        ),
      },
    },
  });

  const rep = await prisma.user.create({
    data: {
      username: 'cem.aydin',
      passwordHash: await hash('Marpol2026!'),
      fullName: 'Cem Aydın',
      employeeNo: 'MRP-027',
      department: 'Satış',
      title: 'Satış Temsilcisi',
      email: 'cem.aydin@marpol.com',
      phone: '+90 532 000 00 27',
      // Temsilci yalnızca %5'e kadar iskonto verebilir; üstü onaya düşer.
      maxDiscountPct: 5,
      permissions: {
        create: grant(
          [ModuleKey.GOSTERGE_PANELI, ModuleKey.MUSTERILER, ModuleKey.FIRSATLAR, ModuleKey.TEKLIFLER],
          { readOnly: [ModuleKey.SIPARISLER, ModuleKey.URUN_KATALOGU, ModuleKey.DOKUMANLAR] },
        ),
      },
    },
  });

  const serviceChief = await prisma.user.create({
    data: {
      username: 'burak.sen',
      passwordHash: await hash('Marpol2026!'),
      fullName: 'Burak Şen',
      employeeNo: 'MRP-041',
      department: 'Satış Sonrası Hizmetler',
      title: 'Saha Servis Şefi',
      email: 'burak.sen@marpol.com',
      phone: '+90 532 000 00 41',
      maxDiscountPct: 10,
      permissions: {
        create: grant([ModuleKey.GOSTERGE_PANELI, ModuleKey.SAHA_SERVIS], {
          approve: true,
          readOnly: [ModuleKey.MUSTERILER, ModuleKey.SIPARISLER, ModuleKey.SOZLESMELER],
        }),
      },
    },
  });

  // -------------------------------------------------------------------------
  // Fiyat politikaları
  // -------------------------------------------------------------------------
  console.log('[SEED] Fiyat politikalari, hammaddeler, ucretler...');

  const standardPolicy = await prisma.pricingPolicy.create({
    data: {
      code: 'STD',
      name: 'Standart Politika',
      overheadPct: 12,
      engineeringPct: 8,
      contingencyPct: 5,
      targetMarginPct: 28,
      minMarginPct: 15,
      isDefault: true,
      notes: 'Seri ve yarı özel ürünler için varsayılan politika.',
    },
  });

  await prisma.pricingPolicy.create({
    data: {
      code: 'PRJ',
      name: 'Anahtar Teslim Proje',
      overheadPct: 15,
      engineeringPct: 18,
      contingencyPct: 10,
      targetMarginPct: 22,
      minMarginPct: 12,
      notes: 'Uzun süreli, yüksek mühendislik içeren projeler için.',
    },
  });

  // -------------------------------------------------------------------------
  // Hammaddeler
  // -------------------------------------------------------------------------
  const materialSeed = [
    { code: 'HM-001', name: 'Paslanmaz Sac AISI 304 (2 mm)', category: 'Sac', unit: 'kg', currentPrice: 182.5, scrapPct: 8, supplier: 'Erdemir Servis' },
    { code: 'HM-002', name: 'Paslanmaz Sac AISI 316L (3 mm)', category: 'Sac', unit: 'kg', currentPrice: 268.0, scrapPct: 8, supplier: 'Erdemir Servis' },
    { code: 'HM-003', name: 'St37 Karbon Çelik Profil', category: 'Profil', unit: 'kg', currentPrice: 46.9, scrapPct: 6, supplier: 'Çolakoğlu' },
    { code: 'HM-004', name: 'Alüminyum Sigma Profil 45x45', category: 'Profil', unit: 'm', currentPrice: 415.0, scrapPct: 4, supplier: 'Sistem Alüminyum' },
    { code: 'HM-005', name: 'Redüktörlü Motor 1.5 kW', category: 'Tahrik', unit: 'adet', currentPrice: 12_450.0, supplier: 'SEW Eurodrive' },
    { code: 'HM-006', name: 'Redüktörlü Motor 4 kW', category: 'Tahrik', unit: 'adet', currentPrice: 24_800.0, supplier: 'SEW Eurodrive' },
    { code: 'HM-007', name: 'Paslanmaz Santrifüj Pompa', category: 'Pompa', unit: 'adet', currentPrice: 38_600.0, supplier: 'Grundfos' },
    { code: 'HM-008', name: 'PLC Kontrol Ünitesi (Siemens S7-1200)', category: 'Otomasyon', unit: 'adet', currentPrice: 31_200.0, supplier: 'Siemens Türkiye' },
    { code: 'HM-009', name: 'HMI Dokunmatik Panel 10"', category: 'Otomasyon', unit: 'adet', currentPrice: 18_900.0, supplier: 'Siemens Türkiye' },
    { code: 'HM-010', name: 'Frekans Konvertörü 4 kW', category: 'Otomasyon', unit: 'adet', currentPrice: 14_300.0, supplier: 'Danfoss' },
    { code: 'HM-011', name: 'Endüstriyel Rulman Seti', category: 'Mekanik', unit: 'set', currentPrice: 4_850.0, scrapPct: 2, supplier: 'SKF' },
    { code: 'HM-012', name: 'Epoksi Boya (Endüstriyel)', category: 'Sarf', unit: 'kg', currentPrice: 620.0, scrapPct: 12, supplier: 'Marshall' },
    { code: 'HM-013', name: 'Paslanmaz Filtre Plakası', category: 'Filtrasyon', unit: 'adet', currentPrice: 8_750.0, scrapPct: 3, supplier: 'Yerli imalat' },
    { code: 'HM-014', name: 'Hidrolik Güç Ünitesi', category: 'Hidrolik', unit: 'adet', currentPrice: 56_400.0, supplier: 'Bosch Rexroth' },
    { code: 'HM-015', name: 'Dozaj Pompası (Membran)', category: 'Pompa', unit: 'adet', currentPrice: 22_100.0, supplier: 'ProMinent' },
  ];

  const materials: Record<string, { id: string; currentPrice: number }> = {};
  for (const m of materialSeed) {
    const created = await prisma.material.create({
      data: {
        ...m,
        priceHistory: {
          create: [
            // Bir önceki fiyat kademesi de tarihçeye yazılır (fiyat trendi görünsün).
            { price: Math.round(m.currentPrice * 0.88 * 100) / 100, validFrom: daysAgo(210), source: 'Yıllık liste' },
            { price: m.currentPrice, validFrom: daysAgo(35), source: 'Tedarikçi zammı' },
          ],
        },
      },
    });
    materials[m.code] = { id: created.id, currentPrice: created.currentPrice };
  }

  // -------------------------------------------------------------------------
  // İşçilik ve mühendislik ücretleri
  // -------------------------------------------------------------------------
  const rateSeed = [
    { code: 'IS-KAY', name: 'Kaynakçı (TIG/MIG)', kind: RateKind.ISCILIK, hourlyRate: 780 },
    { code: 'IS-MON', name: 'Mekanik Montaj', kind: RateKind.ISCILIK, hourlyRate: 690 },
    { code: 'IS-CNC', name: 'CNC Talaşlı İmalat', kind: RateKind.ISCILIK, hourlyRate: 950 },
    { code: 'IS-ELK', name: 'Elektrik Pano Montaj', kind: RateKind.ISCILIK, hourlyRate: 840 },
    { code: 'MH-MEK', name: 'Mekanik Tasarım', kind: RateKind.MUHENDISLIK, hourlyRate: 1_650 },
    { code: 'MH-ELK', name: 'Elektrik / Otomasyon Tasarım', kind: RateKind.MUHENDISLIK, hourlyRate: 1_820 },
    { code: 'MH-YAZ', name: 'PLC / SCADA Yazılım', kind: RateKind.MUHENDISLIK, hourlyRate: 1_950 },
    { code: 'MH-PRJ', name: 'Proje Yönetimi', kind: RateKind.MUHENDISLIK, hourlyRate: 1_450 },
    { code: 'SV-TEK', name: 'Saha Servis Teknisyeni', kind: RateKind.SAHA_SERVIS, hourlyRate: 1_120 },
    { code: 'SV-DEV', name: 'Devreye Alma Mühendisi', kind: RateKind.SAHA_SERVIS, hourlyRate: 1_780 },
  ];

  const rates: Record<string, { id: string; hourlyRate: number }> = {};
  for (const r of rateSeed) {
    const created = await prisma.laborRate.create({ data: r });
    rates[r.code] = { id: created.id, hourlyRate: created.hourlyRate };
  }

  // -------------------------------------------------------------------------
  // Ürünler + konfigüratör (seçenekler ve kısıtlama kuralları)
  // -------------------------------------------------------------------------
  console.log('[SEED] Urun katalogu ve konfigurator kurallari...');

  /** BOM + işçilik satırlarını ürüne bağlayan yardımcı. */
  async function attachCost(
    productId: string,
    bom: { code: string; qty: number; unit?: string }[],
    labor: { code: string; hours: number; description?: string }[],
  ) {
    for (const [i, line] of bom.entries()) {
      const material = materials[line.code];
      await prisma.bomLine.create({
        data: {
          productId,
          materialId: material.id,
          description: materialSeed.find((m) => m.code === line.code)!.name,
          quantity: line.qty,
          unit: line.unit ?? materialSeed.find((m) => m.code === line.code)!.unit,
          unitCost: material.currentPrice,
          lineCost: material.currentPrice * line.qty,
          sortOrder: i,
        },
      });
    }
    for (const [i, line] of labor.entries()) {
      const rate = rates[line.code];
      await prisma.laborLine.create({
        data: {
          productId,
          rateId: rate.id,
          description: line.description ?? rateSeed.find((r) => r.code === line.code)!.name,
          hours: line.hours,
          hourlyRate: rate.hourlyRate,
          lineCost: rate.hourlyRate * line.hours,
          sortOrder: i,
        },
      });
    }
  }

  // --- Ürün 1: Konveyörlü Yıkama Makinesi (tam konfigüre edilebilir) ---
  const washer = await prisma.product.create({
    data: {
      code: 'MRP-KYM',
      name: 'Konveyörlü Endüstriyel Yıkama Makinesi',
      family: 'Yıkama Sistemleri',
      description: 'Sürekli hatlar için tünel tipi yıkama makinesi. Gövde, tahrik ve otomasyon seviyesi siparişe özel yapılandırılır.',
      unit: 'adet',
      baseCost: 85_000,
      leadTimeDays: 75,
    },
  });

  const washerGroups = await Promise.all([
    prisma.optionGroup.create({
      data: {
        productId: washer.id,
        code: 'GOVDE',
        name: 'Gövde Malzemesi',
        isRequired: true,
        sortOrder: 1,
        helpText: 'Gıda ve kimya uygulamalarında 316L zorunludur.',
        options: {
          create: [
            { code: 'GOVDE-304', name: 'AISI 304 Paslanmaz', costDelta: 0, isDefault: true, sortOrder: 1 },
            { code: 'GOVDE-316L', name: 'AISI 316L Paslanmaz', costDelta: 74_500, leadTimeDelta: 10, sortOrder: 2 },
            { code: 'GOVDE-ST37', name: 'Boyalı Karbon Çelik', costDelta: -38_000, sortOrder: 3 },
          ],
        },
      },
    }),
    prisma.optionGroup.create({
      data: {
        productId: washer.id,
        code: 'TAHRIK',
        name: 'Konveyör Tahrik Gücü',
        isRequired: true,
        sortOrder: 2,
        options: {
          create: [
            { code: 'TAHRIK-15', name: '1.5 kW Redüktörlü Motor', costDelta: 0, isDefault: true, sortOrder: 1 },
            { code: 'TAHRIK-40', name: '4 kW Redüktörlü Motor', costDelta: 12_350, laborHours: 4, sortOrder: 2 },
          ],
        },
      },
    }),
    prisma.optionGroup.create({
      data: {
        productId: washer.id,
        code: 'OTOM',
        name: 'Otomasyon Seviyesi',
        isRequired: true,
        sortOrder: 3,
        options: {
          create: [
            { code: 'OTOM-MAN', name: 'Manuel Kumanda', costDelta: 0, sortOrder: 1 },
            { code: 'OTOM-PLC', name: 'PLC + HMI Panel', costDelta: 50_100, laborHours: 18, leadTimeDelta: 12, isDefault: true, sortOrder: 2 },
            { code: 'OTOM-SCADA', name: 'PLC + SCADA Uzak İzleme', costDelta: 96_400, laborHours: 40, leadTimeDelta: 25, sortOrder: 3 },
          ],
        },
      },
    }),
    prisma.optionGroup.create({
      data: {
        productId: washer.id,
        code: 'SICAK',
        name: 'Sıcak Su / Buhar Modülü',
        isRequired: false,
        sortOrder: 4,
        options: {
          create: [
            { code: 'SICAK-YOK', name: 'Yok (soğuk yıkama)', costDelta: 0, sortOrder: 1 },
            { code: 'SICAK-90C', name: '90°C Sıcak Su Modülü', costDelta: 41_800, leadTimeDelta: 15, sortOrder: 2 },
          ],
        },
      },
    }),
    prisma.optionGroup.create({
      data: {
        productId: washer.id,
        code: 'EKS',
        name: 'Ek Donanımlar',
        isRequired: false,
        isMultiple: true,
        sortOrder: 5,
        options: {
          create: [
            { code: 'EKS-KURUT', name: 'Havalı Kurutma Bölümü', costDelta: 62_000, leadTimeDelta: 18, sortOrder: 1 },
            { code: 'EKS-FILTRE', name: 'Otomatik Su Filtrasyonu', costDelta: 34_500, sortOrder: 2 },
            { code: 'EKS-CE', name: 'CE Sertifikasyon Dosyası', costDelta: 18_500, priceDelta: 6_000, leadTimeDelta: 20, sortOrder: 3 },
          ],
        },
      },
    }),
  ]);

  // Kısıtlama kuralları: mühendislik açısından imkânsız / riskli kombinasyonlar.
  await prisma.configRule.createMany({
    data: [
      {
        productId: washer.id,
        code: 'KR-01',
        name: 'Sıcak su modülü karbon çelik gövdeyle kullanılamaz',
        type: RuleType.ENGELLER,
        severity: RuleSeverity.ENGELLE,
        whenOptions: ['SICAK-90C'],
        thenOptions: ['GOVDE-ST37'],
        message:
          '90°C sıcak su modülü boyalı karbon çelik gövdeyle üretilemez: boya dayanımı yetersiz, korozyon riski var. Gövdeyi 304 veya 316L seçin.',
      },
      {
        productId: washer.id,
        code: 'KR-02',
        name: 'SCADA için PLC altyapısı zorunlu',
        type: RuleType.GEREKTIRIR,
        severity: RuleSeverity.ENGELLE,
        whenOptions: ['EKS-KURUT'],
        thenOptions: ['OTOM-PLC'],
        message:
          'Havalı kurutma bölümü sıcaklık ve fan kontrolü gerektirir; manuel kumanda ile üretilemez. Otomasyon seviyesini PLC + HMI olarak seçin.',
      },
      {
        productId: washer.id,
        code: 'KR-03',
        name: 'Kurutma bölümü yüksek tahrik gücü ister',
        type: RuleType.UYARIR,
        severity: RuleSeverity.UYAR,
        whenOptions: ['EKS-KURUT', 'TAHRIK-15'],
        thenOptions: [],
        message:
          'Kurutma bölümü eklendiğinde 1.5 kW tahrik hat hızını sınırlar. 4 kW motor önerilir; müşteri kapasite beklentisini teyit edin.',
      },
      {
        productId: washer.id,
        code: 'KR-04',
        name: 'CE dosyası karbon çelik gövdede ek test gerektirir',
        type: RuleType.UYARIR,
        severity: RuleSeverity.UYAR,
        whenOptions: ['EKS-CE', 'GOVDE-ST37'],
        thenOptions: [],
        message:
          'Karbon çelik gövdede CE dosyası için ilave yüzey ve hijyen testi gerekir; termin 3 hafta uzayabilir.',
      },
    ],
  });

  await attachCost(
    washer.id,
    [
      { code: 'HM-001', qty: 620 },
      { code: 'HM-003', qty: 380 },
      { code: 'HM-005', qty: 1 },
      { code: 'HM-011', qty: 4 },
      { code: 'HM-012', qty: 25 },
    ],
    [
      { code: 'IS-KAY', hours: 96 },
      { code: 'IS-MON', hours: 120 },
      { code: 'IS-ELK', hours: 48 },
      { code: 'MH-MEK', hours: 60 },
      { code: 'MH-PRJ', hours: 30 },
    ],
  );

  // --- Ürün 2: Paslanmaz Proses Tankı ---
  const tank = await prisma.product.create({
    data: {
      code: 'MRP-PPT',
      name: 'Paslanmaz Proses Tankı',
      family: 'Proses Ekipmanları',
      description: 'Karıştırıcılı, ceketli veya ceketsiz proses tankı. Hacim ve yüzey kalitesi siparişe özel.',
      unit: 'adet',
      baseCost: 42_000,
      leadTimeDays: 45,
    },
  });

  await Promise.all([
    prisma.optionGroup.create({
      data: {
        productId: tank.id,
        code: 'HACIM',
        name: 'Hacim',
        isRequired: true,
        sortOrder: 1,
        options: {
          create: [
            { code: 'HACIM-1000', name: '1.000 litre', costDelta: 0, isDefault: true, sortOrder: 1 },
            { code: 'HACIM-3000', name: '3.000 litre', costDelta: 68_000, leadTimeDelta: 12, sortOrder: 2 },
            { code: 'HACIM-6000', name: '6.000 litre', costDelta: 152_000, leadTimeDelta: 25, sortOrder: 3 },
          ],
        },
      },
    }),
    prisma.optionGroup.create({
      data: {
        productId: tank.id,
        code: 'CEKET',
        name: 'Isıtma / Soğutma Ceketi',
        isRequired: true,
        sortOrder: 2,
        options: {
          create: [
            { code: 'CEKET-YOK', name: 'Ceketsiz', costDelta: 0, isDefault: true, sortOrder: 1 },
            { code: 'CEKET-YARIM', name: 'Yarım Boru Ceket', costDelta: 46_500, leadTimeDelta: 10, sortOrder: 2 },
            { code: 'CEKET-TAM', name: 'Tam Ceket (dimple)', costDelta: 78_000, leadTimeDelta: 18, sortOrder: 3 },
          ],
        },
      },
    }),
    prisma.optionGroup.create({
      data: {
        productId: tank.id,
        code: 'YUZEY',
        name: 'İç Yüzey Kalitesi',
        isRequired: true,
        sortOrder: 3,
        options: {
          create: [
            { code: 'YUZEY-STD', name: 'Standart (Ra 1.6)', costDelta: 0, isDefault: true, sortOrder: 1 },
            { code: 'YUZEY-GIDA', name: 'Gıda Sınıfı Parlatma (Ra 0.8)', costDelta: 32_400, leadTimeDelta: 8, sortOrder: 2 },
            { code: 'YUZEY-FARMA', name: 'Farma Sınıfı (Ra 0.4 + elektropolisaj)', costDelta: 87_000, leadTimeDelta: 20, sortOrder: 3 },
          ],
        },
      },
    }),
  ]);

  await prisma.configRule.createMany({
    data: [
      {
        productId: tank.id,
        code: 'TR-01',
        name: 'Farma yüzey 6.000 litrede üretilemez',
        type: RuleType.ENGELLER,
        severity: RuleSeverity.ENGELLE,
        whenOptions: ['YUZEY-FARMA'],
        thenOptions: ['HACIM-6000'],
        message:
          'Elektropolisaj banyomuz 6.000 litre gövdeyi almıyor. Farma sınıfı yüzey en fazla 3.000 litre tankta üretilebilir.',
      },
      {
        productId: tank.id,
        code: 'TR-02',
        name: 'Tam ceket + 6.000 litre nakliye uyarısı',
        type: RuleType.UYARIR,
        severity: RuleSeverity.UYAR,
        whenOptions: ['CEKET-TAM', 'HACIM-6000'],
        thenOptions: [],
        message:
          'Tam ceketli 6.000 litre tank gabari sınırını aşar; özel nakliye izni ve vinç planlaması gerekir. Teslimat maliyetini teyit edin.',
      },
    ],
  });

  await attachCost(
    tank.id,
    [
      { code: 'HM-002', qty: 480 },
      { code: 'HM-003', qty: 120 },
      { code: 'HM-011', qty: 2 },
    ],
    [
      { code: 'IS-KAY', hours: 72 },
      { code: 'IS-MON', hours: 40 },
      { code: 'MH-MEK', hours: 32 },
    ],
  );

  // --- Ürün 3: Dozajlama Ünitesi ---
  const dosing = await prisma.product.create({
    data: {
      code: 'MRP-DOZ',
      name: 'Otomatik Kimyasal Dozajlama Ünitesi',
      family: 'Proses Ekipmanları',
      description: 'Çok hatlı membran pompalı dozaj ünitesi, PLC kontrollü.',
      unit: 'adet',
      baseCost: 28_500,
      leadTimeDays: 40,
    },
  });

  await prisma.optionGroup.create({
    data: {
      productId: dosing.id,
      code: 'HAT',
      name: 'Dozaj Hattı Sayısı',
      isRequired: true,
      sortOrder: 1,
      options: {
        create: [
          { code: 'HAT-2', name: '2 Hat', costDelta: 0, isDefault: true, sortOrder: 1 },
          { code: 'HAT-4', name: '4 Hat', costDelta: 44_200, laborHours: 12, sortOrder: 2 },
          { code: 'HAT-6', name: '6 Hat', costDelta: 88_400, laborHours: 24, leadTimeDelta: 10, sortOrder: 3 },
        ],
      },
    },
  });

  await attachCost(
    dosing.id,
    [
      { code: 'HM-015', qty: 2 },
      { code: 'HM-008', qty: 1 },
      { code: 'HM-004', qty: 12 },
    ],
    [
      { code: 'IS-MON', hours: 36 },
      { code: 'IS-ELK', hours: 24 },
      { code: 'MH-ELK', hours: 20 },
      { code: 'MH-YAZ', hours: 24 },
    ],
  );

  // --- Ürün 4: Filtre Presi ---
  const filterPress = await prisma.product.create({
    data: {
      code: 'MRP-FPR',
      name: 'Hidrolik Filtre Presi',
      family: 'Filtrasyon Sistemleri',
      description: 'Atık su ve proses çamuru için plakalı filtre presi.',
      unit: 'adet',
      baseCost: 96_000,
      leadTimeDays: 90,
    },
  });

  await prisma.optionGroup.create({
    data: {
      productId: filterPress.id,
      code: 'PLAKA',
      name: 'Plaka Sayısı',
      isRequired: true,
      sortOrder: 1,
      options: {
        create: [
          { code: 'PLAKA-20', name: '20 Plaka', costDelta: 0, isDefault: true, sortOrder: 1 },
          { code: 'PLAKA-40', name: '40 Plaka', costDelta: 175_000, leadTimeDelta: 20, sortOrder: 2 },
        ],
      },
    },
  });

  await attachCost(
    filterPress.id,
    [
      { code: 'HM-013', qty: 20 },
      { code: 'HM-014', qty: 1 },
      { code: 'HM-003', qty: 850 },
    ],
    [
      { code: 'IS-KAY', hours: 120 },
      { code: 'IS-MON', hours: 160 },
      { code: 'MH-MEK', hours: 80 },
      { code: 'MH-PRJ', hours: 40 },
    ],
  );

  // -------------------------------------------------------------------------
  // Müşteriler, kişiler (paydaş haritası), etkileşimler
  // -------------------------------------------------------------------------
  console.log('[SEED] Musteriler ve paydas haritalari...');

  /** Müşteri + kişileri tek seferde oluşturan yardımcı. */
  async function createCustomer(input: {
    name: string;
    shortName: string;
    industry: string;
    city: string;
    status: CustomerStatus;
    phone: string;
    email: string;
    negotiationStyle: NegotiationStyle;
    priceSensitivity: PriceSensitivity;
    notes: string;
    behaviorNotes: string;
    competitors?: string;
    standardDiscountPct?: number;
    paymentTerms?: string;
    ownerId: string;
    createdAt: Date;
    contacts: {
      fullName: string;
      title: string;
      email: string;
      phone: string;
      department: StakeholderDepartment;
      role: StakeholderRole;
      influence: number;
      sentiment: Sentiment;
      negotiationStyle?: NegotiationStyle;
      priceSensitivity?: PriceSensitivity;
      responsiveness?: string;
      notes: string;
      isPrimary?: boolean;
      /** Bağlı olduğu kişinin listedeki sırası (hiyerarşi) */
      reportsToIndex?: number;
    }[];
  }) {
    const count = await prisma.customer.count();
    const customer = await prisma.customer.create({
      data: {
        code: `MST-${String(count + 1).padStart(4, '0')}`,
        name: input.name,
        shortName: input.shortName,
        industry: input.industry,
        city: input.city,
        country: 'Türkiye',
        status: input.status,
        phone: input.phone,
        email: input.email,
        negotiationStyle: input.negotiationStyle,
        priceSensitivity: input.priceSensitivity,
        notes: input.notes,
        behaviorNotes: input.behaviorNotes,
        competitors: input.competitors,
        standardDiscountPct: input.standardDiscountPct ?? 0,
        paymentTerms: input.paymentTerms ?? '60 gün vadeli',
        deliveryTerms: 'DAP - müşteri sahası',
        ownerId: input.ownerId,
        createdAt: input.createdAt,
      },
    });

    const created: { id: string; fullName: string }[] = [];
    for (const c of input.contacts) {
      const contact = await prisma.contact.create({
        data: {
          customerId: customer.id,
          fullName: c.fullName,
          title: c.title,
          email: c.email,
          phone: c.phone,
          department: c.department,
          role: c.role,
          influence: c.influence,
          sentiment: c.sentiment,
          negotiationStyle: c.negotiationStyle,
          priceSensitivity: c.priceSensitivity,
          responsiveness: c.responsiveness,
          notes: c.notes,
          isPrimary: c.isPrimary ?? false,
          reportsToId:
            c.reportsToIndex !== undefined ? created[c.reportsToIndex]?.id ?? null : null,
        },
      });
      created.push({ id: contact.id, fullName: contact.fullName });
    }

    return { customer, contacts: created };
  }

  const anadolu = await createCustomer({
    name: 'Anadolu Gıda Sanayi A.Ş.',
    shortName: 'Anadolu Gıda',
    industry: 'Gıda',
    city: 'Konya',
    status: CustomerStatus.AKTIF,
    phone: '+90 332 248 10 00',
    email: 'info@anadolugida.com.tr',
    negotiationStyle: NegotiationStyle.ILISKI_ODAKLI,
    priceSensitivity: PS.ORTA,
    notes: 'Grubun 3 tesisi var (Konya, Karaman, Aksaray). Yatırım kararları merkezi alınır.',
    behaviorNotes:
      'Fiyattan çok teslim süresine ve servis hızına bakıyorlar. Son 3 projede pazarlık %4-6 iskonto ile kapandı; sert pazarlık yapmıyorlar ama referans ziyareti istiyorlar.',
    competitors: 'Ecomak, İtalyan Tecninox',
    standardDiscountPct: 4,
    ownerId: manager.id,
    createdAt: daysAgo(1_180),
    contacts: [
      {
        fullName: 'Mehmet Korkmaz',
        title: 'Fabrika Müdürü',
        email: 'm.korkmaz@anadolugida.com.tr',
        phone: '+90 532 111 22 01',
        department: StakeholderDepartment.UST_YONETIM,
        role: StakeholderRole.KARAR_VERICI,
        influence: 5,
        sentiment: Sentiment.DESTEKLIYOR,
        negotiationStyle: NegotiationStyle.ILISKI_ODAKLI,
        priceSensitivity: PS.DUSUK,
        responsiveness: 'Aynı gün döner, telefonu tercih ediyor.',
        notes:
          'Marpol ile 2019\'dan beri çalışıyor. Teknik detaya girmez, "bana çalışan bir hat teslim edin" yaklaşımı. Referans ziyaretlerine açık.',
        isPrimary: true,
      },
      {
        fullName: 'Elif Şahin',
        title: 'Proje Mühendisi',
        email: 'e.sahin@anadolugida.com.tr',
        phone: '+90 532 111 22 02',
        department: StakeholderDepartment.MUHENDISLIK,
        role: StakeholderRole.TEKNIK_ONAYCI,
        influence: 4,
        sentiment: Sentiment.DESTEKLIYOR,
        negotiationStyle: NegotiationStyle.ANALITIK,
        responsiveness: 'E-posta ile 1-2 gün içinde detaylı döner.',
        notes:
          'Şartnameyi madde madde kontrol eder. Teknik dokümantasyon eksikse teklifi geri çevirir. 316L ve gıda sınıfı yüzey konusunda hassas.',
        reportsToIndex: 0,
      },
      {
        fullName: 'Serkan Doğan',
        title: 'Satın Alma Uzmanı',
        email: 's.dogan@anadolugida.com.tr',
        phone: '+90 532 111 22 03',
        department: StakeholderDepartment.SATIN_ALMA,
        role: StakeholderRole.KAPI_BEKCISI,
        influence: 3,
        sentiment: Sentiment.NOTR,
        negotiationStyle: NegotiationStyle.FIYAT_ODAKLI,
        priceSensitivity: PS.YUKSEK,
        responsiveness: 'Yalnızca resmi yazışmaya cevap veriyor.',
        notes:
          'Her teklifte en az 3 firmadan fiyat toplar ve karşılaştırma tablosu yapar. Ödeme vadesini uzatmaya çalışır.',
        reportsToIndex: 0,
      },
    ],
  });

  const egeKimya = await createCustomer({
    name: 'Ege Kimya Endüstri Ltd. Şti.',
    shortName: 'Ege Kimya',
    industry: 'Kimya',
    city: 'İzmir',
    status: CustomerStatus.AKTIF,
    phone: '+90 232 877 40 00',
    email: 'satinalma@egekimya.com',
    negotiationStyle: NegotiationStyle.REKABETCI,
    priceSensitivity: PS.YUKSEK,
    notes: 'Aliağa OSB\'de iki tesis. ATEX gerektiren bölgeler var.',
    behaviorNotes:
      'Çok sert pazarlık yapıyorlar; ilk tekliften ortalama %12 indirim koparmayı hedefliyorlar. Son teklifte rakip fiyatını açıkça masaya koydular. Teknik tavizde bulunmuyorlar, sadece fiyatta.',
    competitors: 'Ecomak, Alman GEA',
    standardDiscountPct: 6,
    paymentTerms: '90 gün vadeli',
    ownerId: rep.id,
    createdAt: daysAgo(860),
    contacts: [
      {
        fullName: 'Hakan Demirtaş',
        title: 'Satın Alma Müdürü',
        email: 'h.demirtas@egekimya.com',
        phone: '+90 533 222 33 01',
        department: StakeholderDepartment.SATIN_ALMA,
        role: StakeholderRole.EKONOMIK_ONAYCI,
        influence: 5,
        sentiment: Sentiment.NOTR,
        negotiationStyle: NegotiationStyle.REKABETCI,
        priceSensitivity: PS.YUKSEK,
        responsiveness: 'Hızlı döner ama hep karşı teklifle.',
        notes:
          'Pazarlıkta rakip fiyatını gösterme taktiğini kullanıyor. Son ana kadar imzayı bekletiyor. Toplam sahip olma maliyeti argümanına açık.',
        isPrimary: true,
      },
      {
        fullName: 'Deniz Arslan',
        title: 'Proses Mühendisi',
        email: 'd.arslan@egekimya.com',
        phone: '+90 533 222 33 02',
        department: StakeholderDepartment.MUHENDISLIK,
        role: StakeholderRole.TEKNIK_ONAYCI,
        influence: 4,
        sentiment: Sentiment.DESTEKLIYOR,
        negotiationStyle: NegotiationStyle.ANALITIK,
        notes:
          'Marpol ekipmanlarının saha performansından memnun. İç toplantılarda bizi savunuyor. Teknik şampiyonumuz.',
      },
      {
        fullName: 'Nurcan Ateş',
        title: 'Finans Direktörü',
        email: 'n.ates@egekimya.com',
        phone: '+90 533 222 33 03',
        department: StakeholderDepartment.FINANS,
        role: StakeholderRole.EKONOMIK_ONAYCI,
        influence: 4,
        sentiment: Sentiment.KARSIT,
        priceSensitivity: PS.YUKSEK,
        notes: 'Yatırım bütçesini sıkı tutuyor. 500 bin TL üstü harcamalarda ikinci imza onun.',
      },
    ],
  });

  const marmaraOtomotiv = await createCustomer({
    name: 'Marmara Otomotiv Yan Sanayi A.Ş.',
    shortName: 'Marmara Otomotiv',
    industry: 'Otomotiv',
    city: 'Bursa',
    status: CustomerStatus.AKTIF,
    phone: '+90 224 261 50 00',
    email: 'proje@marmaraotomotiv.com.tr',
    negotiationStyle: NegotiationStyle.ANALITIK,
    priceSensitivity: PS.ORTA,
    notes: 'OEM tedarikçisi. IATF 16949 kapsamında denetim ve dokümantasyon şartları ağır.',
    behaviorNotes:
      'Karar süreci uzun (6-9 ay) ve çok aşamalı. Teknik şartnameye birebir uyum bekliyorlar; sapma varsa yazılı gerekçe istiyorlar. Fiyat ikinci planda, sürdürülebilir kalite birinci.',
    competitors: 'Alman Dürr, İtalyan IFT',
    ownerId: manager.id,
    createdAt: daysAgo(640),
    contacts: [
      {
        fullName: 'Kemal Uysal',
        title: 'Üretim Direktörü',
        email: 'k.uysal@marmaraotomotiv.com.tr',
        phone: '+90 535 333 44 01',
        department: StakeholderDepartment.UST_YONETIM,
        role: StakeholderRole.KARAR_VERICI,
        influence: 5,
        sentiment: Sentiment.NOTR,
        negotiationStyle: NegotiationStyle.ANALITIK,
        responsiveness: 'Sadece planlı toplantılarda ulaşılabiliyor.',
        notes:
          'Veriyle konuşuyor: OEE, çevrim süresi, arıza istatistiği ister. Sunumda referans tesis verisi göstermek şart.',
        isPrimary: true,
      },
      {
        fullName: 'Zeynep Kaya',
        title: 'Kalite Müdürü',
        email: 'z.kaya@marmaraotomotiv.com.tr',
        phone: '+90 535 333 44 02',
        department: StakeholderDepartment.KALITE,
        role: StakeholderRole.TEKNIK_ONAYCI,
        influence: 5,
        sentiment: Sentiment.NOTR,
        notes:
          'IATF denetiminden sorumlu. Uygunluk matrisinde "kısmen karşılanıyor" gördüğü her maddeyi ayrı toplantıya taşıyor.',
        reportsToIndex: 0,
      },
      {
        fullName: 'Onur Bilgin',
        title: 'Bakım Şefi',
        email: 'o.bilgin@marmaraotomotiv.com.tr',
        phone: '+90 535 333 44 03',
        department: StakeholderDepartment.BAKIM,
        role: StakeholderRole.KULLANICI,
        influence: 3,
        sentiment: Sentiment.DESTEKLIYOR,
        notes: 'Yedek parça bulunabilirliği ve servis müdahale süresine bakıyor. Bizim SLA sürelerimizden memnun.',
        reportsToIndex: 0,
      },
    ],
  });

  const trakyaTekstil = await createCustomer({
    name: 'Trakya Tekstil Boya Apre San. A.Ş.',
    shortName: 'Trakya Tekstil',
    industry: 'Tekstil',
    city: 'Çorlu',
    status: CustomerStatus.AKTIF,
    phone: '+90 282 685 30 00',
    email: 'teknik@trakyatekstil.com',
    negotiationStyle: NegotiationStyle.FIYAT_ODAKLI,
    priceSensitivity: PS.YUKSEK,
    notes: 'Boyahane atık su hattı yenileme programında.',
    behaviorNotes:
      'Yatırımları erteleme eğilimi var; son 14 aydır teklif alıp karar vermiyorlar. Fiyat düşerse harekete geçiyorlar.',
    ownerId: rep.id,
    createdAt: daysAgo(1_450),
    contacts: [
      {
        fullName: 'İsmail Yıldırım',
        title: 'Teknik Müdür',
        email: 'i.yildirim@trakyatekstil.com',
        phone: '+90 536 444 55 01',
        department: StakeholderDepartment.MUHENDISLIK,
        role: StakeholderRole.KARAR_VERICI,
        influence: 4,
        sentiment: Sentiment.NOTR,
        negotiationStyle: NegotiationStyle.KACINGAN,
        priceSensitivity: PS.YUKSEK,
        responsiveness: 'Geç döner, takip gerektirir.',
        notes:
          'İlgili ama karar yetkisi bütçeye bağlı. "Gelecek yıl bütçeye koyacağız" cümlesini iki yıldır tekrarlıyor.',
        isPrimary: true,
      },
    ],
  });

  const karadenizIcecek = await createCustomer({
    name: 'Karadeniz İçecek ve Meşrubat A.Ş.',
    shortName: 'Karadeniz İçecek',
    industry: 'Gıda',
    city: 'Samsun',
    status: CustomerStatus.AKTIF,
    phone: '+90 362 266 70 00',
    email: 'yatirim@karadenizicecek.com',
    negotiationStyle: NegotiationStyle.ISBIRLIKCI,
    priceSensitivity: PS.DUSUK,
    notes: 'Yeni dolum hattı yatırımı devam ediyor. Hızlı büyüyen müşteri.',
    behaviorNotes:
      'Açık iletişim kuruyorlar; bütçelerini baştan paylaşıyorlar. Pazarlıkta karşılıklı taviz mantığı işliyor (fiyat karşılığı uzun vade).',
    standardDiscountPct: 3,
    ownerId: manager.id,
    createdAt: daysAgo(320),
    contacts: [
      {
        fullName: 'Gökhan Emre',
        title: 'Yatırım Müdürü',
        email: 'g.emre@karadenizicecek.com',
        phone: '+90 537 555 66 01',
        department: StakeholderDepartment.UST_YONETIM,
        role: StakeholderRole.KARAR_VERICI,
        influence: 5,
        sentiment: Sentiment.DESTEKLIYOR,
        negotiationStyle: NegotiationStyle.ISBIRLIKCI,
        priceSensitivity: PS.DUSUK,
        responsiveness: 'Çok hızlı, WhatsApp üzerinden de iletişim kuruyor.',
        notes: 'Şeffaf çalışıyor. Bütçe rakamını baştan söylüyor, karşılığında dürüst termin istiyor.',
        isPrimary: true,
      },
      {
        fullName: 'Pınar Toprak',
        title: 'Proses Sorumlusu',
        email: 'p.toprak@karadenizicecek.com',
        phone: '+90 537 555 66 02',
        department: StakeholderDepartment.URETIM,
        role: StakeholderRole.KULLANICI,
        influence: 3,
        sentiment: Sentiment.DESTEKLIYOR,
        notes: 'Operatör eğitimine önem veriyor. Devreye alma sırasında sahada birlikte çalışmak istiyor.',
        reportsToIndex: 0,
      },
    ],
  });

  const guneyMaden = await createCustomer({
    name: 'Güney Maden İşletmeleri A.Ş.',
    shortName: 'Güney Maden',
    industry: 'Madencilik',
    city: 'Adana',
    status: CustomerStatus.PASIF,
    phone: '+90 322 428 90 00',
    email: 'info@guneymaden.com.tr',
    negotiationStyle: NegotiationStyle.REKABETCI,
    priceSensitivity: PS.YUKSEK,
    notes: 'Son iki yıldır yeni yatırım yapmıyor. Mevcut ekipmanlar garanti dışı.',
    behaviorNotes:
      'İlişki 2023 sonunda soğudu: teslim gecikmesi yaşandı ve tazminat talep ettiler. Yeniden kazanım için üst yönetim ziyareti gerekiyor.',
    ownerId: rep.id,
    createdAt: daysAgo(1_620),
    contacts: [
      {
        fullName: 'Recep Aksoy',
        title: 'İşletme Müdürü',
        email: 'r.aksoy@guneymaden.com.tr',
        phone: '+90 538 666 77 01',
        department: StakeholderDepartment.UST_YONETIM,
        role: StakeholderRole.KARAR_VERICI,
        influence: 5,
        sentiment: Sentiment.KARSIT,
        notes:
          'Geçmiş gecikmeden dolayı mesafeli. Telefonlara dönmüyor. Yeniden kazanım için somut telafi önerisi gerekiyor.',
        isPrimary: true,
      },
    ],
  });

  const ankaraIlac = await createCustomer({
    name: 'Ankara İlaç Sanayi A.Ş.',
    shortName: 'Ankara İlaç',
    industry: 'İlaç',
    city: 'Ankara',
    status: CustomerStatus.POTANSIYEL,
    phone: '+90 312 354 20 00',
    email: 'teknik@ankarailac.com.tr',
    negotiationStyle: NegotiationStyle.ANALITIK,
    priceSensitivity: PS.DUSUK,
    notes: 'GMP tesisi. İlk temas fuarda kuruldu, henüz sipariş yok.',
    behaviorNotes:
      'Henüz pazarlık aşamasına gelinmedi. Validasyon dokümantasyonu (IQ/OQ/PQ) beklentisi çok yüksek.',
    ownerId: manager.id,
    createdAt: daysAgo(48),
    contacts: [
      {
        fullName: 'Dr. Ayla Ergün',
        title: 'Üretim Müdürü',
        email: 'a.ergun@ankarailac.com.tr',
        phone: '+90 539 777 88 01',
        department: StakeholderDepartment.URETIM,
        role: StakeholderRole.TEKNIK_ONAYCI,
        influence: 4,
        sentiment: Sentiment.NOTR,
        negotiationStyle: NegotiationStyle.ANALITIK,
        notes: 'GMP validasyon dokümantasyonu olmadan hiçbir tedarikçiyi listeye almıyor.',
        isPrimary: true,
      },
    ],
  });

  const konyaMakina = await createCustomer({
    name: 'Konya Makina Kalıp San. Tic. Ltd.',
    shortName: 'Konya Makina',
    industry: 'Makine İmalat',
    city: 'Konya',
    status: CustomerStatus.POTANSIYEL,
    phone: '+90 332 239 10 00',
    email: 'info@konyamakina.com',
    negotiationStyle: NegotiationStyle.FIYAT_ODAKLI,
    priceSensitivity: PS.YUKSEK,
    notes: 'Web sitesi üzerinden ulaştılar. Küçük ölçekli, bütçe kısıtlı.',
    behaviorNotes: 'Henüz davranış verisi yok. İlk teklif fiyat hassasiyetini gösterecek.',
    ownerId: rep.id,
    createdAt: daysAgo(12),
    contacts: [
      {
        fullName: 'Murat Çetin',
        title: 'Firma Sahibi',
        email: 'm.cetin@konyamakina.com',
        phone: '+90 541 888 99 01',
        department: StakeholderDepartment.UST_YONETIM,
        role: StakeholderRole.KARAR_VERICI,
        influence: 5,
        sentiment: Sentiment.NOTR,
        priceSensitivity: PS.YUKSEK,
        notes: 'Kararı tek başına veriyor. Fiyat odaklı, taksitli ödeme soruyor.',
        isPrimary: true,
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Etkileşim geçmişi
  // -------------------------------------------------------------------------
  console.log('[SEED] Etkilesim gecmisi ve gorevler...');

  const interactionSeed = [
    { customer: anadolu, contactIdx: 0, userId: manager.id, type: InteractionType.ZIYARET, subject: 'Karaman tesisi yerinde keşif', summary: 'Mevcut yıkama hattı incelendi, kapasite darboğazı doğrulandı.', outcome: 'Yeni hat için teklif hazırlanacak.', sentiment: Sentiment.DESTEKLIYOR, days: 62 },
    { customer: anadolu, contactIdx: 1, userId: manager.id, type: InteractionType.EPOSTA, subject: 'Teknik şartname revizyonu', summary: '316L gövde ve gıda sınıfı yüzey talebi netleşti.', outcome: 'Şartname Rev B olarak sisteme yüklendi.', sentiment: Sentiment.DESTEKLIYOR, days: 44 },
    { customer: anadolu, contactIdx: 2, userId: manager.id, type: InteractionType.TELEFON, subject: 'Ödeme vadesi görüşmesi', summary: '90 gün vade talebi geldi.', outcome: '60 gün + %2 peşin iskonto önerildi.', sentiment: Sentiment.NOTR, days: 21 },
    { customer: egeKimya, contactIdx: 0, userId: rep.id, type: InteractionType.TOPLANTI, subject: 'Fiyat pazarlığı 2. tur', summary: 'Rakip teklifi masaya kondu, %12 indirim talep edildi.', outcome: 'Kapsam daraltma alternatifi sunuldu.', sentiment: Sentiment.NOTR, days: 18 },
    { customer: egeKimya, contactIdx: 1, userId: rep.id, type: InteractionType.DEMO, subject: 'Referans tesis ziyareti', summary: 'Anadolu Gıda Konya tesisinde çalışan hat gösterildi.', outcome: 'Teknik ekip ikna oldu.', sentiment: Sentiment.DESTEKLIYOR, days: 33 },
    { customer: marmaraOtomotiv, contactIdx: 1, userId: manager.id, type: InteractionType.TOPLANTI, subject: 'IATF uygunluk matrisi değerlendirmesi', summary: '48 maddelik şartname madde madde gözden geçirildi.', outcome: '3 maddede sapma bildirildi, alternatif önerildi.', sentiment: Sentiment.NOTR, days: 27 },
    { customer: marmaraOtomotiv, contactIdx: 0, userId: manager.id, type: InteractionType.TEKLIF_SUNUMU, subject: 'Yönetim kuruluna teklif sunumu', summary: 'OEE ve çevrim süresi verileriyle sunum yapıldı.', outcome: 'Bütçe onayı için Q3 toplantısına alındı.', sentiment: Sentiment.NOTR, days: 15 },
    { customer: karadenizIcecek, contactIdx: 0, userId: manager.id, type: InteractionType.TOPLANTI, subject: 'Yeni dolum hattı kapsam toplantısı', summary: 'Bütçe 4,5 milyon TL olarak paylaşıldı.', outcome: 'Kapsamda 2 tank + dozaj ünitesi netleşti.', sentiment: Sentiment.DESTEKLIYOR, days: 9 },
    { customer: karadenizIcecek, contactIdx: 1, userId: serviceChief.id, type: InteractionType.SERVIS, subject: 'Operatör eğitimi planlaması', summary: 'Devreye alma sırasında 2 günlük eğitim talebi.', outcome: 'Eğitim teklife dahil edildi.', sentiment: Sentiment.DESTEKLIYOR, days: 5 },
    { customer: trakyaTekstil, contactIdx: 0, userId: rep.id, type: InteractionType.TELEFON, subject: 'Atık su projesi takip', summary: 'Bütçe onayı yine ertelendi.', outcome: 'Q4\'te tekrar aranacak.', sentiment: Sentiment.NOTR, days: 96 },
    { customer: guneyMaden, contactIdx: 0, userId: rep.id, type: InteractionType.TELEFON, subject: 'İlişki yenileme denemesi', summary: 'Görüşme sağlanamadı, mesaj bırakıldı.', outcome: 'Üst yönetim ziyareti planlanmalı.', sentiment: Sentiment.KARSIT, days: 142 },
    { customer: ankaraIlac, contactIdx: 0, userId: manager.id, type: InteractionType.FUAR, subject: 'İlk temas - Interpack fuarı', summary: 'Standda GMP uyumlu proses tankı ilgisi.', outcome: 'Validasyon dokümantasyonu örneği gönderilecek.', sentiment: Sentiment.NOTR, days: 41 },
    { customer: konyaMakina, contactIdx: 0, userId: rep.id, type: InteractionType.EPOSTA, subject: 'Web sitesi üzerinden gelen talep', summary: 'Küçük hacimli parça yıkama makinesi soruluyor.', outcome: 'İhtiyaç analizi görüşmesi ayarlanacak.', sentiment: Sentiment.NOTR, days: 10 },
  ];

  for (const i of interactionSeed) {
    await prisma.interaction.create({
      data: {
        customerId: i.customer.customer.id,
        contactId: i.customer.contacts[i.contactIdx]?.id ?? null,
        userId: i.userId,
        type: i.type,
        subject: i.subject,
        summary: i.summary,
        outcome: i.outcome,
        sentiment: i.sentiment,
        occurredAt: daysAgo(i.days),
      },
    });
  }

  // -------------------------------------------------------------------------
  // Görevler
  // -------------------------------------------------------------------------
  await prisma.task.createMany({
    data: [
      { customerId: anadolu.customer.id, assigneeId: manager.id, title: 'Ödeme vadesi için finans onayı al', description: '90 gün vade talebine karşı 60 gün + peşin iskonto önerisi netleştirilecek.', dueAt: daysAhead(3) },
      { customerId: egeKimya.customer.id, assigneeId: rep.id, title: 'Revize teklifi (Rev B) gönder', description: 'Kapsam daraltılmış alternatif fiyatlandırma sunulacak.', dueAt: daysAhead(1) },
      { customerId: marmaraOtomotiv.customer.id, assigneeId: manager.id, title: 'Sapma bildirilen 3 madde için teknik not hazırla', dueAt: daysAgo(2), status: TaskStatus.ACIK },
      { customerId: trakyaTekstil.customer.id, assigneeId: rep.id, title: 'Q4 bütçe görüşmesi için randevu al', dueAt: daysAhead(21) },
      { customerId: karadenizIcecek.customer.id, assigneeId: manager.id, title: 'Devreye alma takvimini müşteriyle teyit et', dueAt: daysAhead(7) },
      { customerId: ankaraIlac.customer.id, assigneeId: manager.id, title: 'GMP validasyon dokümantasyonu örneği gönder', dueAt: daysAgo(5), status: TaskStatus.ACIK },
      { customerId: anadolu.customer.id, assigneeId: serviceChief.id, title: 'Yıllık bakım sözleşmesi yenileme teklifi', dueAt: daysAhead(14) },
      { customerId: konyaMakina.customer.id, assigneeId: rep.id, title: 'İhtiyaç analizi görüşmesi yap', dueAt: daysAhead(4) },
    ],
  });

  // -------------------------------------------------------------------------
  // Fırsatlar + paydaş haritası
  // -------------------------------------------------------------------------
  console.log('[SEED] Firsatlar ve paydas haritalari...');

  async function createOpportunity(input: {
    seq: number;
    customer: Awaited<ReturnType<typeof createCustomer>>;
    title: string;
    description: string;
    stage: OpportunityStage;
    probability: number;
    expectedValue: number;
    openedDaysAgo: number;
    closeInDays: number;
    ownerId: string;
    source: string;
    competitor?: string;
    lossReason?: string;
    stakeholders: { idx: number; role: StakeholderRole; influence: number; sentiment: Sentiment; notes: string }[];
    history: { from?: OpportunityStage; to: OpportunityStage; days: number; note: string }[];
  }) {
    const opportunity = await prisma.opportunity.create({
      data: {
        code: `FRS-2026-${String(input.seq).padStart(4, '0')}`,
        customerId: input.customer.customer.id,
        title: input.title,
        description: input.description,
        stage: input.stage,
        probability: input.probability,
        expectedValue: input.expectedValue,
        openedAt: daysAgo(input.openedDaysAgo),
        expectedCloseDate: daysAhead(input.closeInDays),
        closedAt:
          input.stage === OpportunityStage.KAZANILDI || input.stage === OpportunityStage.KAYBEDILDI
            ? daysAgo(5)
            : null,
        source: input.source,
        competitor: input.competitor,
        lossReason: input.lossReason,
        ownerId: input.ownerId,
        stakeholders: {
          create: input.stakeholders.map((s) => ({
            contactId: input.customer.contacts[s.idx].id,
            role: s.role,
            influence: s.influence,
            sentiment: s.sentiment,
            notes: s.notes,
          })),
        },
        stageHistory: {
          create: input.history.map((h) => ({
            fromStage: h.from,
            toStage: h.to,
            note: h.note,
            changedAt: daysAgo(h.days),
          })),
        },
      },
    });
    return opportunity;
  }

  const oppAnadolu = await createOpportunity({
    seq: 1,
    customer: anadolu,
    title: 'Karaman Tesisi Yıkama Hattı Yenileme',
    description: 'Mevcut hattın 316L gövdeli, PLC kontrollü yeni makineyle değişimi.',
    stage: OpportunityStage.PAZARLIK,
    probability: 75,
    expectedValue: 1_850_000,
    openedDaysAgo: 70,
    closeInDays: 18,
    ownerId: manager.id,
    source: 'Mevcut müşteri',
    competitor: 'Ecomak',
    stakeholders: [
      { idx: 0, role: StakeholderRole.KARAR_VERICI, influence: 5, sentiment: Sentiment.DESTEKLIYOR, notes: 'Projeyi sahipleniyor, hızlı kapatmak istiyor.' },
      { idx: 1, role: StakeholderRole.TEKNIK_ONAYCI, influence: 4, sentiment: Sentiment.DESTEKLIYOR, notes: 'Şartname uyumunu doğruladı.' },
      { idx: 2, role: StakeholderRole.KAPI_BEKCISI, influence: 3, sentiment: Sentiment.NOTR, notes: 'Vade ve iskonto pazarlığını yürütüyor.' },
    ],
    history: [
      { to: OpportunityStage.KESIF, days: 70, note: 'Fabrika müdüründen talep geldi.' },
      { from: OpportunityStage.KESIF, to: OpportunityStage.NITELENDIRME, days: 60, note: 'Bütçe ve zaman doğrulandı.' },
      { from: OpportunityStage.NITELENDIRME, to: OpportunityStage.TEKNIK_DEGERLENDIRME, days: 45, note: 'Şartname alındı.' },
      { from: OpportunityStage.TEKNIK_DEGERLENDIRME, to: OpportunityStage.TEKLIF, days: 30, note: 'Rev A teklifi gönderildi.' },
      { from: OpportunityStage.TEKLIF, to: OpportunityStage.PAZARLIK, days: 12, note: 'Kapsam genişletme talebi geldi, Rev B açıldı.' },
    ],
  });

  const oppEge = await createOpportunity({
    seq: 2,
    customer: egeKimya,
    title: 'Aliağa Tesisi Dozajlama Sistemi',
    description: '6 hatlı otomatik dozajlama ünitesi ve proses tankı.',
    stage: OpportunityStage.PAZARLIK,
    probability: 60,
    expectedValue: 1_240_000,
    openedDaysAgo: 88,
    closeInDays: 25,
    ownerId: rep.id,
    source: 'Mevcut müşteri',
    competitor: 'GEA',
    stakeholders: [
      { idx: 0, role: StakeholderRole.EKONOMIK_ONAYCI, influence: 5, sentiment: Sentiment.NOTR, notes: 'Sert pazarlık yürütüyor, rakip fiyatını kullanıyor.' },
      { idx: 1, role: StakeholderRole.TEKNIK_ONAYCI, influence: 4, sentiment: Sentiment.DESTEKLIYOR, notes: 'İç şampiyonumuz, bizi savunuyor.' },
      { idx: 2, role: StakeholderRole.EKONOMIK_ONAYCI, influence: 4, sentiment: Sentiment.KARSIT, notes: 'Bütçeyi kısıtlıyor, ikinci imza onda.' },
    ],
    history: [
      { to: OpportunityStage.KESIF, days: 88, note: 'Proses mühendisinden talep.' },
      { from: OpportunityStage.KESIF, to: OpportunityStage.TEKNIK_DEGERLENDIRME, days: 66, note: 'ATEX gereksinimleri netleşti.' },
      { from: OpportunityStage.TEKNIK_DEGERLENDIRME, to: OpportunityStage.TEKLIF, days: 40, note: 'Teklif sunuldu.' },
      { from: OpportunityStage.TEKLIF, to: OpportunityStage.PAZARLIK, days: 18, note: 'Rakip fiyatı üzerinden indirim talebi.' },
    ],
  });

  const oppMarmara = await createOpportunity({
    seq: 3,
    customer: marmaraOtomotiv,
    title: 'Bursa Hat-3 Parça Yıkama Sistemi',
    description: 'IATF uyumlu, SCADA izlemeli tünel yıkama makinesi.',
    stage: OpportunityStage.TEKNIK_DEGERLENDIRME,
    probability: 40,
    expectedValue: 2_650_000,
    openedDaysAgo: 132,
    closeInDays: 75,
    ownerId: manager.id,
    source: 'Fuar teması',
    competitor: 'Dürr',
    stakeholders: [
      { idx: 0, role: StakeholderRole.KARAR_VERICI, influence: 5, sentiment: Sentiment.NOTR, notes: 'Veri odaklı; referans tesis performansı istiyor.' },
      { idx: 1, role: StakeholderRole.TEKNIK_ONAYCI, influence: 5, sentiment: Sentiment.NOTR, notes: 'Uygunluk matrisindeki her sapmayı sorguluyor.' },
      { idx: 2, role: StakeholderRole.KULLANICI, influence: 3, sentiment: Sentiment.DESTEKLIYOR, notes: 'Servis SLA sürelerimizden memnun.' },
    ],
    history: [
      { to: OpportunityStage.KESIF, days: 132, note: 'Fuarda ilk temas.' },
      { from: OpportunityStage.KESIF, to: OpportunityStage.NITELENDIRME, days: 100, note: 'Yatırım programında yer aldığı doğrulandı.' },
      { from: OpportunityStage.NITELENDIRME, to: OpportunityStage.TEKNIK_DEGERLENDIRME, days: 55, note: '48 maddelik şartname alındı.' },
    ],
  });

  const oppKaradeniz = await createOpportunity({
    seq: 4,
    customer: karadenizIcecek,
    title: 'Samsun Dolum Hattı Proses Ekipmanları',
    description: '2 adet 3.000 litre ceketli tank + 4 hatlı dozajlama ünitesi.',
    stage: OpportunityStage.TEKLIF,
    probability: 60,
    expectedValue: 1_420_000,
    openedDaysAgo: 34,
    closeInDays: 30,
    ownerId: manager.id,
    source: 'Referans',
    stakeholders: [
      { idx: 0, role: StakeholderRole.KARAR_VERICI, influence: 5, sentiment: Sentiment.DESTEKLIYOR, notes: 'Bütçeyi açıkça paylaştı, hızlı ilerlemek istiyor.' },
      { idx: 1, role: StakeholderRole.KULLANICI, influence: 3, sentiment: Sentiment.DESTEKLIYOR, notes: 'Eğitim ve devreye alma desteği bekliyor.' },
    ],
    history: [
      { to: OpportunityStage.KESIF, days: 34, note: 'Referans üzerinden geldi.' },
      { from: OpportunityStage.KESIF, to: OpportunityStage.NITELENDIRME, days: 22, note: '4,5 milyon TL bütçe paylaşıldı.' },
      { from: OpportunityStage.NITELENDIRME, to: OpportunityStage.TEKLIF, days: 8, note: 'Kapsam netleşti, teklif hazırlandı.' },
    ],
  });

  await createOpportunity({
    seq: 5,
    customer: trakyaTekstil,
    title: 'Çorlu Atık Su Filtrasyon Yatırımı',
    description: '40 plakalı hidrolik filtre presi.',
    stage: OpportunityStage.NITELENDIRME,
    probability: 25,
    expectedValue: 980_000,
    openedDaysAgo: 420,
    closeInDays: 120,
    ownerId: rep.id,
    source: 'Mevcut müşteri',
    stakeholders: [
      { idx: 0, role: StakeholderRole.KARAR_VERICI, influence: 4, sentiment: Sentiment.NOTR, notes: 'Bütçe onayı olmadan ilerlemiyor.' },
    ],
    history: [
      { to: OpportunityStage.KESIF, days: 420, note: 'Atık su yönetmeliği değişikliği sonrası talep.' },
      { from: OpportunityStage.KESIF, to: OpportunityStage.NITELENDIRME, days: 360, note: 'Bütçe bekleniyor.' },
    ],
  });

  await createOpportunity({
    seq: 6,
    customer: guneyMaden,
    title: 'Adana Cevher Yıkama Hattı',
    description: 'Ağır hizmet tipi yıkama sistemi.',
    stage: OpportunityStage.KAYBEDILDI,
    probability: 0,
    expectedValue: 3_100_000,
    openedDaysAgo: 520,
    closeInDays: -160,
    ownerId: rep.id,
    source: 'Mevcut müşteri',
    competitor: 'Yerli rakip',
    lossReason: 'Önceki projedeki teslim gecikmesi nedeniyle güven kaybı; rakip 8 hafta erken termin verdi.',
    stakeholders: [
      { idx: 0, role: StakeholderRole.KARAR_VERICI, influence: 5, sentiment: Sentiment.KARSIT, notes: 'Gecikme tazminatı konusu kapanmadı.' },
    ],
    history: [
      { to: OpportunityStage.KESIF, days: 520, note: 'Kapasite artışı talebi.' },
      { from: OpportunityStage.KESIF, to: OpportunityStage.TEKLIF, days: 400, note: 'Teklif gönderildi.' },
      { from: OpportunityStage.TEKLIF, to: OpportunityStage.KAYBEDILDI, days: 300, note: 'Rakibe kaybedildi.' },
    ],
  });

  await createOpportunity({
    seq: 7,
    customer: ankaraIlac,
    title: 'GMP Uyumlu Proses Tankı Projesi',
    description: 'Farma sınıfı yüzeyli 3.000 litre tank, IQ/OQ/PQ dokümantasyonu ile.',
    stage: OpportunityStage.KESIF,
    probability: 10,
    expectedValue: 890_000,
    openedDaysAgo: 41,
    closeInDays: 150,
    ownerId: manager.id,
    source: 'Fuar teması',
    stakeholders: [
      { idx: 0, role: StakeholderRole.TEKNIK_ONAYCI, influence: 4, sentiment: Sentiment.NOTR, notes: 'Validasyon dokümantasyonu bekliyor.' },
    ],
    history: [{ to: OpportunityStage.KESIF, days: 41, note: 'Interpack fuarında ilk temas.' }],
  });

  // -------------------------------------------------------------------------
  // Teklifler (revizyonlu) - CPQ akışı
  // -------------------------------------------------------------------------
  console.log('[SEED] Teklifler ve revizyonlar...');

  const washerOptions = await prisma.productOption.findMany({
    where: { group: { productId: washer.id } },
  });
  const tankOptions = await prisma.productOption.findMany({
    where: { group: { productId: tank.id } },
  });
  const dosingOptions = await prisma.productOption.findMany({
    where: { group: { productId: dosing.id } },
  });
  const optionByCode = new Map(
    [...washerOptions, ...tankOptions, ...dosingOptions].map((o) => [o.code, o]),
  );

  const washerBom = await prisma.bomLine.findMany({ where: { productId: washer.id }, include: { material: true } });
  const washerLabor = await prisma.laborLine.findMany({ where: { productId: washer.id }, include: { rate: true } });
  const tankBom = await prisma.bomLine.findMany({ where: { productId: tank.id }, include: { material: true } });
  const tankLabor = await prisma.laborLine.findMany({ where: { productId: tank.id }, include: { rate: true } });
  const dosingBom = await prisma.bomLine.findMany({ where: { productId: dosing.id }, include: { material: true } });
  const dosingLabor = await prisma.laborLine.findMany({ where: { productId: dosing.id }, include: { rate: true } });

  /** Teklif kalemi için maliyet/fiyat hesabı (CPQ motorunun sadeleştirilmiş kopyası). */
  function computeItem(
    product: { baseCost: number; leadTimeDays: number },
    bom: { quantity: number; material: { currentPrice: number; scrapPct: number } | null; unitCost: number; scrapPct: number }[],
    labor: { hours: number; rate: { kind: RateKind; hourlyRate: number } }[],
    optionCodes: string[],
    quantity: number,
    policy: { overheadPct: number; engineeringPct: number; contingencyPct: number; targetMarginPct: number },
  ) {
    const chosen = optionCodes.map((c) => optionByCode.get(c)!).filter(Boolean);
    const materialCost = bom.reduce(
      (s, b) => s + b.quantity * (b.material?.currentPrice ?? b.unitCost) * (1 + (b.material?.scrapPct ?? b.scrapPct) / 100),
      0,
    );
    const laborCost = labor.filter((l) => l.rate.kind === RateKind.ISCILIK).reduce((s, l) => s + l.hours * l.rate.hourlyRate, 0);
    const engCost = labor.filter((l) => l.rate.kind === RateKind.MUHENDISLIK).reduce((s, l) => s + l.hours * l.rate.hourlyRate, 0);
    const optionCost = chosen.reduce((s, o) => s + o.costDelta, 0);
    const optionPrice = chosen.reduce((s, o) => s + o.priceDelta, 0);
    const optionLabor = chosen.reduce((s, o) => s + o.laborHours, 0) * rates['IS-MON'].hourlyRate;

    const direct = product.baseCost + materialCost + laborCost + engCost + optionCost + optionLabor;
    const unitCost =
      direct * (1 + policy.overheadPct / 100 + policy.engineeringPct / 100 + policy.contingencyPct / 100);
    const unitPrice = unitCost / (1 - policy.targetMarginPct / 100) + optionPrice;
    const leadTimeDays = product.leadTimeDays + chosen.reduce((s, o) => s + o.leadTimeDelta, 0);

    return {
      chosen,
      unitCost: Math.round(unitCost * 100) / 100,
      unitPrice: Math.round(unitPrice * 100) / 100,
      lineCost: Math.round(unitCost * quantity * 100) / 100,
      leadTimeDays,
    };
  }

  /** Kalem oluşturup BOM/işçilik satırlarını teklife kopyalar. */
  async function addQuoteItem(
    quoteId: string,
    input: {
      product: { id: string; baseCost: number; leadTimeDays: number };
      bom: typeof washerBom;
      labor: typeof washerLabor;
      description: string;
      optionCodes: string[];
      quantity: number;
      discountPct?: number;
      sortOrder?: number;
    },
  ) {
    const calc = computeItem(input.product, input.bom, input.labor, input.optionCodes, input.quantity, standardPolicy);
    const discountPct = input.discountPct ?? 0;
    const lineTotal = Math.round(calc.unitPrice * input.quantity * (1 - discountPct / 100) * 100) / 100;

    return prisma.quoteItem.create({
      data: {
        quoteId,
        productId: input.product.id,
        description: input.description,
        quantity: input.quantity,
        unit: 'adet',
        unitCost: calc.unitCost,
        unitPrice: calc.unitPrice,
        discountPct,
        lineTotal,
        lineCost: calc.lineCost,
        marginPct: lineTotal > 0 ? Math.round(((lineTotal - calc.lineCost) / lineTotal) * 10_000) / 100 : 0,
        leadTimeDays: calc.leadTimeDays,
        sortOrder: input.sortOrder ?? 0,
        configSnapshot: { options: input.optionCodes },
        options: {
          create: calc.chosen.map((o) => ({ optionId: o.id, costDelta: o.costDelta, priceDelta: o.priceDelta })),
        },
        bomLines: {
          create: input.bom.map((b, i) => ({
            materialId: b.materialId,
            description: b.description,
            quantity: b.quantity * input.quantity,
            unit: b.unit,
            unitCost: b.material?.currentPrice ?? b.unitCost,
            scrapPct: b.material?.scrapPct ?? b.scrapPct,
            lineCost: b.quantity * input.quantity * (b.material?.currentPrice ?? b.unitCost),
            revision: b.revision,
            sortOrder: i,
          })),
        },
        laborLines: {
          create: input.labor.map((l, i) => ({
            rateId: l.rateId,
            description: l.description,
            hours: l.hours * input.quantity,
            hourlyRate: l.rate.hourlyRate,
            lineCost: l.hours * input.quantity * l.rate.hourlyRate,
            sortOrder: i,
          })),
        },
      },
    });
  }

  /** Teklifin toplamlarını kalemlerden hesaplar. */
  async function finalizeQuote(quoteId: string) {
    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { items: true } });
    const subtotal = quote.items.reduce((s, i) => s + i.lineTotal, 0);
    const totalCost = quote.items.reduce((s, i) => s + i.lineCost, 0);
    const discountAmount = subtotal * (quote.discountPct / 100);
    const totalPrice = subtotal - discountAmount;
    return prisma.quote.update({
      where: { id: quoteId },
      data: {
        subtotal,
        totalCost,
        discountAmount,
        totalPrice,
        marginPct: totalPrice > 0 ? Math.round(((totalPrice - totalCost) / totalPrice) * 10_000) / 100 : 0,
        leadTimeDays: quote.items.reduce((m, i) => Math.max(m, i.leadTimeDays), 0),
      },
    });
  }

  // --- TKF-2026-0001: Anadolu Gıda, Rev A -> Rev B (kapsam genişledi) ---
  const anadoluRevA = await prisma.quote.create({
    data: {
      quoteNo: 'TKF-2026-0001',
      revision: 0,
      isCurrent: false,
      status: QuoteStatus.REVIZE_EDILDI,
      customerId: anadolu.customer.id,
      opportunityId: oppAnadolu.id,
      policyId: standardPolicy.id,
      title: 'Karaman Tesisi Yıkama Hattı - Temel Kapsam',
      issuedAt: daysAgo(30),
      validUntil: daysAhead(0),
      sentAt: daysAgo(30),
      discountPct: 4,
      paymentTerms: '60 gün vadeli',
      deliveryTerms: 'DAP - Karaman',
      createdById: manager.id,
      notes: 'Müşterinin ilk talebi doğrultusunda hazırlanan temel kapsam.',
    },
  });
  await prisma.quote.update({ where: { id: anadoluRevA.id }, data: { rootQuoteId: anadoluRevA.id } });
  await addQuoteItem(anadoluRevA.id, {
    product: washer,
    bom: washerBom,
    labor: washerLabor,
    description: 'Konveyörlü Yıkama Makinesi - 316L gövde, PLC kontrol',
    optionCodes: ['GOVDE-316L', 'TAHRIK-15', 'OTOM-PLC'],
    quantity: 1,
  });
  await finalizeQuote(anadoluRevA.id);

  const anadoluRevB = await prisma.quote.create({
    data: {
      quoteNo: 'TKF-2026-0001',
      revision: 1,
      rootQuoteId: anadoluRevA.id,
      parentQuoteId: anadoluRevA.id,
      isCurrent: true,
      revisionNote:
        'Müşteri kurutma bölümü ve su filtrasyonu eklenmesini istedi. Kurutma bölümü kuralı gereği tahrik 4 kW\'a yükseltildi.',
      status: QuoteStatus.PAZARLIK,
      customerId: anadolu.customer.id,
      opportunityId: oppAnadolu.id,
      policyId: standardPolicy.id,
      title: 'Karaman Tesisi Yıkama Hattı - Kurutmalı Kapsam',
      issuedAt: daysAgo(12),
      validUntil: daysAhead(18),
      sentAt: daysAgo(12),
      discountPct: 6,
      paymentTerms: '60 gün vadeli',
      deliveryTerms: 'DAP - Karaman',
      createdById: manager.id,
      notes: 'Kurutma bölümü ve otomatik su filtrasyonu dahil edilmiş revizyon.',
    },
  });
  await addQuoteItem(anadoluRevB.id, {
    product: washer,
    bom: washerBom,
    labor: washerLabor,
    description: 'Konveyörlü Yıkama Makinesi - 316L gövde, 4 kW tahrik, PLC, kurutma + filtrasyon',
    optionCodes: ['GOVDE-316L', 'TAHRIK-40', 'OTOM-PLC', 'EKS-KURUT', 'EKS-FILTRE', 'EKS-CE'],
    quantity: 1,
  });
  await finalizeQuote(anadoluRevB.id);

  // --- TKF-2026-0002: Ege Kimya (onay bekliyor - yüksek iskonto) ---
  const egeQuote = await prisma.quote.create({
    data: {
      quoteNo: 'TKF-2026-0002',
      revision: 0,
      isCurrent: true,
      status: QuoteStatus.ONAY_BEKLIYOR,
      customerId: egeKimya.customer.id,
      opportunityId: oppEge.id,
      policyId: standardPolicy.id,
      title: 'Aliağa Dozajlama Sistemi ve Proses Tankı',
      issuedAt: daysAgo(16),
      validUntil: daysAhead(14),
      discountPct: 12,
      approvalNote: 'İskonto %12,0, yetkiniz olan %5,0 sınırının üzerinde.',
      paymentTerms: '90 gün vadeli',
      deliveryTerms: 'DAP - Aliağa OSB',
      createdById: rep.id,
      notes: 'Rakip fiyatına karşılık verilen agresif teklif. Müdür onayı bekleniyor.',
    },
  });
  await prisma.quote.update({ where: { id: egeQuote.id }, data: { rootQuoteId: egeQuote.id } });
  await addQuoteItem(egeQuote.id, {
    product: dosing,
    bom: dosingBom,
    labor: dosingLabor,
    description: 'Otomatik Kimyasal Dozajlama Ünitesi - 6 hat',
    optionCodes: ['HAT-6'],
    quantity: 1,
    sortOrder: 0,
  });
  await addQuoteItem(egeQuote.id, {
    product: tank,
    bom: tankBom,
    labor: tankLabor,
    description: 'Paslanmaz Proses Tankı - 3.000 litre, yarım boru ceket',
    optionCodes: ['HACIM-3000', 'CEKET-YARIM', 'YUZEY-STD'],
    quantity: 2,
    sortOrder: 1,
  });
  await finalizeQuote(egeQuote.id);

  // --- TKF-2026-0003: Karadeniz İçecek (gönderildi) ---
  const karadenizQuote = await prisma.quote.create({
    data: {
      quoteNo: 'TKF-2026-0003',
      revision: 0,
      isCurrent: true,
      status: QuoteStatus.GONDERILDI,
      customerId: karadenizIcecek.customer.id,
      opportunityId: oppKaradeniz.id,
      policyId: standardPolicy.id,
      title: 'Samsun Dolum Hattı Proses Ekipmanları',
      issuedAt: daysAgo(7),
      validUntil: daysAhead(23),
      sentAt: daysAgo(7),
      discountPct: 3,
      paymentTerms: '45 gün vadeli',
      deliveryTerms: 'DAP - Samsun',
      createdById: manager.id,
      notes: 'Devreye alma ve 2 günlük operatör eğitimi dahildir.',
    },
  });
  await prisma.quote.update({ where: { id: karadenizQuote.id }, data: { rootQuoteId: karadenizQuote.id } });
  await addQuoteItem(karadenizQuote.id, {
    product: tank,
    bom: tankBom,
    labor: tankLabor,
    description: 'Paslanmaz Proses Tankı - 3.000 litre, tam ceket, gıda sınıfı yüzey',
    optionCodes: ['HACIM-3000', 'CEKET-TAM', 'YUZEY-GIDA'],
    quantity: 2,
    sortOrder: 0,
  });
  await addQuoteItem(karadenizQuote.id, {
    product: dosing,
    bom: dosingBom,
    labor: dosingLabor,
    description: 'Otomatik Kimyasal Dozajlama Ünitesi - 4 hat',
    optionCodes: ['HAT-4'],
    quantity: 1,
    sortOrder: 1,
  });
  await finalizeQuote(karadenizQuote.id);

  // --- TKF-2026-0004: Anadolu Gıda geçmiş teklif (kabul edilmiş -> siparişe dönüşmüş) ---
  const anadoluOldQuote = await prisma.quote.create({
    data: {
      quoteNo: 'TKF-2025-0018',
      revision: 0,
      isCurrent: true,
      status: QuoteStatus.KABUL_EDILDI,
      customerId: anadolu.customer.id,
      policyId: standardPolicy.id,
      title: 'Konya Tesisi Proses Tankı Yenileme',
      issuedAt: daysAgo(190),
      validUntil: daysAgo(160),
      sentAt: daysAgo(190),
      decidedAt: daysAgo(172),
      discountPct: 4,
      approvedById: manager.id,
      approvedAt: daysAgo(188),
      paymentTerms: '60 gün vadeli',
      createdById: manager.id,
    },
  });
  await prisma.quote.update({ where: { id: anadoluOldQuote.id }, data: { rootQuoteId: anadoluOldQuote.id } });
  await addQuoteItem(anadoluOldQuote.id, {
    product: tank,
    bom: tankBom,
    labor: tankLabor,
    description: 'Paslanmaz Proses Tankı - 1.000 litre, ceketsiz',
    optionCodes: ['HACIM-1000', 'CEKET-YOK', 'YUZEY-GIDA'],
    quantity: 3,
  });
  await finalizeQuote(anadoluOldQuote.id);

  // -------------------------------------------------------------------------
  // Siparişler + ERP bağlantıları
  // -------------------------------------------------------------------------
  console.log('[SEED] Siparisler ve ERP baglantilari...');

  /** Sipariş + kalemleri + durum geçmişi. */
  async function createOrder(input: {
    orderNo: string;
    customerId: string;
    quoteId?: string;
    opportunityId?: string;
    status: OrderStatus;
    orderDaysAgo: number;
    promisedInDays: number;
    deliveredDaysAgo?: number;
    customerPoNo?: string;
    items: { productId: string; description: string; quantity: number; unitPrice: number; producedQty?: number; erpOrderNo?: string }[];
    history: { from?: OrderStatus; to: OrderStatus; days: number; note: string }[];
  }) {
    const total = input.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    const order = await prisma.order.create({
      data: {
        orderNo: input.orderNo,
        customerId: input.customerId,
        quoteId: input.quoteId,
        opportunityId: input.opportunityId,
        status: input.status,
        orderDate: daysAgo(input.orderDaysAgo),
        promisedDate: daysAhead(input.promisedInDays),
        deliveredAt: input.deliveredDaysAgo ? daysAgo(input.deliveredDaysAgo) : null,
        totalAmount: total,
        customerPoNo: input.customerPoNo,
        paymentTerms: '60 gün vadeli',
        deliveryTerms: 'DAP - müşteri sahası',
        createdById: manager.id,
        history: {
          create: input.history.map((h) => ({
            fromStatus: h.from,
            toStatus: h.to,
            note: h.note,
            changedAt: daysAgo(h.days),
          })),
        },
      },
    });

    for (const [i, item] of input.items.entries()) {
      const created = await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.unitPrice * item.quantity,
          producedQty: item.producedQty ?? 0,
          sortOrder: i,
        },
      });

      // ERP bağlantısı: PPM'deki üretim emri numarası. Senkron edilene kadar
      // ilerleme bilgisi boştur; "ERP Senkronize Et" butonu doldurur.
      if (item.erpOrderNo) {
        await prisma.erpLink.create({
          data: { orderItemId: created.id, erpOrderNo: item.erpOrderNo },
        });
      }
    }

    return order;
  }

  const orderAnadoluOld = await createOrder({
    orderNo: 'SPR-2025-0031',
    customerId: anadolu.customer.id,
    quoteId: anadoluOldQuote.id,
    status: OrderStatus.TESLIM_EDILDI,
    orderDaysAgo: 172,
    promisedInDays: -120,
    deliveredDaysAgo: 118,
    customerPoNo: 'AG-PO-2025-4412',
    items: [
      { productId: tank.id, description: 'Paslanmaz Proses Tankı - 1.000 litre, gıda sınıfı yüzey', quantity: 3, unitPrice: 268_400, producedQty: 3 },
    ],
    history: [
      { to: OrderStatus.ONAY_BEKLIYOR, days: 172, note: 'TKF-2025-0018 teklifinden oluşturuldu.' },
      { from: OrderStatus.ONAY_BEKLIYOR, to: OrderStatus.ONAYLANDI, days: 170, note: 'Müşteri PO alındı.' },
      { from: OrderStatus.ONAYLANDI, to: OrderStatus.URETIMDE, days: 160, note: 'Üretim emri açıldı.' },
      { from: OrderStatus.URETIMDE, to: OrderStatus.SEVK_EDILDI, days: 124, note: 'Sevkiyat yapıldı.' },
      { from: OrderStatus.SEVK_EDILDI, to: OrderStatus.TESLIM_EDILDI, days: 118, note: 'Sahada teslim ve devreye alma tamamlandı.' },
    ],
  });

  const orderEge = await createOrder({
    orderNo: 'SPR-2025-0044',
    customerId: egeKimya.customer.id,
    status: OrderStatus.TESLIM_EDILDI,
    orderDaysAgo: 96,
    promisedInDays: -40,
    deliveredDaysAgo: 38,
    customerPoNo: 'EK-2025-0871',
    items: [
      { productId: dosing.id, description: 'Otomatik Kimyasal Dozajlama Ünitesi - 2 hat', quantity: 1, unitPrice: 214_800, producedQty: 1 },
    ],
    history: [
      { to: OrderStatus.ONAY_BEKLIYOR, days: 96, note: 'Sipariş alındı.' },
      { from: OrderStatus.ONAY_BEKLIYOR, to: OrderStatus.ONAYLANDI, days: 94, note: 'Onaylandı.' },
      { from: OrderStatus.ONAYLANDI, to: OrderStatus.URETIMDE, days: 84, note: 'Üretime alındı.' },
      { from: OrderStatus.URETIMDE, to: OrderStatus.TESLIM_EDILDI, days: 38, note: 'Teslim edildi.' },
    ],
  });

  const orderKaradeniz = await createOrder({
    orderNo: 'SPR-2026-0002',
    customerId: karadenizIcecek.customer.id,
    status: OrderStatus.URETIMDE,
    orderDaysAgo: 28,
    promisedInDays: 34,
    customerPoNo: 'KI-PO-2026-0112',
    items: [
      // Bu kalemler PPM'deki üretim emirlerine bağlanır.
      { productId: tank.id, description: 'Paslanmaz Proses Tankı - 3.000 litre, tam ceket', quantity: 2, unitPrice: 421_500, producedQty: 1, erpOrderNo: 'UE-2026-0001' },
      { productId: dosing.id, description: 'Otomatik Kimyasal Dozajlama Ünitesi - 4 hat', quantity: 1, unitPrice: 318_900, erpOrderNo: 'UE-2026-0002' },
    ],
    history: [
      { to: OrderStatus.ONAY_BEKLIYOR, days: 28, note: 'Sipariş oluşturuldu.' },
      { from: OrderStatus.ONAY_BEKLIYOR, to: OrderStatus.ONAYLANDI, days: 26, note: 'Avans ödemesi alındı.' },
      { from: OrderStatus.ONAYLANDI, to: OrderStatus.URETIMDE, days: 18, note: 'Mühendislik onayı sonrası üretime alındı.' },
    ],
  });

  const orderMarmara = await createOrder({
    orderNo: 'SPR-2025-0052',
    customerId: marmaraOtomotiv.customer.id,
    status: OrderStatus.TESLIM_EDILDI,
    orderDaysAgo: 300,
    promisedInDays: -230,
    deliveredDaysAgo: 226,
    items: [
      { productId: washer.id, description: 'Konveyörlü Yıkama Makinesi - 304 gövde, PLC', quantity: 1, unitPrice: 892_000, producedQty: 1 },
    ],
    history: [
      { to: OrderStatus.ONAY_BEKLIYOR, days: 300, note: 'Sipariş alındı.' },
      { from: OrderStatus.ONAY_BEKLIYOR, to: OrderStatus.URETIMDE, days: 290, note: 'Üretime alındı.' },
      { from: OrderStatus.URETIMDE, to: OrderStatus.TESLIM_EDILDI, days: 226, note: 'Teslim edildi.' },
    ],
  });

  // Gecikmiş sipariş - gösterge panelinde uyarı olarak görünür.
  const orderTrakya = await createOrder({
    orderNo: 'SPR-2026-0001',
    customerId: trakyaTekstil.customer.id,
    status: OrderStatus.URETIMDE,
    orderDaysAgo: 70,
    promisedInDays: -6,
    customerPoNo: 'TT-2026-0033',
    items: [
      { productId: filterPress.id, description: 'Hidrolik Filtre Presi - 20 plaka', quantity: 1, unitPrice: 684_000, producedQty: 0, erpOrderNo: 'UE-2026-0007' },
    ],
    history: [
      { to: OrderStatus.ONAY_BEKLIYOR, days: 70, note: 'Sipariş alındı.' },
      { from: OrderStatus.ONAY_BEKLIYOR, to: OrderStatus.ONAYLANDI, days: 66, note: 'Onaylandı.' },
      { from: OrderStatus.ONAYLANDI, to: OrderStatus.URETIMDE, days: 52, note: 'Üretime alındı. Hidrolik ünite tedariğinde gecikme var.' },
    ],
  });

  // Güney Maden - eski sipariş (kaybedilmiş müşteri segmentini oluşturur)
  await createOrder({
    orderNo: 'SPR-2024-0019',
    customerId: guneyMaden.customer.id,
    status: OrderStatus.FATURALANDI,
    orderDaysAgo: 640,
    promisedInDays: -560,
    deliveredDaysAgo: 548,
    items: [
      { productId: washer.id, description: 'Konveyörlü Yıkama Makinesi - karbon çelik gövde', quantity: 1, unitPrice: 612_000, producedQty: 1 },
    ],
    history: [
      { to: OrderStatus.ONAY_BEKLIYOR, days: 640, note: 'Sipariş alındı.' },
      { from: OrderStatus.ONAY_BEKLIYOR, to: OrderStatus.TESLIM_EDILDI, days: 548, note: 'Gecikmeli teslim edildi.' },
      { from: OrderStatus.TESLIM_EDILDI, to: OrderStatus.FATURALANDI, days: 540, note: 'Faturalandı.' },
    ],
  });

  // Mühendisliğe aktarım kaydı (onaylı sipariş için)
  await prisma.engineeringHandover.create({
    data: {
      orderId: orderKaradeniz.id,
      status: 'GONDERILDI',
      sentAt: daysAgo(20),
      erpReference: 'PPM/UE-2026-0001',
      note: 'Sipariş onaylandı, malzeme listesi mühendisliğe aktarıldı.',
      createdById: manager.id,
      bomSnapshot: {
        orderNo: orderKaradeniz.orderNo,
        generatedAt: daysAgo(20).toISOString(),
        items: [
          {
            description: 'Paslanmaz Proses Tankı - 3.000 litre, tam ceket',
            quantity: 2,
            bom: [
              { description: 'Paslanmaz Sac AISI 316L (3 mm)', quantity: 960, unit: 'kg', revision: 'A' },
              { description: 'St37 Karbon Çelik Profil', quantity: 240, unit: 'kg', revision: 'A' },
            ],
            labor: [{ description: 'Kaynakçı (TIG/MIG)', kind: 'ISCILIK', hours: 144 }],
          },
        ],
      },
    },
  });

  // -------------------------------------------------------------------------
  // Teknik şartnameler ve uygunluk matrisi
  // -------------------------------------------------------------------------
  console.log('[SEED] Sartnameler ve uygunluk matrisi...');

  const marmaraSpec = await prisma.specDocument.create({
    data: {
      customerId: marmaraOtomotiv.customer.id,
      opportunityId: oppMarmara.id,
      title: 'Hat-3 Parça Yıkama Sistemi Teknik Şartnamesi',
      docNo: 'MO-TS-2026-014',
      revision: 'C',
      receivedAt: daysAgo(55),
      notes: 'IATF 16949 kapsamında hazırlanmış 48 maddelik şartname. Kritik maddeler kalite müdürü onayına tabi.',
    },
  });

  await prisma.specRequirement.createMany({
    data: [
      { specDocumentId: marmaraSpec.id, clauseNo: '3.1', text: 'Gövde malzemesi AISI 304 veya üstü paslanmaz çelik olmalıdır.', category: 'Malzeme', criticality: Criticality.YUKSEK, status: ComplianceStatus.KARSILANIYOR, response: 'AISI 304 standart, 316L opsiyonel olarak sunulmaktadır.', ownerId: manager.id, sortOrder: 1 },
      { specDocumentId: marmaraSpec.id, clauseNo: '3.4', text: 'Yıkama sıcaklığı 60-90°C aralığında ±2°C hassasiyetle kontrol edilebilmelidir.', category: 'Proses', criticality: Criticality.KRITIK, status: ComplianceStatus.KARSILANIYOR, response: 'Sıcak su modülü + PLC kontrolü ile ±1,5°C sağlanmaktadır.', ownerId: manager.id, sortOrder: 2 },
      { specDocumentId: marmaraSpec.id, clauseNo: '4.2', text: 'Çevrim süresi parça başına en fazla 45 saniye olmalıdır.', category: 'Kapasite', criticality: Criticality.KRITIK, status: ComplianceStatus.KISMEN_KARSILANIYOR, response: '4 kW tahrik ile 48 saniye elde edilmektedir.', deviation: '6 kW tahrik opsiyonuyla 42 saniyeye inilebilir; ek maliyet teklifte ayrı gösterilmiştir.', ownerId: manager.id, sortOrder: 3 },
      { specDocumentId: marmaraSpec.id, clauseNo: '5.1', text: 'SCADA sistemi üzerinden uzaktan izleme ve raporlama yapılabilmelidir.', category: 'Otomasyon', criticality: Criticality.YUKSEK, status: ComplianceStatus.KARSILANIYOR, response: 'PLC + SCADA opsiyonu ile OPC-UA üzerinden entegrasyon sağlanır.', ownerId: manager.id, sortOrder: 4 },
      { specDocumentId: marmaraSpec.id, clauseNo: '5.6', text: 'Sistem, müşterinin mevcut MES yazılımıyla çift yönlü haberleşmelidir.', category: 'Otomasyon', criticality: Criticality.YUKSEK, status: ComplianceStatus.KARSILANMIYOR, response: 'Standart kapsamda tek yönlü veri aktarımı bulunmaktadır.', deviation: 'Çift yönlü MES entegrasyonu için ilave yazılım geliştirme (yaklaşık 120 saat) gerekmektedir.', ownerId: manager.id, sortOrder: 5 },
      { specDocumentId: marmaraSpec.id, clauseNo: '6.3', text: 'Gürültü seviyesi 1 metre mesafede 78 dB(A) değerini aşmamalıdır.', category: 'İSG', criticality: Criticality.ORTA, status: ComplianceStatus.KARSILANIYOR, response: 'Ölçüm raporlarımızda 74 dB(A) kayıtlıdır.', sortOrder: 6 },
      { specDocumentId: marmaraSpec.id, clauseNo: '7.2', text: 'Yedek parça temin süresi kritik parçalar için 48 saati geçmemelidir.', category: 'Satış Sonrası', criticality: Criticality.YUKSEK, status: ComplianceStatus.KARSILANIYOR, response: 'Bursa bölge deposunda kritik parça stoğu tutulmaktadır.', ownerId: serviceChief.id, sortOrder: 7 },
      { specDocumentId: marmaraSpec.id, clauseNo: '7.5', text: 'Arıza durumunda sahada müdahale süresi en fazla 8 saat olmalıdır.', category: 'Satış Sonrası', criticality: Criticality.KRITIK, status: ComplianceStatus.KARSILANIYOR, response: 'Bakım sözleşmesi kapsamında 6 saat SLA taahhüt edilmektedir.', ownerId: serviceChief.id, sortOrder: 8 },
      { specDocumentId: marmaraSpec.id, clauseNo: '8.1', text: 'IQ/OQ/PQ validasyon dokümantasyonu teslim edilmelidir.', category: 'Dokümantasyon', criticality: Criticality.ORTA, status: ComplianceStatus.DEGERLENDIRILIYOR, response: 'Kapsam kalite ekibiyle netleştiriliyor.', ownerId: manager.id, sortOrder: 9 },
      { specDocumentId: marmaraSpec.id, clauseNo: '9.4', text: 'Ekipman, müşterinin mevcut enerji izleme sistemine bağlanmalıdır.', category: 'Enerji', criticality: Criticality.DUSUK, status: ComplianceStatus.KAPSAM_DISI, response: 'Enerji izleme altyapısı müşteri kapsamındadır.', sortOrder: 10 },
    ],
  });

  const anadoluSpec = await prisma.specDocument.create({
    data: {
      customerId: anadolu.customer.id,
      opportunityId: oppAnadolu.id,
      quoteId: anadoluRevB.id,
      title: 'Karaman Yıkama Hattı Teknik Şartnamesi',
      docNo: 'AG-TS-2026-007',
      revision: 'B',
      receivedAt: daysAgo(44),
      notes: 'Gıda sınıfı üretim gereksinimleri; 316L ve yüzey kalitesi kritik.',
    },
  });

  await prisma.specRequirement.createMany({
    data: [
      { specDocumentId: anadoluSpec.id, clauseNo: '2.1', text: 'Ürünle temas eden tüm yüzeyler AISI 316L olmalıdır.', category: 'Malzeme', criticality: Criticality.KRITIK, status: ComplianceStatus.KARSILANIYOR, response: '316L gövde opsiyonu teklife dahil edilmiştir.', ownerId: manager.id, sortOrder: 1 },
      { specDocumentId: anadoluSpec.id, clauseNo: '2.4', text: 'İç yüzey pürüzlülüğü Ra 0.8 veya daha iyi olmalıdır.', category: 'Malzeme', criticality: Criticality.YUKSEK, status: ComplianceStatus.KARSILANIYOR, response: 'Gıda sınıfı parlatma uygulanmaktadır.', sortOrder: 2 },
      { specDocumentId: anadoluSpec.id, clauseNo: '3.2', text: 'Hat kapasitesi saatte en az 1.200 parça olmalıdır.', category: 'Kapasite', criticality: Criticality.KRITIK, status: ComplianceStatus.KARSILANIYOR, response: '4 kW tahrik ile 1.350 parça/saat sağlanmaktadır.', ownerId: manager.id, sortOrder: 3 },
      { specDocumentId: anadoluSpec.id, clauseNo: '4.1', text: 'CE uygunluk beyanı ve teknik dosya teslim edilmelidir.', category: 'Dokümantasyon', criticality: Criticality.YUKSEK, status: ComplianceStatus.KARSILANIYOR, response: 'CE sertifikasyon dosyası opsiyonu teklife eklenmiştir.', sortOrder: 4 },
      { specDocumentId: anadoluSpec.id, clauseNo: '5.3', text: 'Kurutma sonrası parça nem oranı %2\'nin altında olmalıdır.', category: 'Proses', criticality: Criticality.YUKSEK, status: ComplianceStatus.KISMEN_KARSILANIYOR, response: 'Standart kurutma ile %2,5 elde edilmektedir.', deviation: 'Uzatılmış kurutma tüneli ile %1,8 sağlanabilir; termin 2 hafta uzar.', ownerId: manager.id, sortOrder: 5 },
    ],
  });

  await prisma.document.createMany({
    data: [
      { customerId: anadolu.customer.id, opportunityId: oppAnadolu.id, type: DocumentType.CIZIM, title: 'Karaman hattı yerleşim planı', docNo: 'MRP-DWG-2026-118', version: '2.0', fileName: 'karaman_yerlesim_rev2.pdf' },
      { customerId: anadolu.customer.id, quoteId: anadoluRevB.id, type: DocumentType.SUNUM, title: 'Teklif sunumu - kurutmalı kapsam', version: '1.0', fileName: 'anadolu_teklif_sunum.pptx' },
      { customerId: marmaraOtomotiv.customer.id, opportunityId: oppMarmara.id, type: DocumentType.TEST_RAPORU, title: 'Referans tesis gürültü ölçüm raporu', docNo: 'MRP-TR-2025-042', version: '1.0', fileName: 'gurultu_olcum.pdf' },
      { customerId: egeKimya.customer.id, type: DocumentType.SERTIFIKA, title: 'ATEX uygunluk sertifikası', docNo: 'ATEX-2025-0091', version: '1.0', fileName: 'atex_sertifika.pdf' },
      { customerId: karadenizIcecek.customer.id, orderId: orderKaradeniz.id, type: DocumentType.CIZIM, title: 'Tank imalat resmi', docNo: 'MRP-DWG-2026-204', version: '1.1', fileName: 'tank_imalat_rev1.pdf' },
    ],
  });

  // -------------------------------------------------------------------------
  // Sözleşmeler ve sürümleri
  // -------------------------------------------------------------------------
  console.log('[SEED] Sozlesmeler...');

  async function createContract(input: {
    contractNo: string;
    customerId: string;
    type: ContractType;
    status: ContractStatus;
    title: string;
    startDaysAgo?: number;
    endInDays?: number;
    renewalInDays?: number;
    value?: number;
    warrantyMonths?: number;
    deliveryTerms?: string;
    penaltyClause?: string;
    notes?: string;
    versions: { changeNote: string; body: string; daysAgo: number }[];
  }) {
    const contract = await prisma.contract.create({
      data: {
        contractNo: input.contractNo,
        customerId: input.customerId,
        type: input.type,
        status: input.status,
        title: input.title,
        startDate: input.startDaysAgo ? daysAgo(input.startDaysAgo) : null,
        endDate: input.endInDays !== undefined ? daysAhead(input.endInDays) : null,
        renewalDate: input.renewalInDays !== undefined ? daysAhead(input.renewalInDays) : null,
        value: input.value,
        warrantyMonths: input.warrantyMonths,
        deliveryTerms: input.deliveryTerms,
        paymentTerms: '60 gün vadeli',
        penaltyClause: input.penaltyClause,
        governingLaw: 'Türkiye Cumhuriyeti hukuku, İstanbul mahkemeleri',
        notes: input.notes,
      },
    });

    for (const [i, v] of input.versions.entries()) {
      await prisma.contractVersion.create({
        data: {
          contractId: contract.id,
          version: i + 1,
          changeNote: v.changeNote,
          body: v.body,
          isCurrent: i === input.versions.length - 1,
          createdById: manager.id,
          createdAt: daysAgo(v.daysAgo),
        },
      });
    }

    return contract;
  }

  await createContract({
    contractNo: 'SZL-2024-0007',
    customerId: anadolu.customer.id,
    type: ContractType.CERCEVE,
    status: ContractStatus.YURURLUKTE,
    title: 'Anadolu Gıda Çerçeve Tedarik Anlaşması',
    startDaysAgo: 720,
    endInDays: 45,
    renewalInDays: 15,
    value: 8_500_000,
    deliveryTerms: 'DAP - müşteri sahası',
    penaltyClause: 'Gecikilen her takvim haftası için sözleşme bedelinin %0,5\'i, azami %5.',
    notes: 'Yenileme tarihi yaklaşıyor. Fiyat listesi güncellenerek uzatılacak.',
    versions: [
      { changeNote: 'İlk sürüm.', body: 'Çerçeve anlaşma; yıllık asgari alım taahhüdü 6.000.000 TL.', daysAgo: 720 },
      { changeNote: 'Yıllık fiyat endeksleme maddesi eklendi (ÜFE bağlantılı).', body: 'Fiyatlar her yıl 1 Ocak\'ta ÜFE oranında güncellenir.', daysAgo: 355 },
      { changeNote: 'Gecikme cezası tavanı %8\'den %5\'e çekildi.', body: 'Cezai şart tavanı sözleşme bedelinin %5\'i ile sınırlandırılmıştır.', daysAgo: 90 },
    ],
  });

  await createContract({
    contractNo: 'SZL-2025-0022',
    customerId: anadolu.customer.id,
    type: ContractType.BAKIM,
    status: ContractStatus.YURURLUKTE,
    title: 'Konya Tesisi Yıllık Bakım Sözleşmesi',
    startDaysAgo: 118,
    endInDays: 247,
    renewalInDays: 217,
    value: 340_000,
    deliveryTerms: 'Yerinde servis',
    notes: '6 saat müdahale SLA, yılda 2 periyodik bakım.',
    versions: [{ changeNote: 'İlk sürüm.', body: 'Yıllık 2 periyodik bakım, 6 saat müdahale SLA, yedek parça %15 iskontolu.', daysAgo: 118 }],
  });

  await createContract({
    contractNo: 'SZL-2026-0003',
    customerId: marmaraOtomotiv.customer.id,
    type: ContractType.NDA,
    status: ContractStatus.YURURLUKTE,
    title: 'Marmara Otomotiv Karşılıklı Gizlilik Sözleşmesi',
    startDaysAgo: 130,
    endInDays: 600,
    notes: 'Hat-3 projesi kapsamında paylaşılan teknik veriler için.',
    versions: [
      { changeNote: 'İlk sürüm.', body: 'Karşılıklı gizlilik, 2 yıl süreli.', daysAgo: 130 },
      { changeNote: 'Alt yüklenicilere bilgi aktarım maddesi eklendi.', body: 'Yazılı onay ile alt yüklenicilere aktarım mümkündür.', daysAgo: 62 },
    ],
  });

  await createContract({
    contractNo: 'SZL-2026-0005',
    customerId: karadenizIcecek.customer.id,
    type: ContractType.SATIS,
    status: ContractStatus.IMZA_BEKLIYOR,
    title: 'Samsun Dolum Hattı Ekipman Satış Sözleşmesi',
    startDaysAgo: 0,
    endInDays: 400,
    value: 1_420_000,
    warrantyMonths: 24,
    deliveryTerms: 'DAP - Samsun',
    penaltyClause: 'Gecikilen her hafta için %0,4, azami %4.',
    notes: 'Müşteri hukuk birimi inceliyor, imza bekleniyor.',
    versions: [
      { changeNote: 'İlk sürüm.', body: '24 ay garanti, devreye alma ve eğitim dahil.', daysAgo: 9 },
      { changeNote: 'Garanti süresi 18 aydan 24 aya çıkarıldı.', body: 'Garanti süresi teslim tarihinden itibaren 24 aydır.', daysAgo: 3 },
    ],
  });

  await createContract({
    contractNo: 'SZL-2025-0014',
    customerId: egeKimya.customer.id,
    type: ContractType.GARANTI,
    status: ContractStatus.YURURLUKTE,
    title: 'Ege Kimya Dozajlama Ünitesi Garanti Şartları',
    startDaysAgo: 38,
    endInDays: 692,
    warrantyMonths: 24,
    notes: 'Aşınma parçaları garanti kapsamı dışındadır.',
    versions: [{ changeNote: 'İlk sürüm.', body: '24 ay garanti; membran ve conta gibi sarf parçalar hariç.', daysAgo: 38 }],
  });

  // -------------------------------------------------------------------------
  // Saha varlıkları ve servis kayıtları
  // -------------------------------------------------------------------------
  console.log('[SEED] Saha varliklari ve servis kayitlari...');

  const assetAnadolu = await prisma.installedAsset.create({
    data: {
      serialNo: 'MRP-PPT-2025-0113',
      customerId: anadolu.customer.id,
      orderId: orderAnadoluOld.id,
      productId: tank.id,
      name: 'Proses Tankı #1 - 1.000 L',
      location: 'Konya Tesisi / Hazırlık Bölümü',
      installedAt: daysAgo(118),
      commissionedAt: daysAgo(116),
      warrantyStart: daysAgo(116),
      warrantyEnd: daysAhead(614),
      status: AssetStatus.CALISIYOR,
      maintenanceIntervalMonths: 6,
      lastServiceAt: daysAgo(20),
      nextServiceAt: daysAhead(163),
    },
  });

  const assetMarmara = await prisma.installedAsset.create({
    data: {
      serialNo: 'MRP-KYM-2025-0087',
      customerId: marmaraOtomotiv.customer.id,
      orderId: orderMarmara.id,
      productId: washer.id,
      name: 'Konveyörlü Yıkama Makinesi - Hat 1',
      location: 'Bursa Tesisi / Hat-1',
      installedAt: daysAgo(226),
      commissionedAt: daysAgo(222),
      warrantyStart: daysAgo(222),
      warrantyEnd: daysAhead(508),
      status: AssetStatus.ARIZALI,
      maintenanceIntervalMonths: 4,
      lastServiceAt: daysAgo(130),
      nextServiceAt: daysAgo(8),
      notes: 'Konveyör tahrik zincirinde titreşim şikâyeti var.',
    },
  });

  const assetEge = await prisma.installedAsset.create({
    data: {
      serialNo: 'MRP-DOZ-2025-0061',
      customerId: egeKimya.customer.id,
      orderId: orderEge.id,
      productId: dosing.id,
      name: 'Dozajlama Ünitesi - 2 Hat',
      location: 'Aliağa OSB / Reaktör Sahası',
      installedAt: daysAgo(38),
      commissionedAt: daysAgo(36),
      warrantyStart: daysAgo(36),
      warrantyEnd: daysAhead(694),
      status: AssetStatus.CALISIYOR,
      maintenanceIntervalMonths: 6,
      nextServiceAt: daysAhead(146),
    },
  });

  await prisma.installedAsset.create({
    data: {
      serialNo: 'MRP-KYM-2024-0022',
      customerId: guneyMaden.customer.id,
      productId: washer.id,
      name: 'Cevher Yıkama Makinesi',
      location: 'Adana Sahası',
      installedAt: daysAgo(548),
      warrantyStart: daysAgo(548),
      warrantyEnd: daysAgo(183),
      status: AssetStatus.HIZMET_DISI,
      notes: 'Garanti süresi doldu. Müşteri ilişkisi soğuk; bakım sözleşmesi yok.',
    },
  });

  // --- Servis kayıtları ---
  const ticketMarmara = await prisma.serviceTicket.create({
    data: {
      ticketNo: 'SRV-2026-0001',
      customerId: marmaraOtomotiv.customer.id,
      assetId: assetMarmara.id,
      contactId: marmaraOtomotiv.contacts[2].id,
      orderId: orderMarmara.id,
      type: TicketType.ARIZA,
      status: TicketStatus.SAHADA,
      priority: Criticality.KRITIK,
      subject: 'Konveyör tahrik zincirinde aşırı titreşim',
      description: 'Hat-1 yıkama makinesinde 3 gündür artan titreşim ve gürültü. Üretim %60 kapasitede çalışıyor.',
      isWarranty: true,
      slaHours: 6,
      openedAt: daysAgo(2),
      dueAt: daysAgo(2),
      assigneeId: serviceChief.id,
    },
  });

  const visitMarmara = await prisma.serviceVisit.create({
    data: {
      ticketId: ticketMarmara.id,
      technicianId: serviceChief.id,
      rateId: rates['SV-TEK'].id,
      plannedAt: daysAgo(1),
      startedAt: daysAgo(1),
      workDone: 'Zincir gerginliği ölçüldü, tahrik rulmanında aşınma tespit edildi. Rulman seti değişimi yapıldı.',
      travelKm: 240,
      laborHours: 6.5,
      billable: false,
      customerSignedBy: 'Onur Bilgin',
      notes: 'Garanti kapsamında, ücretlendirilmeyecek.',
    },
  });

  await prisma.servicePart.create({
    data: {
      visitId: visitMarmara.id,
      materialId: materials['HM-011'].id,
      description: 'Endüstriyel Rulman Seti',
      quantity: 1,
      unit: 'set',
      unitPrice: materials['HM-011'].currentPrice,
      lineTotal: materials['HM-011'].currentPrice,
    },
  });

  await prisma.serviceVisit.update({
    where: { id: visitMarmara.id },
    data: { totalCost: rates['SV-TEK'].hourlyRate * 6.5 + materials['HM-011'].currentPrice },
  });

  await prisma.serviceTicket.create({
    data: {
      ticketNo: 'SRV-2026-0002',
      customerId: anadolu.customer.id,
      assetId: assetAnadolu.id,
      type: TicketType.PERIYODIK_BAKIM,
      status: TicketStatus.KAPANDI,
      priority: Criticality.ORTA,
      subject: '6 aylık periyodik bakım',
      description: 'Sözleşme kapsamındaki planlı bakım.',
      resolution: 'Contalar değiştirildi, karıştırıcı yatakları yağlandı, kalibrasyon yapıldı.',
      isWarranty: false,
      openedAt: daysAgo(24),
      dueAt: daysAgo(20),
      closedAt: daysAgo(20),
      assigneeId: serviceChief.id,
      visits: {
        create: {
          technicianId: serviceChief.id,
          rateId: rates['SV-TEK'].id,
          plannedAt: daysAgo(20),
          startedAt: daysAgo(20),
          endedAt: daysAgo(20),
          workDone: 'Planlı bakım tamamlandı, uygunsuzluk bulunmadı.',
          travelKm: 60,
          laborHours: 4,
          totalCost: rates['SV-TEK'].hourlyRate * 4,
          billable: true,
          customerSignedBy: 'Mehmet Korkmaz',
        },
      },
    },
  });

  await prisma.serviceTicket.create({
    data: {
      ticketNo: 'SRV-2026-0003',
      customerId: egeKimya.customer.id,
      assetId: assetEge.id,
      type: TicketType.EGITIM,
      status: TicketStatus.ATANDI,
      priority: Criticality.DUSUK,
      subject: 'Operatör tazeleme eğitimi talebi',
      description: 'Vardiya değişimi sonrası 4 yeni operatör için eğitim isteniyor.',
      isWarranty: false,
      openedAt: daysAgo(6),
      dueAt: daysAhead(9),
      assigneeId: serviceChief.id,
    },
  });

  await prisma.serviceTicket.create({
    data: {
      ticketNo: 'SRV-2026-0004',
      customerId: karadenizIcecek.customer.id,
      orderId: orderKaradeniz.id,
      type: TicketType.DEVREYE_ALMA,
      status: TicketStatus.ACIK,
      priority: Criticality.YUKSEK,
      subject: 'Dolum hattı devreye alma ve operatör eğitimi',
      description: 'Teslimat sonrası 2 günlük devreye alma + eğitim planlanacak.',
      isWarranty: false,
      openedAt: daysAgo(3),
      dueAt: daysAhead(40),
    },
  });

  await prisma.serviceTicket.create({
    data: {
      ticketNo: 'SRV-2026-0005',
      customerId: marmaraOtomotiv.customer.id,
      assetId: assetMarmara.id,
      type: TicketType.PERIYODIK_BAKIM,
      status: TicketStatus.ACIK,
      priority: Criticality.ORTA,
      subject: 'Gecikmiş 4 aylık periyodik bakım',
      description: 'Planlı bakım tarihi 8 gün geçti.',
      isWarranty: false,
      openedAt: daysAgo(8),
      dueAt: daysAgo(4),
      assigneeId: serviceChief.id,
    },
  });

  // -------------------------------------------------------------------------
  console.log('[SEED] Tamamlandi.');
  console.log('');
  console.log('  Demo kullanicilar (sifre: Marpol2026!)');
  console.log('  ------------------------------------------------');
  console.log('  admin        - Sistem Yoneticisi (tam yetki)');
  console.log('  ayse.yilmaz  - Satis Muduru (onay yetkisi, %20 iskonto)');
  console.log('  cem.aydin    - Satis Temsilcisi (%5 iskonto, ustu onaya duser)');
  console.log('  burak.sen    - Saha Servis Sefi (servis modulu)');
  console.log('');

  // Kullanılmayan referansları tüket (lint gürültüsünü önlemek için).
  void [admin, orderTrakya, oppMarmara, assetAnadolu];
}

main()
  .catch((err) => {
    console.error('[SEED] HATA:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
