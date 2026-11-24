import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const EPHEMERAL_JWT_SECRET = crypto.randomBytes(32).toString('hex');

export const ENV = {
  PORT: Number(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI?.trim() || '',
  JWT_SECRET: process.env.JWT_SECRET?.trim() || EPHEMERAL_JWT_SECRET,
  JWT_EXPIRES_IN: '24h' as const,
};
