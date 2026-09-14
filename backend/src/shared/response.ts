import { Response } from 'express';

export class AppError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode: number = 400, code: string = 'BAD_REQUEST') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function sendSuccess(res: Response, data: any, statusCode: number = 200, meta?: any) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: res.req?.headers['x-request-id'] || undefined,
      ...meta,
    },
  });
}

export function sendError(res: Response, error: string | AppError | Error, statusCode: number = 400) {
  const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
  const rawMessage = typeof error === 'string' ? error : error.message;
  const status = error instanceof AppError ? error.statusCode : statusCode;

  // Log raw error on server with request context
  console.error(`[API Error] [${res.req?.method} ${res.req?.url}]:`, error);

  // Safe Customer-Facing Error Sanitization (G-008)
  let safeMessage = rawMessage;
  if (
    rawMessage.includes('ER_') ||
    rawMessage.includes('SELECT') ||
    rawMessage.includes('INSERT') ||
    rawMessage.includes('UPDATE') ||
    rawMessage.includes('DELETE') ||
    rawMessage.includes('sqlMessage') ||
    rawMessage.includes('ECONNREFUSED')
  ) {
    safeMessage = 'A temporary database or service error occurred. Please try again.';
  }

  return res.status(status).json({
    success: false,
    error: {
      code,
      message: safeMessage,
      requestId: res.req?.headers['x-request-id'] || undefined,
    },
  });
}
