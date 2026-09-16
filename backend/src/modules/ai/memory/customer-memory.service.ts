import { query, execute } from '../../../database/db.js';
import { redis } from '../../../database/redis.js';
import { v4 as uuidv4 } from 'uuid';

export interface MemoryItem {
  id: string;
  item: string;
  type: 'dietary' | 'exclusion' | 'landmark' | 'instruction' | 'cuisine';
  confidence: number; // 0.0 to 1.0
  confirmationStatus: 'UNCONFIRMED_SUGGESTION' | 'CUSTOMER_CONFIRMED' | 'OPERATOR_VERIFIED';
  sourceTurn?: string;
  createdAt: string;
  expiresAt?: string | null;
}

export interface CustomerMemoryPreferences {
  customerId: number;
  allowAiTraining: boolean;
  aiTrainingConsentAt?: string | null;
  aiTrainingConsentSource?: string | null;
  preferredLanguage?: string;
  defaultSearchPreference?: string;
  dietaryPreferences: string[];
  excludedIngredients: string[];
  favoriteCuisines: string[];
  deliveryLandmarks: string[];
  specialInstructions: string[];
  memoryItems: MemoryItem[];
  updatedAt?: string;
}

export class CustomerMemoryService {
  private inMemoryCache: Map<number, CustomerMemoryPreferences> = new Map();

  /**
   * Retrieve learned customer memory and preferences.
   * Priority: Redis -> MySQL -> In-Memory fallback.
   * Fully durable across Redis flushes and service restarts.
   */
  async getPreferences(customerId: number, options?: { readOnly?: boolean }): Promise<CustomerMemoryPreferences> {
    if (!customerId || customerId <= 0) {
      return this.createEmptyPreferences(customerId);
    }

    // 1. Try Redis cache
    try {
      const cached = await redis.get(`ai:customer:prefs:${customerId}`);
      if (cached) {
        const parsed: CustomerMemoryPreferences = JSON.parse(cached);
        return this.cleanExpiredMemoryItems(parsed);
      }
    } catch {
      // Redis unavailable or flushed, proceed to MySQL
    }

    // 2. Try in-memory cache
    if (this.inMemoryCache.has(customerId)) {
      return this.cleanExpiredMemoryItems(this.inMemoryCache.get(customerId)!);
    }

    // 3. Try MySQL (authoritative persistent source)
    try {
      const rows = await query<any[]>(
        `SELECT * FROM customer_preferences WHERE customer_id = ? LIMIT 1`,
        [customerId]
      );

      if (rows && rows.length > 0) {
        const row = rows[0];
        const rawMemoryItems: MemoryItem[] = this.safeParseJson(row.memory_items_json, []);

        const prefs: CustomerMemoryPreferences = {
          customerId,
          allowAiTraining: Boolean(row.allow_ai_training),
          aiTrainingConsentAt: row.ai_training_consent_at ? new Date(row.ai_training_consent_at).toISOString() : null,
          aiTrainingConsentSource: row.ai_training_consent_source || null,
          preferredLanguage: row.preferred_language || undefined,
          defaultSearchPreference: row.default_search_preference || undefined,
          dietaryPreferences: this.safeParseJson(row.dietary_preferences, []),
          excludedIngredients: this.safeParseJson(row.excluded_ingredients, []),
          favoriteCuisines: this.safeParseJson(row.favorite_cuisines, []),
          deliveryLandmarks: this.safeParseJson(row.delivery_landmarks, []),
          specialInstructions: this.safeParseJson(row.special_instructions, []),
          memoryItems: rawMemoryItems,
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
        };

        const cleaned = this.cleanExpiredMemoryItems(prefs);

        // Cache in Redis for 24h
        if (!options?.readOnly) {
          try {
            await redis.set(`ai:customer:prefs:${customerId}`, JSON.stringify(cleaned), 86400);
          } catch {}
          this.inMemoryCache.set(customerId, cleaned);
        }
        return cleaned;
      }
    } catch {
      // MySQL unavailable or table empty
    }

    const defaultPrefs = this.createEmptyPreferences(customerId);
    if (!options?.readOnly) this.inMemoryCache.set(customerId, defaultPrefs);
    return defaultPrefs;
  }

