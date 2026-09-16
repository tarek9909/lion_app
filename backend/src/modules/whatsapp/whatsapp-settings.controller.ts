import { Request, Response } from 'express';
import { sendError, sendSuccess } from '../../shared/response.js';
import { whatsappCredentialService } from './whatsapp-credential.service.js';

export async function getWhatsAppCredentialStatus(_req: Request, res: Response) {
  try {
    return sendSuccess(res, await whatsappCredentialService.getStatus());
  } catch (error: any) {
    return sendError(res, error, 500);
  }
}

export async function saveWhatsAppAccessToken(req: Request, res: Response) {
  try {
    await whatsappCredentialService.saveAccessToken(req.body.accessToken, Number(req.user!.userId));
    return sendSuccess(res, await whatsappCredentialService.getStatus());
  } catch (error: any) {
    return sendError(res, error, 400);
  }
}
