import { Request, Response } from 'express';
import { analyticsService } from './analytics.service.js';
import { sendSuccess, sendError } from '../../shared/response.js';

export async function getOverviewAnalytics(req: Request, res: Response) {
  try {
    const data = await analyticsService.getDemoAnalytics();
    return sendSuccess(res, data);
  } catch (error: any) {
    return sendError(res, error);
  }
}