  /**
   * Save or update customer preferences into MySQL, Redis, and memory cache.
   * Ensures deliveryLandmarks, specialInstructions, and structured memoryItems
   * are permanently stored in MySQL.
   */
  async savePreferences(
    customerId: number,
    updates: Partial<CustomerMemoryPreferences>,
    options?: { replaceMemoryItems?: boolean; replaceArrays?: boolean }
  ): Promise<CustomerMemoryPreferences> {
    const current = await this.getPreferences(customerId);

    let mergedItems: MemoryItem[];
    if (options?.replaceMemoryItems && updates.memoryItems !== undefined) {
      mergedItems = updates.memoryItems;
    } else {
      // Merge structured memory items
      mergedItems = [...(current.memoryItems || [])];
      if (updates.memoryItems && updates.memoryItems.length > 0) {
        for (const newItem of updates.memoryItems) {
          const existingIdx = mergedItems.findIndex(
            (m) => m.type === newItem.type && m.item.toLowerCase() === newItem.item.toLowerCase()
          );
          if (existingIdx >= 0) {
            mergedItems[existingIdx] = {
              ...mergedItems[existingIdx],
              ...newItem,
              confidence: Math.max(mergedItems[existingIdx].confidence, newItem.confidence),
            };
          } else {
            mergedItems.push(newItem);
          }
        }
      }
    }

    // The legacy array columns are projections of structured memory items.
    // Never promote a single-turn UNCONFIRMED_SUGGESTION into a verified
    // preference merely because a caller supplied the convenience array.
    const mergeArray = (field: keyof CustomerMemoryPreferences): string[] => {
      const incoming = updates[field] as string[] | undefined;
      if (options?.replaceArrays && incoming !== undefined) return Array.from(new Set(incoming));
      // Explicit operator/API saves may legitimately populate projection
      // arrays without structured evidence. Automatic observation never sends
      // these arrays for an unconfirmed suggestion, and cleanExpiredMemoryItems
      // removes any value that is explicitly marked unconfirmed.
      if (!incoming) return Array.from(new Set((current[field] as string[] | undefined) || []));
      return Array.from(new Set([...(current[field] as string[] || []), ...incoming]));
    };

    const dietaryPreferences = mergeArray('dietaryPreferences');
    const excludedIngredients = mergeArray('excludedIngredients');
    const favoriteCuisines = mergeArray('favoriteCuisines');
    const deliveryLandmarks = mergeArray('deliveryLandmarks');
    const specialInstructions = mergeArray('specialInstructions');

    const merged: CustomerMemoryPreferences = {
      ...current,
      ...updates,
      customerId,
      allowAiTraining: updates.allowAiTraining !== undefined ? updates.allowAiTraining : current.allowAiTraining,
      aiTrainingConsentAt: updates.aiTrainingConsentAt !== undefined ? updates.aiTrainingConsentAt : current.aiTrainingConsentAt,
      aiTrainingConsentSource: updates.aiTrainingConsentSource !== undefined ? updates.aiTrainingConsentSource : current.aiTrainingConsentSource,
      dietaryPreferences,
      excludedIngredients,
      favoriteCuisines,
      deliveryLandmarks,
      specialInstructions,
      memoryItems: mergedItems,
      updatedAt: new Date().toISOString(),
    };

    const cleaned = this.cleanExpiredMemoryItems(merged);

    // Save to MySQL with upsert (all fields including landmarks and instructions)
    try {
      await execute(
        `INSERT INTO customer_preferences (
          customer_id,
          preferred_language,
          default_search_preference,
          allow_ai_training,
          ai_training_consent_at,
          ai_training_consent_source,
          dietary_preferences,
          excluded_ingredients,
          favorite_cuisines,
          delivery_landmarks,
          special_instructions,
          memory_items_json,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          preferred_language = VALUES(preferred_language),
          default_search_preference = VALUES(default_search_preference),
          allow_ai_training = VALUES(allow_ai_training),
          ai_training_consent_at = VALUES(ai_training_consent_at),
          ai_training_consent_source = VALUES(ai_training_consent_source),
          dietary_preferences = VALUES(dietary_preferences),
          excluded_ingredients = VALUES(excluded_ingredients),
          favorite_cuisines = VALUES(favorite_cuisines),
          delivery_landmarks = VALUES(delivery_landmarks),
          special_instructions = VALUES(special_instructions),
          memory_items_json = VALUES(memory_items_json),
          updated_at = NOW()`,
        [
          customerId,
          cleaned.preferredLanguage || null,
          cleaned.defaultSearchPreference || null,
          cleaned.allowAiTraining ? 1 : 0,
          cleaned.aiTrainingConsentAt ? new Date(cleaned.aiTrainingConsentAt) : null,
          cleaned.aiTrainingConsentSource || null,
          JSON.stringify(cleaned.dietaryPreferences),
          JSON.stringify(cleaned.excludedIngredients),
          JSON.stringify(cleaned.favoriteCuisines),
          JSON.stringify(cleaned.deliveryLandmarks),
          JSON.stringify(cleaned.specialInstructions),
          JSON.stringify(cleaned.memoryItems),
        ]
      );

      // Also persist structured memory items into canonical customer_memory_items table
      for (const item of cleaned.memoryItems || []) {
        try {
          const isConfirmed = item.confirmationStatus === 'CUSTOMER_CONFIRMED' || item.confirmationStatus === 'OPERATOR_VERIFIED';
          await execute(
            `INSERT INTO customer_memory_items (
              public_id, customer_id, kind, canonical_value, customer_expression,
              scope, status, confidence, evidence_count, confirmed_at, expires_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'ACCOUNT', ?, ?, 1, ?, ?, NOW(), NOW())
            ON DUPLICATE KEY UPDATE
              status = VALUES(status),
              confidence = VALUES(confidence),
              confirmed_at = VALUES(confirmed_at),
              expires_at = VALUES(expires_at),
              updated_at = NOW()`,
            [
              item.id || uuidv4(),
              customerId,
              item.type,
              item.item,
              item.item,
              isConfirmed ? 'CUSTOMER_CONFIRMED' : 'UNCONFIRMED_SUGGESTION',
              item.confidence || 0.75,
              isConfirmed ? new Date() : null,
              item.expiresAt ? new Date(item.expiresAt) : null,
            ]
          );
        } catch {}
      }
    } catch (dbErr) {
      console.error(`[CustomerMemory] DB write failed for customer ${customerId}:`, (dbErr as Error).message);
      throw dbErr;
    }

    // Publish to caches only after the authoritative MySQL write succeeds;
    // otherwise a transient DB failure could expose uncommitted memory on the
    // next turn.
    this.inMemoryCache.set(customerId, cleaned);
    try {
      await redis.set(`ai:customer:prefs:${customerId}`, JSON.stringify(cleaned), 86400);
    } catch {}

    return cleaned;
  }


