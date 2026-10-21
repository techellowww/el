import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './routes/auth.routes';
import timerRoutes from './routes/timer.routes';
import projectsRoutes from './routes/projects.routes';
import timeEntriesRoutes from './routes/timeEntries.routes';
import correctionsRoutes from './routes/corrections.routes';
import employeesRoutes from './routes/employees.routes';
import dashboardRoutes from './routes/dashboard.routes';
import reportsRoutes from './routes/reports.routes';
import settingsRoutes from './routes/settings.routes';
import screenshotsRoutes from './routes/screenshots.routes';
import { initBackgroundScheduler } from './lib/cronScheduler';

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

const allowedOrigins = [
  CLIENT_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/timer', timerRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/time-entries', timeEntriesRoutes);
app.use('/api/corrections', correctionsRoutes);
app.use('/api/admin/employees', employeesRoutes);
app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/admin', settingsRoutes); // for /api/admin/audit-logs
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/screenshots', screenshotsRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'EL App Backend API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Start Background Worker & Scheduler
initBackgroundScheduler();

app.listen(PORT, () => {
  console.log(`🚀 EL App Backend Server running on http://localhost:${PORT}`);
  console.log(`📡 CORS configured for origin: ${CLIENT_URL}`);
});
