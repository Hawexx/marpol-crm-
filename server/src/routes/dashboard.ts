import { Router } from 'express';
import {
  ContractStatus,
  ModuleKey,
  OpportunityStage,
  OrderStatus,
  QuoteStatus,
  TaskStatus,
  TicketStatus,
} from '@prisma/client';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { analyzeBehavior, type CustomerFacts } from '../services/analytics.js';
import { checkErpConnection } from '../services/erp.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

/** RFM girdilerini siparis gecmisinden toplar. */
async function collectFacts(): Promise<CustomerFacts[]> {
  const now = Date.now();
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      createdAt: true,
      orders: { select: { orderDate: true, totalAmount: true, status: true } },
    },
  });

  return customers.map((c) => {
    const valid = c.orders.filter((o) => o.status !== OrderStatus.IPTAL);
    const last = valid.reduce<Date | null>(
      (acc, o) => (!acc || o.orderDate > acc ? o.orderDate : acc),
      null,
    );
    return {
      customerId: c.id,
      recencyDays: last ? Math.floor((now - last.getTime()) / 86_400_000) : null,
      frequency: valid.length,
      monetary: valid.reduce((sum, o) => sum + o.totalAmount, 0),
      ageDays: Math.floor((now - c.createdAt.getTime()) / 86_400_000),
    };
  });
}

dashboardRouter.get(
  '/',
  requirePermission(ModuleKey.GOSTERGE_PANELI, 'view'),
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const soon = new Date(Date.now() + 30 * 86_400_000);

    const [
      customerCount,
      openOpportunities,
      pipeline,
      openQuotes,
      pendingApproval,
      orderAgg,
      activeOrders,
      lateOrders,
      openTickets,
      overdueTickets,
      expiringContracts,
      overdueTasks,
      upcomingTasks,
      recentInteractions,
      recentOrders,
    ] = await Promise.all([
      prisma.customer.count({ where: { isActive: true } }),
      prisma.opportunity.count({
        where: { stage: { notIn: [OpportunityStage.KAZANILDI, OpportunityStage.KAYBEDILDI] } },
      }),
      prisma.opportunity.findMany({
        where: { stage: { notIn: [OpportunityStage.KAZANILDI, OpportunityStage.KAYBEDILDI] } },
        select: { expectedValue: true, probability: true, stage: true },
      }),
      prisma.quote.count({
        where: {
          isCurrent: true,
          status: { in: [QuoteStatus.GONDERILDI, QuoteStatus.PAZARLIK, QuoteStatus.TASLAK] },
        },
      }),
      prisma.quote.count({ where: { status: QuoteStatus.ONAY_BEKLIYOR } }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: { not: OrderStatus.IPTAL } },
      }),
      prisma.order.count({
        where: {
          status: { in: [OrderStatus.ONAYLANDI, OrderStatus.URETIMDE, OrderStatus.KISMI_SEVK] },
        },
      }),
      prisma.order.count({
        where: {
          promisedDate: { lt: now },
          status: { notIn: [OrderStatus.TESLIM_EDILDI, OrderStatus.FATURALANDI, OrderStatus.IPTAL] },
        },
      }),
      prisma.serviceTicket.count({
        where: { status: { notIn: [TicketStatus.COZULDU, TicketStatus.KAPANDI] } },
      }),
      prisma.serviceTicket.count({
        where: {
          dueAt: { lt: now },
          status: { notIn: [TicketStatus.COZULDU, TicketStatus.KAPANDI] },
        },
      }),
      prisma.contract.count({
        where: {
          status: ContractStatus.YURURLUKTE,
          OR: [{ endDate: { lte: soon, gte: now } }, { renewalDate: { lte: soon, gte: now } }],
        },
      }),
      prisma.task.count({ where: { status: TaskStatus.ACIK, dueAt: { lt: now } } }),
      prisma.task.findMany({
        where: { status: TaskStatus.ACIK },
        include: {
          customer: { select: { id: true, code: true, name: true } },
          assignee: { select: { id: true, fullName: true } },
        },
        orderBy: { dueAt: 'asc' },
        take: 8,
      }),
      prisma.interaction.findMany({
        include: {
          customer: { select: { id: true, code: true, name: true } },
          contact: { select: { id: true, fullName: true } },
          user: { select: { id: true, fullName: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: 8,
      }),
      prisma.order.findMany({
        include: { customer: { select: { id: true, code: true, name: true } } },
        orderBy: { orderDate: 'desc' },
        take: 8,
      }),
    ]);

    // Davranis analizi: segment dagilimi + dikkat gerektiren musteriler.
    const behavior = analyzeBehavior(await collectFacts());
    const segmentDistribution: Record<string, number> = {};
    for (const row of behavior) {
      segmentDistribution[row.segment] = (segmentDistribution[row.segment] ?? 0) + 1;
    }

    const atRiskIds = behavior.filter((b) => b.churnRisk === 'yuksek').map((b) => b.customerId);

    // Riskli ama uzerinde acik gorevi olmayan musteriler - proaktif aksiyon listesi.
    const [riskCustomers, tasksForRisk] = await Promise.all([
      prisma.customer.findMany({
        where: { id: { in: atRiskIds }, isActive: true },
        select: { id: true, code: true, name: true, industry: true, ownerId: true },
      }),
      prisma.task.findMany({
        where: { customerId: { in: atRiskIds }, status: TaskStatus.ACIK },
        select: { customerId: true },
      }),
    ]);

    const hasTask = new Set(tasksForRisk.map((t) => t.customerId));
    const behaviorById = new Map(behavior.map((b) => [b.customerId, b]));

    const attentionNeeded = riskCustomers
      .filter((c) => !hasTask.has(c.id))
      .map((c) => ({
        ...c,
        segment: behaviorById.get(c.id)?.segment ?? '-',
        recencyDays: behaviorById.get(c.id)?.recencyDays ?? null,
        purchaseProbability: behaviorById.get(c.id)?.purchaseProbability ?? 0,
      }))
      .slice(0, 8);

    res.json({
      customerCount,
      openOpportunities,
      pipelineValue: pipeline.reduce((s, o) => s + o.expectedValue, 0),
      weightedPipeline: pipeline.reduce((s, o) => s + o.expectedValue * (o.probability / 100), 0),
      openQuotes,
      pendingApproval,
      lifetimeValue: orderAgg._sum.totalAmount ?? 0,
      activeOrders,
      lateOrders,
      openTickets,
      overdueTickets,
      expiringContracts,
      overdueTasks,
      segmentDistribution,
      attentionNeeded,
      upcomingTasks,
      recentInteractions,
      recentOrders,
    });
  }),
);