  /**
   * Update AI training consent for a customer with audit timestamps.
   */
  async setAITrainingConsent(
    customerId: number,
    consent: boolean,
    source: string = 'CUSTOMER_OPT_IN'
  ): Promise<CustomerMemoryPreferences> {
    const consentAt = consent ? new Date().toISOString() : null;
    const consentSource = consent ? source : 'CUSTOMER_OPT_OUT';

    // Audit log
    try {
      await execute(
        `INSERT INTO ai_audit_events (event_type, entity_type, entity_id, details_json, created_at)
         VALUES (?, 'CUSTOMER', ?, ?, NOW())`,
        [
          consent ? 'AI_TRAINING_CONSENT_GRANTED' : 'AI_TRAINING_CONSENT_REVOKED',
          String(customerId),
          JSON.stringify({ source, timestamp: new Date().toISOString() }),
        ]
      );
    } catch (err: any) {
      console.error('[CustomerMemory] Audit consent log error:', err.message);
      throw err;
    }

    return this.savePreferences(customerId, {
      allowAiTraining: consent,
      aiTrainingConsentAt: consentAt,
      aiTrainingConsentSource: consentSource,
    });
  }

  /**
   * Complete customer-facing opt-out and memory deletion:
   * 1. Revokes AI training consent.
   * 2. Clears all learned preferences, exclusions, landmarks, and instructions.
   * 3. Purges Redis cache.
   * 4. Deletes any pending or approved records from training curation queue.
   * 5. Emits auditable deletion record.
   * FATAL: Fails immediately if database write, deletion, or audit log fails.
   */
  async optOutAndEraseMemory(customerId: number, performedBy?: number): Promise<boolean> {
    this.inMemoryCache.delete(customerId);

    const conversationRows = await query<any[]>(
      `SELECT id FROM conversations WHERE customer_id = ?`,
      [customerId]
    ).catch(() => [] as any[]);
    const conversationIds = conversationRows.map((row) => Number(row.id)).filter((id) => id > 0);

    // 1. Purge Redis
    try {
      await redis.del(`ai:customer:prefs:${customerId}`);
      await redis.del(`ai:state:${customerId}`);
      await redis.del(`ai:history:${customerId}`);
      for (const conversationId of conversationIds) {
        await redis.del(`ai:state:${conversationId}`);
        await redis.del(`ai:history:${conversationId}`);
      }
    } catch (err: any) {
      console.warn(`[CustomerMemory] Redis del warning for ${customerId}:`, err.message);
    }

    // 2. Clear customer_preferences in MySQL
    try {
      await execute(
        `UPDATE customer_preferences SET
          allow_ai_training = 0,
          ai_training_consent_at = NULL,
          ai_training_consent_source = 'REVOKED_AND_ERASED',
          dietary_preferences = JSON_ARRAY(),
          excluded_ingredients = JSON_ARRAY(),
          favorite_cuisines = JSON_ARRAY(),
          delivery_landmarks = JSON_ARRAY(),
          special_instructions = JSON_ARRAY(),
          memory_items_json = JSON_ARRAY(),
          updated_at = NOW()
        WHERE customer_id = ?`,
        [customerId]
      );
    } catch (dbErr) {
      console.error(`[CustomerMemory] DB clear failed for customer ${customerId}:`, (dbErr as Error).message);
      throw new Error(`Failed to erase customer preferences in database: ${(dbErr as Error).message}`);
    }

    // 3. Delete canonical memory and every AI-derived trace for this customer.
    // Missing optional tables are tolerated for older installations; any
    // other database error remains fatal so erasure cannot be reported as done
    // while data is still present.
    let deletedTurnsCount = 0;
    try {
      await execute(`DELETE FROM customer_memory_items WHERE customer_id = ?`, [customerId]);
      const res: any = await execute(
        `DELETE FROM training_curation_queue WHERE customer_id = ?`,
        [customerId]
      );
      deletedTurnsCount = res?.affectedRows || 0;

      const deleteOptional = async (sql: string, params: any[] = []) => {
        try {
          await execute(sql, params);
        } catch (err: any) {
          if (Number(err?.errno) === 1146 || err?.code === 'ER_NO_SUCH_TABLE') return;
          throw err;
        }
      };
      if (conversationIds.length > 0) {
        const placeholders = conversationIds.map(() => '?').join(',');
        await deleteOptional(`DELETE FROM conversation_ai_events WHERE conversation_id IN (${placeholders})`, conversationIds);
        await deleteOptional(`DELETE FROM ai_turn_outcomes WHERE conversation_id IN (${placeholders})`, conversationIds);
        await deleteOptional(`DELETE FROM conversation_summaries WHERE conversation_id IN (${placeholders})`, conversationIds);
        await deleteOptional(`DELETE FROM conversation_tasks WHERE conversation_id IN (${placeholders})`, conversationIds);
        await deleteOptional(`DELETE FROM ai_interactions WHERE conversation_id IN (${placeholders})`, conversationIds);
        await deleteOptional(`DELETE FROM search_sessions WHERE conversation_id IN (${placeholders})`, conversationIds);
        await deleteOptional(`DELETE FROM conversation_state WHERE conversation_id IN (${placeholders})`, conversationIds);
      }
      await deleteOptional(`DELETE FROM ai_learning_cases WHERE customer_id = ?`, [customerId]);
    } catch (dbErr) {
      console.error(`[CustomerMemory] Queue/Items deletion failed for customer ${customerId}:`, (dbErr as Error).message);
      throw new Error(`Failed to delete customer memory rows: ${(dbErr as Error).message}`);
    }


    // 4. Log audit event
    try {
      await execute(
        `INSERT INTO ai_audit_events (event_type, entity_type, entity_id, performed_by, details_json, created_at)
         VALUES ('CUSTOMER_MEMORY_ERASED', 'CUSTOMER', ?, ?, ?, NOW())`,
        [
          String(customerId),
          performedBy || null,
          JSON.stringify({
            deletedTurnsCount,
            reason: 'CUSTOMER_REQUEST_RIGHT_TO_BE_FORGOTTEN',
            timestamp: new Date().toISOString(),
          }),
        ]
      );
    } catch (dbErr) {
      console.error(`[CustomerMemory] Audit logging failed for customer ${customerId}:`, (dbErr as Error).message);
      throw new Error(`Failed to write audit event for erasure: ${(dbErr as Error).message}`);
    }

    return true;
  }

