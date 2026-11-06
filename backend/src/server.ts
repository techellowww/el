import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { prisma } from './lib/prisma';
import { initChatSocketServer, broadcastChatMessage } from './chat/socketServer';
import { initBackgroundScheduler } from './lib/cronScheduler';

dotenv.config();

const app = express();
const CHAT_PORT = process.env.CHAT_SERVER_PORT || process.env.PORT || 5001;
const CLIENT_URL = process.env.CLIENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const allowedOrigins = [
  CLIENT_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      try {
        const url = new URL(origin);
        if (
          allowedOrigins.includes(origin) ||
          url.hostname.endsWith('.vercel.app') ||
          url.hostname === 'localhost' ||
          url.hostname === '127.0.0.1'
        ) {
          return callback(null, true);
        }
      } catch {}
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Internal broadcast endpoint for client portal messages
app.post('/api/internal/chat/broadcast', (req: express.Request, res: express.Response) => {
  try {
    const { accountId, conversationId, message } = req.body || {};
    if (!accountId || !conversationId || !message) {
      return res.status(400).json({ error: 'Missing accountId, conversationId, or message' });
    }
    const sent = broadcastChatMessage(accountId, conversationId, message);
    res.json({ success: sent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Health Check Endpoint
app.get('/health', async (req: express.Request, res: express.Response) => {
  try {
    // Quick DB ping
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      service: 'EL App Real-time Socket.IO Chat & Background Scheduler',
      port: Number(CHAT_PORT),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (dbErr: any) {
    res.status(500).json({
      status: 'error',
      service: 'EL App Real-time Socket.IO Chat & Background Scheduler',
      error: 'Database connection failed',
      details: dbErr.message,
    });
  }
});

const httpServer = http.createServer(app);

// Initialize Dedicated Socket.io Real-time Chat Server
initChatSocketServer(httpServer);

// Initialize Background Worker & Scheduler
initBackgroundScheduler();

httpServer.listen(CHAT_PORT, () => {
  console.log(`🚀 EL App Real-time Chat Server running on http://localhost:${CHAT_PORT}`);
  console.log(`💬 Socket.IO chat endpoint listening on port ${CHAT_PORT}`);
  console.log(`⏰ Background scheduler active for office cutoff, screenshots, and automated email reports.`);
});

export default httpServer;
