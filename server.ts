import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { ENV } from './server/config/env.js';
import { connectDatabase } from './server/db/repository.js';
import { apiRouter } from './server/routes/api.js';

async function startServer(): Promise<void> {
  const dbInfo = await connectDatabase();
  const app = express();

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '4mb' }));

  // Health probe
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, database: dbInfo.mode });
  });

  // REST API routes
  app.use('/api', apiRouter);

  // API 404 handler
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (ENV.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(ENV.PORT, '0.0.0.0', () => {
    console.log(
      `[StockMaster] Server running on http://localhost:${ENV.PORT} (storage: ${dbInfo.mode})`
    );
  });
}

startServer().catch((err) => {
  console.error('[StockMaster] Fatal startup error:', err);
  process.exit(1);
});