/** ShellBar seridi icin kisa canli ozet. */
dashboardRouter.get(
  '/ticker',
  requirePermission(ModuleKey.GOSTERGE_PANELI, 'view'),
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const [customers, opportunities, quotes, activeOrders, lateOrders, openTickets] =
      await Promise.all([
        prisma.customer.count({ where: { isActive: true } }),
        prisma.opportunity.count({
          where: { stage: { notIn: [OpportunityStage.KAZANILDI, OpportunityStage.KAYBEDILDI] } },
        }),
        prisma.quote.count({
          where: { isCurrent: true, status: { in: [QuoteStatus.GONDERILDI, QuoteStatus.PAZARLIK] } },
        }),
        prisma.order.count({
          where: { status: { in: [OrderStatus.ONAYLANDI, OrderStatus.URETIMDE] } },
        }),
        prisma.order.count({
          where: {
            promisedDate: { lt: now },
            status: { notIn: [OrderStatus.TESLIM_EDILDI, OrderStatus.FATURALANDI, OrderStatus.IPTAL] },
          },
        }),
        prisma.serviceTicket.count({
          where: { status: { notIn: [TicketStatus.COZULDU, TicketStatus.KAPANDI] } },
        }),
      ]);

    res.json({ customers, opportunities, quotes, activeOrders, lateOrders, openTickets });
  }),
);

/** ERP baglanti rozeti. */
dashboardRouter.get(
  '/erp',
  requirePermission(ModuleKey.GOSTERGE_PANELI, 'view'),
  asyncHandler(async (req, res) => {
    const status = await checkErpConnection();

    // Ic ag adresi ve ham hata metni yalnizca yoneticiye gosterilir;
    // digerleri icin rozet "bagli / bagli degil" bilgisiyle yeter.
    if (req.user!.isAdmin) {
      res.json(status);
      return;
    }

    res.json({
      enabled: status.enabled,
      connected: status.connected,
      baseUrl: null,
      message: status.connected
        ? 'Uretim sistemine baglanti kuruldu.'
        : status.enabled
          ? 'Uretim sistemine su an ulasilamiyor.'
          : 'ERP entegrasyonu kapali.',
    });
  }),
);
