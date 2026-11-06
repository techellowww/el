import dotenv from 'dotenv';
import { initBackgroundScheduler } from './lib/cronScheduler';

dotenv.config();

console.log('🚀 Starting EL App standalone background worker...');
initBackgroundScheduler();

// Keep process alive
process.on('SIGINT', () => {
  console.log('Gracefully shutting down background worker...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Gracefully terminating background worker...');
  process.exit(0);
});
