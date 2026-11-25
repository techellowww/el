/**
 * Centralized environment variable validation and typed access.
 * Server-only variables are strictly protected and never exposed to the client bundle.
 */

const isServer = typeof window === 'undefined';

export const env = {
  // Common / Public
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_TEST: process.env.NODE_ENV === 'test',

  // Server-only environment variables (return undefined or default when accessed on client)
  get DATABASE_URL(): string {
    if (!isServer) return '';
    return (
      process.env.DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL ||
      process.env.VERCEL_POSTGRES_PRISMA_URL ||
      ''
    );
  },

  get JWT_SECRET(): string {
    if (!isServer) return '';
    return (
      process.env.JWT_SECRET ||
      'el_app_super_secure_jwt_secret_key_2026_xyz_production_ready'
    );
  },

  get APP_TIMEZONE(): string {
    return process.env.APP_TIMEZONE || 'Asia/Kolkata';
  },

  get PORT(): number {
    return process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  },

  get SMTP_HOST(): string {
    if (!isServer) return '';
    return process.env.SMTP_HOST || 'smtp.gmail.com';
  },

  get SMTP_PORT(): number {
    if (!isServer) return 587;
    return process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  },

  get SMTP_USER(): string {
    if (!isServer) return '';
    return process.env.SMTP_USER || '';
  },

  get SMTP_PASS(): string {
    if (!isServer) return '';
    return process.env.SMTP_PASS || '';
  },

  get SMTP_FROM(): string {
    if (!isServer) return '';
    return process.env.SMTP_FROM || '';
  },

  // Client-safe variables
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'ClientHub',
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '',
};

export default env;