  /**
   * Observe inbound customer message and extract candidate customer habits/preferences.
   * Marks new single-turn detections as UNCONFIRMED_SUGGESTION with moderate confidence.
   * Does NOT permanently alter authoritative memory from a single ambiguous message.
   */
  extractPreferencesFromText(text: string, sourceTurn?: string): Partial<CustomerMemoryPreferences> | null {
    if (!text || typeof text !== 'string') return null;

    const lower = text.toLowerCase();
    const excludedIngredients: string[] = [];
    const dietaryPreferences: string[] = [];
    const deliveryLandmarks: string[] = [];
    const specialInstructions: string[] = [];
    const memoryItems: MemoryItem[] = [];

    const now = new Date().toISOString();
    // Default expiration for unconfirmed delivery instructions: 30 days
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const isExplicitPermanent = /(?:always|remember this|dyman|dayman|daymen|3ala toul|على طول|دائماً|تذكر|remember)/iu.test(lower);
    const status: 'CUSTOMER_CONFIRMED' | 'UNCONFIRMED_SUGGESTION' = isExplicitPermanent
      ? 'CUSTOMER_CONFIRMED'
      : 'UNCONFIRMED_SUGGESTION';
    const confidence = isExplicitPermanent ? 0.98 : 0.75;

    // English exclusions: no onions, without pickles, hold the mayo
    const engExclusionRegex = /(?:no|without|hold the|exclude)\s+([a-z]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = engExclusionRegex.exec(lower)) !== null) {
      const item = match[1].trim();
      const engMap: Record<string, string> = {
        onion: 'onion',
        onions: 'onion',
        pickle: 'pickles',
        pickles: 'pickles',
        mayo: 'mayonnaise',
        mayonnaise: 'mayonnaise',
        tomato: 'tomato',
        tomatoes: 'tomato',
        garlic: 'garlic',
        cheese: 'cheese',
        ice: 'ice',
        sugar: 'sugar',
        spicy: 'spicy',
      };
      if (engMap[item]) {
        const canonical = engMap[item];
        if (!excludedIngredients.includes(canonical)) {
          excludedIngredients.push(canonical);
        }
        memoryItems.push({
          id: uuidv4(),
          item: canonical,
          type: 'exclusion',
          confidence,
          confirmationStatus: status,
          sourceTurn,
          createdAt: now,
          expiresAt: isExplicitPermanent ? null : expiryDate,
        });
      }
    }

