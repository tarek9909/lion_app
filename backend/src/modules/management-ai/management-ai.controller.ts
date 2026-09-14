import { Request, Response } from 'express';
import { managementAIService } from './management-ai.service.js';
import { sendSuccess, sendError } from '../../shared/response.js';

export async function askManagementAI(req: Request, res: Response) {
  try {
    const { question } = req.body;
    if (!question) return sendError(res, 'Question is required');

    const result = await managementAIService.askQuestion(question);
    return sendSuccess(res, result);
  } catch (error: any) {
    return sendError(res, error);
  }
}
