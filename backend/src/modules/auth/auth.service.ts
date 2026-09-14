import crypto from 'crypto';
import { config } from '../../config/env.js';

export function hashPassword(password: string, salt: string = 'lion_demo_salt_2026_pbkdf2'): string {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `pbkdf2:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (storedHash.startsWith('pbkdf2:')) {
    const parts = storedHash.split(':');
    if (parts.length === 3) {
      const [, salt, originalHash] = parts;
      const calculated = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
      return calculated === originalHash;
    }
  }
  // Fallback to direct check or default salt
  const fallback = crypto.pbkdf2Sync(password, 'lion_demo_salt_2026_pbkdf2', 10000, 64, 'sha512').toString('hex');
  return fallback === storedHash || password === storedHash;
}

export interface AuthTokenPayload {
  userId: number;
  publicId: string;
  email: string;
  role: string;
  driverId?: number;
  customerId?: number;
  exp: number;
}

export function signToken(payload: Omit<AuthTokenPayload, 'exp'>, expiresInHours: number = 24): string {
  const fullPayload: AuthTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInHours * 3600,
  };

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', config.jwtSecret)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;

    const expectedSignature = crypto
      .createHmac('sha256', config.jwtSecret)
      .update(`${header}.${body}`)
      .digest('base64url');

    if (signature !== expectedSignature) {
      return null;
    }

    const payload: AuthTokenPayload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}