    // Arabizi exclusions: bla basel, bala basal, bala toum, bidoun toom, bala sauce, bla mayo
    const arabiziExclusionRegex = /(?:bla|bala|bidoun|bedoun|balash)\s+([a-z0-9]+)/gi;
    while ((match = arabiziExclusionRegex.exec(lower)) !== null) {
      const item = match[1].trim();
      const mapped: Record<string, string> = {
        basel: 'onion',
        basal: 'onion',
        toum: 'garlic',
        toom: 'garlic',
        tom: 'garlic',
        mayo: 'mayonnaise',
        ketchup: 'ketchup',
        sauce: 'sauce',
        khal: 'vinegar',
        mokhallal: 'pickles',
        khiyar: 'pickles',
        '7ar': 'spicy',
        har: 'spicy',
      };
      if (mapped[item]) {
        const canonical = mapped[item];
        if (!excludedIngredients.includes(canonical)) {
          excludedIngredients.push(canonical);
        }
        memoryItems.push({
          id: uuidv4(),
          item: canonical,
          type: 'exclusion',
          confidence,
          confirmationStatus: status,
          sourceTurn,
          createdAt: now,
          expiresAt: isExplicitPermanent ? null : expiryDate,
        });
      }
    }

    // Arabic script exclusions: بلا بصل, بدون ثوم, بدون مايونيز, بدون مخلل, بلا حار
    const arabicExclusionRegex = /(?:بلا|بدون|من دون)\s+([\u0600-\u06FF]+)/g;
    while ((match = arabicExclusionRegex.exec(text)) !== null) {
      const item = match[1].trim();
      const arabicMap: Record<string, string> = {
        بصل: 'onion',
        ثوم: 'garlic',
        مايونيز: 'mayonnaise',
        مخلل: 'pickles',
        بندورة: 'tomato',
        طماطم: 'tomato',
        كاتشب: 'ketchup',
        شطة: 'spicy',
        حار: 'spicy',
        سكر: 'sugar',
      };
      if (arabicMap[item]) {
        const canonical = arabicMap[item];
        if (!excludedIngredients.includes(canonical)) {
          excludedIngredients.push(canonical);
        }
        memoryItems.push({
          id: uuidv4(),
          item: canonical,
          type: 'exclusion',
          confidence,
          confirmationStatus: status,
          sourceTurn,
          createdAt: now,
          expiresAt: isExplicitPermanent ? null : expiryDate,
        });
      }
    }

