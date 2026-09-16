import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Valid email address required'),
  password: z.string().min(1, 'Password is required'),
});

export const simulateMessageSchema = z.object({
  from: z.string().optional(),
  phone: z.string().optional(),
  text: z.string().optional(),
  message: z.string().optional(),
  mediaType: z.enum(['text', 'audio', 'image', 'location']).optional().default('text'),
  mediaUrl: z.string().optional(),
  audioUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  voiceTranscriptHint: z.string().optional(),
  mediaId: z.string().optional(),
  mimeType: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
}).passthrough().refine(data => data.from || data.phone, {
  message: 'Phone number is required (from or phone)',
});

export const managementAiSchema = z.object({
  question: z.string().min(1, 'Question must not be empty'),
});

export const merchantAcceptSchema = z.object({
  preparationMinutes: z.number().int().min(1).max(180).optional(),
  prepMinutes: z.number().int().min(1).max(180).optional(),
});

export const merchantRejectSchema = z.object({
  reason: z.string().optional(),
});

export const driverAcceptSchema = z.object({
  driverId: z.number().int().positive().optional(),
});

export const driverDeliverSchema = z.object({
  rating: z.number().min(1).max(5).optional(),
  comment: z.string().optional(),
  feedback: z.string().optional(),
});

export const driverRejectSchema = z.object({
  driverId: z.number().int().positive().optional(),
  reason: z.string().optional(),
});

export const merchantReadySchema = z.object({
  notes: z.string().optional(),
});

export const relayMessageSchema = z.object({
  text: z.string().optional(),
  message: z.string().optional(),
  senderRole: z.enum(['CUSTOMER', 'DRIVER', 'SYSTEM', 'OPERATOR']).optional(),
  senderType: z.enum(['CUSTOMER', 'DRIVER', 'SYSTEM', 'OPERATOR']).optional(),
}).refine(data => Boolean((data.text && data.text.trim()) || (data.message && data.message.trim())), {
  message: 'Message text is required (text or message)',
});

export const whatsappInboxReplySchema = z.object({
  text: z.string().trim().min(1, 'Message text is required').max(4096, 'Message is too long'),
});

export const whatsappAccessTokenSchema = z.object({
  accessToken: z.string().trim().min(20, 'WhatsApp access token is required').max(4096, 'WhatsApp access token is too long'),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID must be a positive integer'),
});

export const orderIdParamSchema = z.object({
  orderId: z.coerce.number().int().positive('Order ID must be a positive integer'),
});
