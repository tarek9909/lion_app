import { Request, Response } from 'express';
import { conversationHarvesterService } from '../ai/dataset/conversation-harvester.service.js';
import { customerMemoryService } from '../ai/memory/customer-memory.service.js';
import { exportGeminiFineTuningJsonl } from '../ai/dataset/dataset-builder.js';
import { geminiTuningProvider } from '../ai/tuning/gemini-tuning-provider.js';
import { modelRegistryService } from '../ai/tuning/model-registry.service.js';
import { caseBuilderService } from '../ai/learning/case-builder.service.js';
import { promptExperimentService } from '../ai/learning/prompt-experiment.service.js';
import { query, execute } from '../../database/db.js';
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

// -----------------------------------------------------------------------------
// OPERATOR WORKBENCH: 1. FAILURE INBOX & 2. CASE EDITOR
// -----------------------------------------------------------------------------

export async function getLearningCases(req: Request, res: Response) {
  try {
    const status = req.query.status as any;
    const rootCause = req.query.rootCause as string | undefined;
    const minPriority = req.query.minPriority ? parseInt(req.query.minPriority as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const cases = await caseBuilderService.getCases({
      status,
      rootCause,
      minPriority,
      limit,
    });

    return sendSuccess(res, {
      total: cases.length,
      cases,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function reviewLearningCase(req: Request, res: Response) {
  try {
    const { publicId } = req.params;
    const reviewerId = (req as any).user?.id || 1;
    const {
      status,
      notes,
      correctedIntent,
      correctedEntities,
      correctedTool,
      correctedArgs,
      correctedState,
      correctedReply,
      requiredFacts,
      forbiddenFacts,
    } = req.body;

    if (!['HUMAN_APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Status must be HUMAN_APPROVED or REJECTED' },
      });
    }

    const success = await caseBuilderService.reviewCase(publicId, {
      reviewerId,
      status,
      notes,
      correctedIntent,
      correctedEntities,
      correctedTool,
      correctedArgs,
      correctedState,
      correctedReply,
      requiredFacts,
      forbiddenFacts,
    });

    return sendSuccess(res, { publicId, status, success });
  } catch (error: any) {
    return sendError(res, error);
  }
}

// -----------------------------------------------------------------------------
// OPERATOR WORKBENCH: 3. MEMORY INSPECTOR
// -----------------------------------------------------------------------------

export async function listAllCustomerMemoryItems(req: Request, res: Response) {
  try {
    const customerId = req.query.customerId ? parseInt(req.query.customerId as string, 10) : undefined;
    let sql = `
      SELECT m.*, c.display_name, c.whatsapp_number
      FROM customer_memory_items m
      LEFT JOIN customers c ON m.customer_id = c.id
    `;
    const params: any[] = [];
    if (customerId) {
      sql += ` WHERE m.customer_id = ?`;
      params.push(customerId);
    }
    sql += ` ORDER BY m.id DESC LIMIT 100`;

    const items = await query<any[]>(sql, params);
    return sendSuccess(res, {
      total: items.length,
      items: items.map((i) => ({
        id: Number(i.id),
        publicId: i.public_id,
        customerId: Number(i.customer_id),
        customerName: i.display_name || `Customer #${i.customer_id}`,
        customerPhone: i.whatsapp_number,
        kind: i.kind,
        canonicalValue: i.canonical_value,
        customerExpression: i.customer_expression,
        scope: i.scope,
        status: i.status,
        confidence: Number(i.confidence),
        evidenceCount: Number(i.evidence_count),
        confirmedAt: i.confirmed_at,
        expiresAt: i.expires_at,
        createdAt: i.created_at,
      })),
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function confirmCustomerMemoryItem(req: Request, res: Response) {
  try {
    const { publicId } = req.params;
    const resUpdate: any = await execute(
      `UPDATE customer_memory_items
       SET status = 'CUSTOMER_CONFIRMED', confidence = 1.0, confirmed_at = NOW(), updated_at = NOW()
       WHERE public_id = ?`,
      [publicId]
    );

    return sendSuccess(res, {
      publicId,
      confirmed: (resUpdate?.affectedRows || 0) > 0,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function deleteCustomerMemoryItem(req: Request, res: Response) {
  try {
    const { publicId } = req.params;
    const resDelete: any = await execute(
      `DELETE FROM customer_memory_items WHERE public_id = ?`,
      [publicId]
    );

    return sendSuccess(res, {
      publicId,
      deleted: (resDelete?.affectedRows || 0) > 0,
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

// -----------------------------------------------------------------------------
// OPERATOR WORKBENCH: 4. DATASET & EXPERIMENT REGISTRY
// -----------------------------------------------------------------------------

export async function listPromptVersions(_req: Request, res: Response) {
  try {
    const prompts = await promptExperimentService.listPrompts();
    return sendSuccess(res, prompts);
  } catch (error: any) {
    return sendError(res, error);
  }
}

export async function activatePromptVersion(req: Request, res: Response) {
  try {
    const { version } = req.params;
    const success = await promptExperimentService.activatePromptVersion(version);
    return sendSuccess(res, { version, active: success });
  } catch (error: any) {
    return sendError(res, error);
  }
}

// -----------------------------------------------------------------------------
// OPERATOR WORKBENCH: 5. LIVE QUALITY DASHBOARD METRICS
// -----------------------------------------------------------------------------

export async function getLearningDashboardMetrics(_req: Request, res: Response) {
  try {
    // 1. Language Slices
    const languageStats = await query<any[]>(`
      SELECT sender_language, COUNT(*) as turns_count
      FROM training_curation_queue
      GROUP BY sender_language
    `);

    // 2. Intent Distribution
    const intentStats = await query<any[]>(`
      SELECT detected_intent, COUNT(*) as count
      FROM training_curation_queue
      GROUP BY detected_intent
      ORDER BY count DESC LIMIT 8
    `);

    // 3. Learning Cases by Root Cause
    const rootCauses = await query<any[]>(`
      SELECT root_cause, COUNT(*) as count
      FROM ai_learning_cases
      GROUP BY root_cause
      ORDER BY count DESC
    `);

    // 4. Outcomes Summary
    const outcomes = await query<any[]>(`
      SELECT
        COUNT(*) as total_outcomes,
        AVG(safety_score) as avg_safety,
        AVG(groundedness_score) as avg_groundedness,
        AVG(intent_score) as avg_intent,
        AVG(tool_success_score) as avg_tool_success,
        AVG(overall_score) as avg_overall
      FROM ai_turn_outcomes
    `);

    // 5. Memory Items Summary
    const memoryStats = await query<any[]>(`
      SELECT status, COUNT(*) as count
      FROM customer_memory_items
      GROUP BY status
    `);

    // 6. Router Status
    const routerConfig = await query<any[]>(`
      SELECT routing_mode, canary_percentage, stable_provider, candidate_provider, stable_model_endpoint, candidate_model_endpoint
      FROM ai_routing_config WHERE id = 1 LIMIT 1
    `);

    return sendSuccess(res, {
      languageStats: languageStats || [],
      intentStats: intentStats || [],
      rootCauses: rootCauses || [],
      outcomes: outcomes?.[0] || {
        total_outcomes: 0,
        avg_safety: 1.0,
        avg_groundedness: 1.0,
        avg_intent: 1.0,
        avg_tool_success: 1.0,
        avg_overall: 1.0,
      },
      memoryStats: memoryStats || [],
      router: routerConfig?.[0] || {
        routing_mode: 'STABLE_ONLY',
        canary_percentage: 0,
        stable_provider: 'gemini',
        candidate_provider: 'gemini',
      },
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}