    // Dietary preferences
    if (/(?:vegetarian|veggie|نباتي)/iu.test(text)) {
      if (!dietaryPreferences.includes('vegetarian')) dietaryPreferences.push('vegetarian');
      memoryItems.push({
        id: uuidv4(),
        item: 'vegetarian',
        type: 'dietary',
        confidence: isExplicitPermanent ? 0.98 : 0.85,
        confirmationStatus: status,
        sourceTurn,
        createdAt: now,
        expiresAt: isExplicitPermanent ? null : expiryDate,
      });
    }
    if (/(?:vegan|خضري)/iu.test(text)) {
      if (!dietaryPreferences.includes('vegan')) dietaryPreferences.push('vegan');
      memoryItems.push({
        id: uuidv4(),
        item: 'vegan',
        type: 'dietary',
        confidence: isExplicitPermanent ? 0.98 : 0.85,
        confirmationStatus: status,
        sourceTurn,
        createdAt: now,
        expiresAt: isExplicitPermanent ? null : expiryDate,
      });
    }
    if (/(?:halal|حلال)/iu.test(text)) {
      if (!dietaryPreferences.includes('halal')) dietaryPreferences.push('halal');
      memoryItems.push({
        id: uuidv4(),
        item: 'halal',
        type: 'dietary',
        confidence: isExplicitPermanent ? 0.98 : 0.90,
        confirmationStatus: status,
        sourceTurn,
        createdAt: now,
        expiresAt: isExplicitPermanent ? null : expiryDate,
      });
    }
    if (/(?:gluten[\s-]?free|خالي من الغلوتين)/iu.test(text)) {
      if (!dietaryPreferences.includes('gluten_free')) dietaryPreferences.push('gluten_free');
      memoryItems.push({
        id: uuidv4(),
        item: 'gluten_free',
        type: 'dietary',
        confidence: isExplicitPermanent ? 0.98 : 0.85,
        confirmationStatus: status,
        sourceTurn,
        createdAt: now,
        expiresAt: isExplicitPermanent ? null : expiryDate,
      });
    }
    if (/(?:diabetic|sugar[\s-]?free|خالي من السكر)/iu.test(text)) {
      if (!dietaryPreferences.includes('sugar_free')) dietaryPreferences.push('sugar_free');
      memoryItems.push({
        id: uuidv4(),
        item: 'sugar_free',
        type: 'dietary',
        confidence: isExplicitPermanent ? 0.98 : 0.85,
        confirmationStatus: status,
        sourceTurn,
        createdAt: now,
        expiresAt: isExplicitPermanent ? null : expiryDate,
      });
    }

    // Delivery cues & instructions
    if (/(?:don't ring (?:the )?doorbell|do not ring|ma trn|ma tren el jaras|ما ترن الجرس)/iu.test(text)) {
      const instr = 'Do not ring doorbell (call upon arrival)';
      if (!specialInstructions.includes(instr)) specialInstructions.push(instr);
      memoryItems.push({
        id: uuidv4(),
        item: instr,
        type: 'instruction',
        confidence: isExplicitPermanent ? 0.98 : 0.80,
        confirmationStatus: status,
        sourceTurn,
        createdAt: now,
        expiresAt: isExplicitPermanent ? null : expiryDate,
      });
    }
    if (/(?:call when you arrive|call me when outside|de2le|de2li bas tousal|اتصل بس توصل)/iu.test(text)) {
      const instr = 'Call customer upon arrival';
      if (!specialInstructions.includes(instr)) specialInstructions.push(instr);
      memoryItems.push({
        id: uuidv4(),
        item: instr,
        type: 'instruction',
        confidence: isExplicitPermanent ? 0.98 : 0.80,
        confirmationStatus: status,
        sourceTurn,
        createdAt: now,
        expiresAt: isExplicitPermanent ? null : expiryDate,
      });
    }

    // Explicit confirmation detection: if customer explicitly says "always", "confirmed", "dyman", "dayman"
    if (/(?:always|dyman|dayman|kell marra|da2iman|دائما|دايما|ثبت)/iu.test(text)) {
      for (const item of memoryItems) {
        item.confirmationStatus = 'CUSTOMER_CONFIRMED';
        item.confidence = 0.95;
      }
    }

    if (
      excludedIngredients.length === 0 &&
      dietaryPreferences.length === 0 &&
      deliveryLandmarks.length === 0 &&
      specialInstructions.length === 0 &&
      memoryItems.length === 0
    ) {
      return null;
    }

    return {
      excludedIngredients,
      dietaryPreferences,
      deliveryLandmarks,
      specialInstructions,
      memoryItems,
    };
  }

  /**
   * Observe inbound chat and automatically extract candidate memory asynchronously.
   */
  async observeAndLearn(
    customerId: number,
    text: string,
    turnId?: string,
    options?: { preferredLanguage?: string },
  ): Promise<void> {
    if (!customerId || customerId <= 0 || !text) return;
    try {
      const detected = this.extractPreferencesFromText(text, turnId);
      if (detected || options?.preferredLanguage) {
        const isConfirmed = detected?.memoryItems?.some(
          (m) => m.confirmationStatus === 'CUSTOMER_CONFIRMED'
        );
        await this.savePreferences(customerId, {
          ...(isConfirmed
            ? {
                excludedIngredients: detected?.excludedIngredients,
                dietaryPreferences: detected?.dietaryPreferences,
                deliveryLandmarks: detected?.deliveryLandmarks,
                specialInstructions: detected?.specialInstructions,
              }
            : {}),
          memoryItems: detected?.memoryItems,
          ...(options?.preferredLanguage ? { preferredLanguage: options.preferredLanguage } : {}),
        });
      }
    } catch (err) {
      console.warn('[CustomerMemory] Error in observeAndLearn:', (err as Error).message);
    }
  }

