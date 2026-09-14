import { Request, Response } from 'express';
import { catalogService } from './catalog.service.js';
import { sendSuccess, sendError } from '../../shared/response.js';

export async function getMerchants(req: Request, res: Response) {
  try {
    const merchants = await catalogService.getAllMerchants();
    return sendSuccess(res, merchants);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function getProducts(req: Request, res: Response) {
  try {
    const products = await catalogService.getAllProducts();
    return sendSuccess(res, products);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function searchProducts(req: Request, res: Response) {
  try {
    const q = req.query.q as string || '';
    const budget = req.query.budget ? parseFloat(req.query.budget as string) : undefined;
    const pref = req.query.preference as any;
    const results = await catalogService.searchProducts(q, budget, pref);
    return sendSuccess(res, results);
  } catch (error: any) {
    return sendError(res, error);
  }
}
