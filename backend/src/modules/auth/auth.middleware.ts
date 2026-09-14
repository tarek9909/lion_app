import { Request, Response, NextFunction } from 'express';
import { verifyToken, AuthTokenPayload } from './auth.service.js';
import { sendError } from '../../shared/response.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      requestId?: string;
    }
  }
}

/**
 * Authentication Middleware (G-004)
 * Validates JWT Bearer Token for Operator / Admin endpoints
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'Authorization token required', 401);
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);

  if (!payload) {
    return sendError(res, 'Invalid or expired authorization token', 401);
  }

  req.user = payload;
  next();
}

/**
 * Role-Based Access Control Middleware (G-005)
 */
export function requireRoles(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 'Authentication required', 401);
    }

    if (!allowedRoles.includes(req.user.role) && req.user.role !== 'SUPERADMIN') {
      return sendError(res, `Forbidden: Requires one of [${allowedRoles.join(', ')}]`, 403);
    }

    next();
  };
}