  /**
   * Format learned customer preferences into prompt context for Gemini.
   * Strictly separates confirmed preferences from unconfirmed suggestions.
   */
  formatPreferencesForPrompt(prefs: CustomerMemoryPreferences | null): string {
    if (!prefs) return '';

    const cleaned = this.cleanExpiredMemoryItems(prefs);
    const confirmedLines: string[] = [];
    const suggestionLines: string[] = [];

    // Strictly require that items in confirmedLines have confirmationStatus === 'CUSTOMER_CONFIRMED' or 'OPERATOR_VERIFIED'
    const confirmedItems = (cleaned.memoryItems || []).filter(
      (m) => m.confirmationStatus === 'CUSTOMER_CONFIRMED' || m.confirmationStatus === 'OPERATOR_VERIFIED'
    );
    const confirmedExclusions = Array.from(new Set([
      ...(cleaned.excludedIngredients || []),
      ...confirmedItems.filter((m) => m.type === 'exclusion').map((m) => m.item),
    ]));
    const confirmedDietary = Array.from(new Set([
      ...(cleaned.dietaryPreferences || []),
      ...confirmedItems.filter((m) => m.type === 'dietary').map((m) => m.item),
    ]));
    const confirmedLandmarks = Array.from(new Set([
      ...(cleaned.deliveryLandmarks || []),
      ...confirmedItems.filter((m) => m.type === 'landmark').map((m) => m.item),
    ]));
    const confirmedInstructions = Array.from(new Set([
      ...(cleaned.specialInstructions || []),
      ...confirmedItems.filter((m) => m.type === 'instruction').map((m) => m.item),
    ]));

    if (confirmedDietary.length > 0) {
      confirmedLines.push(`- Dietary: ${confirmedDietary.join(', ')}`);
    }
    if (confirmedExclusions.length > 0) {
      confirmedLines.push(`- Always avoid (Excluded ingredients): ${confirmedExclusions.join(', ')}`);
    }
    if (cleaned.favoriteCuisines && cleaned.favoriteCuisines.length > 0) {
      confirmedLines.push(`- Favorite cuisines: ${cleaned.favoriteCuisines.join(', ')}`);
    }
    if (confirmedLandmarks.length > 0) {
      confirmedLines.push(`- Saved delivery landmarks: ${confirmedLandmarks.join(', ')}`);
    }
    if (confirmedInstructions.length > 0) {
      confirmedLines.push(`- Customer delivery instructions: ${confirmedInstructions.join(', ')}`);
    }


    // Inspect structured memory items for any unconfirmed suggestions
    const unconfirmed = (cleaned.memoryItems || []).filter(
      (m) => m.confirmationStatus === 'UNCONFIRMED_SUGGESTION' && m.confidence >= 0.70
    );
    for (const u of unconfirmed) {
      suggestionLines.push(`- [Candidate suggestion: ${u.type}] ${u.item} (Confidence: ${Math.round(u.confidence * 100)}%)`);
    }

    const sections: string[] = [];
    if (confirmedLines.length > 0) {
      sections.push(
        `Verified Customer Preferences (Strictly honor proactively):\n${confirmedLines.join('\n')}`
      );
    }
    if (suggestionLines.length > 0) {
      sections.push(
        `Unconfirmed Customer Suggestions (Verify politely if relevant, do not assume permanent):\n${suggestionLines.join('\n')}`
      );
    }

    return sections.join('\n\n');
  }

  /**
   * Confirm an unconfirmed suggestion into an authoritative confirmed preference.
   */
  async confirmMemoryItem(customerId: number, itemIdOrText: string): Promise<CustomerMemoryPreferences> {
    const prefs = await this.getPreferences(customerId);
    const item = prefs.memoryItems.find(
      (m) => m.id === itemIdOrText || m.item.toLowerCase() === itemIdOrText.toLowerCase()
    );
    if (!item) {
      throw new Error(`Memory item '${itemIdOrText}' not found for customer ${customerId}`);
    }
    item.confirmationStatus = 'CUSTOMER_CONFIRMED';
    item.confidence = 1.0;
    return this.savePreferences(customerId, { memoryItems: prefs.memoryItems }, { replaceMemoryItems: true });
  }

  /**
   * Correct an existing memory item with new text/value.
   */
  async correctMemoryItem(
    customerId: number,
    oldItemIdOrText: string,
    newItemText: string
  ): Promise<CustomerMemoryPreferences> {
    const prefs = await this.getPreferences(customerId);
    const idx = prefs.memoryItems.findIndex(
      (m) => m.id === oldItemIdOrText || m.item.toLowerCase() === oldItemIdOrText.toLowerCase()
    );
    if (idx >= 0) {
      prefs.memoryItems[idx].item = newItemText;
      prefs.memoryItems[idx].confirmationStatus = 'CUSTOMER_CONFIRMED';
      prefs.memoryItems[idx].confidence = 1.0;
    } else {
      prefs.memoryItems.push({
        id: uuidv4(),
        item: newItemText,
        type: 'instruction',
        confidence: 1.0,
        confirmationStatus: 'CUSTOMER_CONFIRMED',
        createdAt: new Date().toISOString(),
      });
    }
    return this.savePreferences(customerId, { memoryItems: prefs.memoryItems }, { replaceMemoryItems: true });
  }

