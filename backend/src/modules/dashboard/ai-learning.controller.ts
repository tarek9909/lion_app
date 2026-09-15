import { Request, Response } from 'express';
import { conversationHarvesterService } from '../ai/dataset/conversation-harvester.service.js';
import { customerMemoryService } from '../ai/memory/customer-memory.service.js';
import { exportGeminiFineTuningJsonl } from '../ai/dataset/dataset-builder.js';
import { geminiTuningProvider } from '../ai/tuning/gemini-tuning-provider.js';
import { modelRegistryService } from '../ai/tuning/model-registry.service.js';
import { sendSuccess, sendError } from '../../shared/response.js';

export async function getAILearningQueue(req: Request, res: Response) {
  try {
    const status = req.query.status as 'PENDING' | 'HUMAN_APPROVED' | 'REJECTED' | undefined;
    const minScore = req.query.minScore ? parseInt(req.query.minScore as string, 10) : 0;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const queue = await conversationHarvesterService.getQueue({
      reviewStatus: status,
      minScore,
      limit,
    });

    // P0 Compliance: Guarantee review API never returns raw content
    const sanitizedQueue = queue.map((item) => ({
      id: item.id,
      publicId: item.publicId,
      conversationId: item.conversationId,
      customerId: item.customerId,
      turnIndex: item.turnIndex,
      correlationId: item.correlationId,
      datasetVersion: item.datasetVersion,
      senderLanguage: item.senderLanguage,
      userMessage: item.sanitizedUserMessage,
      assistantResponse: item.sanitizedModelResponse,
      detectedIntent: item.detectedIntent,
      toolCalls: item.toolCallsJson,
      qualityScore: item.qualityScore,
      conversionStatus: item.conversionStatus,
      reviewStatus: item.reviewStatus,
      createdAt: item.createdAt,
    }));

    return sendSuccess(res, {
      total: sanitizedQueue.length,
      queue: sanitizedQueue,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function reviewAILearningQueueItem(req: Request, res: Response) {
  try {
    const { publicId } = req.params;
    const { action, notes } = req.body;

    if (!['HUMAN_APPROVED', 'REJECTED'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ACTION', message: 'Action must be HUMAN_APPROVED or REJECTED' },
      });
    }

    const reviewerId = (req as any).user?.id || 1;
    const success = await conversationHarvesterService.reviewItem(publicId, action, reviewerId, notes);

    return sendSuccess(res, {
      publicId,
      status: action,
      success,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function triggerAILearningHarvest(req: Request, res: Response) {
  try {
    const limit = req.body.limit ? parseInt(req.body.limit, 10) : 50;
    const { harvested, checkpoint } = await conversationHarvesterService.harvestWithWatermark(limit);

    return sendSuccess(res, {
      message: `Harvested ${harvested.length} dialogue turns from consenting customers`,
      count: harvested.length,
      checkpoint,
      harvested: harvested.map((h) => ({
        publicId: h.publicId,
        conversationId: h.conversationId,
        turnIndex: h.turnIndex,
        qualityScore: h.qualityScore,
        reviewStatus: h.reviewStatus,
      })),
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function exportAILearningDataset(req: Request, res: Response) {
  try {
    const version = (req.body.version as string) || `v1.${Date.now()}`;
    const approvedItems = await conversationHarvesterService.getQueue({
      reviewStatus: 'HUMAN_APPROVED',
      limit: 5000,
    });

    if (approvedItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_APPROVED_DATA', message: 'No human-approved training items available to export.' },
      });
    }

    const datasetRecords = conversationHarvesterService.convertToDatasetRecords(approvedItems);
    const result = exportGeminiFineTuningJsonl(datasetRecords, undefined, version);

    return sendSuccess(res, {
      message: 'Successfully exported faithful, PII-scrubbed Gemini fine-tuning dataset',
      ...result,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function getCustomerMemory(req: Request, res: Response) {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    if (!customerId || isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CUSTOMER_ID', message: 'Valid customerId parameter required' },
      });
    }

    const prefs = await customerMemoryService.getPreferences(customerId);
    const promptText = customerMemoryService.formatPreferencesForPrompt(prefs);

    return sendSuccess(res, {
      preferences: prefs,
      promptContext: promptText,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function updateCustomerMemory(req: Request, res: Response) {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    if (!customerId || isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CUSTOMER_ID', message: 'Valid customerId parameter required' },
      });
    }

    const updated = await customerMemoryService.savePreferences(customerId, req.body);

    return sendSuccess(res, {
      message: 'Customer preferences updated and persisted across restarts',
      preferences: updated,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function setCustomerTrainingConsent(req: Request, res: Response) {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    const { allowAiTraining, source } = req.body;

    if (!customerId || isNaN(customerId) || typeof allowAiTraining !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMETERS', message: 'customerId and allowAiTraining boolean required' },
      });
    }

    const updated = await customerMemoryService.setAITrainingConsent(customerId, allowAiTraining, source);

    return sendSuccess(res, {
      message: `AI training consent updated to ${allowAiTraining}`,
      preferences: updated,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function eraseCustomerMemory(req: Request, res: Response) {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    if (!customerId || isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CUSTOMER_ID', message: 'Valid customerId parameter required' },
      });
    }

    const operatorId = (req as any).user?.id || 1;
    const success = await customerMemoryService.optOutAndEraseMemory(customerId, operatorId);

    return sendSuccess(res, {
      message: 'Customer memory, AI consent, and queued training data completely erased',
      success,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function triggerRetentionCleanup(req: Request, res: Response) {
  try {
    const retentionDays = req.body.retentionDays ? parseInt(req.body.retentionDays, 10) : 90;
    const result = await conversationHarvesterService.runRetentionPolicyCleanup(retentionDays);

    return sendSuccess(res, {
      message: `Retention cleanup finished. Purged ${result.deletedCount} expired items.`,
      ...result,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function submitTuningJob(req: Request, res: Response) {
  try {
    const { datasetVersion, baseModel, displayName, hyperparameters } = req.body;

    if (!datasetVersion) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DATASET_VERSION', message: 'datasetVersion is required' },
      });
    }

    const job = await geminiTuningProvider.submitTuningJob({
      datasetVersion,
      trainDatasetPath: `datasets/v1/gemini_train_${datasetVersion}.jsonl`,
      baseModel,
      displayName,
      hyperparameters,
    });

    // Auto-register model draft in registry
    const registered = await modelRegistryService.registerModel({
      modelName: job.displayName,
      baseModel: job.baseModel,
      version: datasetVersion,
      datasetVersion,
    });

    return sendSuccess(res, {
      message: 'Tuning job submitted successfully',
      job,
      registeredModel: registered,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function getTuningJobStatus(req: Request, res: Response) {
  try {
    const { jobId } = req.params;
    const status = await geminiTuningProvider.getTuningJobStatus(jobId);
    return sendSuccess(res, status);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function listModels(_req: Request, res: Response) {
  try {
    const models = await modelRegistryService.listModels();
    return sendSuccess(res, models);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function evaluateModel(req: Request, res: Response) {
  try {
    const { publicId } = req.params;
    const evalResult = await modelRegistryService.runOfflineEvaluationGate(publicId);

    return sendSuccess(res, {
      publicId,
      evalResult,
      promotionAllowed: evalResult.passed,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function promoteModel(req: Request, res: Response) {
  try {
    const { publicId } = req.params;
    const { stage, canaryPercentage } = req.body;
    const operatorId = (req as any).user?.id || 1;

    if (!['SHADOW', 'CANARY', 'STABLE'].includes(stage)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STAGE', message: 'Stage must be SHADOW, CANARY, or STABLE' },
      });
    }

    let success = false;
    if (stage === 'SHADOW') {
      success = await modelRegistryService.promoteToShadow(publicId, operatorId);
    } else if (stage === 'CANARY') {
      success = await modelRegistryService.promoteToCanary(publicId, canaryPercentage || 10, operatorId);
    }

    return sendSuccess(res, {
      publicId,
      stage,
      success,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function rollbackModel(req: Request, res: Response) {
  try {
    const { publicId } = req.params;
    const { reason } = req.body;
    const operatorId = (req as any).user?.id || 1;

    const success = await modelRegistryService.emergencyRollback(
      publicId,
      reason || 'Operator manual emergency rollback',
      operatorId
    );

    return sendSuccess(res, {
      publicId,
      action: 'EMERGENCY_ROLLBACK_TO_STABLE',
      success,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}
