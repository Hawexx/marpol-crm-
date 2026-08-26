import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './env.js';
import { errorHandler, notFound } from './lib/http.js';
import { apiLimiter, securityHeaders } from './lib/security.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { customersRouter, tasksRouter } from './routes/customers.js';
import { opportunitiesRouter } from './routes/opportunities.js';
import { catalogRouter } from './routes/catalog.js';
import { pricingRouter } from './routes/pricing.js';
import { quotesRouter } from './routes/quotes.js';
import { ordersRouter } from './routes/orders.js';
import { documentsRouter } from './routes/documents.js';
import { contractsRouter } from './routes/contracts.js';
import { serviceRouter } from './routes/service.js';
import { dashboardRouter } from './routes/dashboard.js';

const app = express();

// Ters vekil arkasindayken req.ip gercek istemciyi gostermeli;
// aksi halde hiz sinirlayici tum trafigi tek IP sanar.
if (env.trustProxy) app.set('trust proxy', env.trustProxy);

// Sunucu kimligini sizdirmaya gerek yok.
app.disable('x-powered-by');

app.use(securityHeaders);

const allowedOrigins = env.corsOrigin
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    // Oturum jetonu Authorization basliginda tasinir; cerez gonderilmez.
    credentials: false,
    maxAge: 600,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.isProduction ? 'combined' : 'dev'));
app.use('/api', apiLimiter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'marpol-crm-api', time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/opportunities', opportunitiesRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/pricing', pricingRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/service', serviceRouter);
app.use('/api/dashboard', dashboardRouter);

app.use((_req, _res, next) => next(notFound('Istenen servis bulunamadi.')));
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`[MARPOL CRM] API calisiyor -> http://localhost:${env.port}`);
});