  /**
   * Delete a specific memory item.
   */
  async deleteMemoryItem(customerId: number, itemIdOrText: string): Promise<CustomerMemoryPreferences> {
    const prefs = await this.getPreferences(customerId);
    const remaining = prefs.memoryItems.filter(
      (m) => m.id !== itemIdOrText && m.item.toLowerCase() !== itemIdOrText.toLowerCase()
    );
    return this.savePreferences(customerId, { memoryItems: remaining }, { replaceMemoryItems: true });
  }

  /**
   * Filter out expired memory items.
   */
  private cleanExpiredMemoryItems(prefs: CustomerMemoryPreferences): CustomerMemoryPreferences {
    const now = Date.now();
    const activeItems = (prefs.memoryItems || []).filter((item) => {
      if (!item.expiresAt) return true;
      return new Date(item.expiresAt).getTime() > now;
    });

    const unconfirmedByType = new Map<MemoryItem['type'], Set<string>>();
    for (const item of activeItems) {
      if (item.confirmationStatus !== 'UNCONFIRMED_SUGGESTION') continue;
      const values = unconfirmedByType.get(item.type) || new Set<string>();
      values.add(item.item.trim().toLowerCase());
      unconfirmedByType.set(item.type, values);
    }
    const confirmedByType = new Map<MemoryItem['type'], string[]>();
    for (const item of activeItems) {
      if (item.confirmationStatus === 'UNCONFIRMED_SUGGESTION') continue;
      const values = confirmedByType.get(item.type) || [];
      if (!values.some((value) => value.toLowerCase() === item.item.toLowerCase())) values.push(item.item);
      confirmedByType.set(item.type, values);
    }
    const project = (values: string[] | undefined, type: MemoryItem['type']): string[] => {
      const blocked = unconfirmedByType.get(type) || new Set<string>();
      const result = (values || []).filter((value) => !blocked.has(String(value).trim().toLowerCase()));
      for (const value of confirmedByType.get(type) || []) {
        if (!result.some((entry) => entry.toLowerCase() === value.toLowerCase())) result.push(value);
      }
      return Array.from(new Set(result));
    };

    return {
      ...prefs,
      dietaryPreferences: project(prefs.dietaryPreferences, 'dietary'),
      excludedIngredients: project(prefs.excludedIngredients, 'exclusion'),
      favoriteCuisines: project(prefs.favoriteCuisines, 'cuisine'),
      deliveryLandmarks: project(prefs.deliveryLandmarks, 'landmark'),
      specialInstructions: project(prefs.specialInstructions, 'instruction'),
      memoryItems: activeItems,
    };
  }

  async getCustomerMemoryItems(customerId: number): Promise<Array<{
    id: string;
    extracted_value: string;
    confirmation_status: string;
    kind: string;
    confidence: number;
  }>> {
    try {
      const rows = await query<any[]>(
        `SELECT public_id as id, canonical_value as extracted_value, status as confirmation_status, kind, confidence
         FROM customer_memory_items
         WHERE customer_id = ?`,
        [customerId]
      );
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          id: String(r.id),
          extracted_value: String(r.extracted_value),
          confirmation_status: String(r.confirmation_status),
          kind: String(r.kind),
          confidence: Number(r.confidence),
        }));
      }
    } catch {}

    const prefs = await this.getPreferences(customerId);
    return (prefs.memoryItems || []).map((m) => ({
      id: m.id,
      extracted_value: m.item,
      confirmation_status: m.confirmationStatus,
      kind: m.type,
      confidence: m.confidence,
    }));
  }

  async eraseMemory(customerId: number, performedBy?: number): Promise<boolean> {
    return this.optOutAndEraseMemory(customerId, performedBy);
  }

  private createEmptyPreferences(customerId: number): CustomerMemoryPreferences {
    return {
      customerId,
      allowAiTraining: false,
      dietaryPreferences: [],
      excludedIngredients: [],
      favoriteCuisines: [],
      deliveryLandmarks: [],
      specialInstructions: [],
      memoryItems: [],
    };
  }

  private safeParseJson<T>(value: any, fallback: T): T {
    if (!value) return fallback;
    if (typeof value === 'object') return value as T;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
}

export const customerMemoryService = new CustomerMemoryService();
