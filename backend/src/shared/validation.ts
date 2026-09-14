import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from './response.js';

/**
 * Express middleware to validate request body using Zod schema (G-004)
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err: any) {
      if (err instanceof ZodError) {
        const issues = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        return sendError(res, `Invalid request body: ${issues}`, 400);
      }
      return sendError(res, 'Invalid request payload', 400);
    }
  };
}

/**
 * Express middleware to validate request query parameters (G-004)
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (err: any) {
      if (err instanceof ZodError) {
        const issues = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        return sendError(res, `Invalid query parameters: ${issues}`, 400);
      }
      return sendError(res, 'Invalid query parameters', 400);
    }
  };
}

/**
 * Express middleware to validate route parameters (G-004)
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (err: any) {
      if (err instanceof ZodError) {
        const issues = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        return sendError(res, `Invalid route parameters: ${issues}`, 400);
      }
      return sendError(res, 'Invalid route parameters', 400);
    }
  };
}
