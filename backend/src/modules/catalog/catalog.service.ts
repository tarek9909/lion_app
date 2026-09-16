import { query, execute } from '../../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/env.js';
import { MultilingualNormalizer } from './arabic-normalizer.js';

function isTestEnvironment(): boolean {
  return config.nodeEnv === 'test' || process.env.NODE_ENV === 'test';
}

export interface SearchResult {
  merchantProductId: number;
  productId: number;
  merchantId: number;
  merchantBranchId: number;
  merchantName: string;
  merchantType: string;
  merchantRating: number;
  productName: string;
  description: string;
  basePrice: number;
  deliveryFee: number;
  estimatedMinutes: number;
  isAvailable: boolean;
  score: number;
}

export interface BasketItemRequest {
  query: string;
  quantity: number;
}

export interface BasketComparisonResult {
  merchantId: number;
  merchantBranchId: number;
  merchantName: string;
  itemsTotal: number;
  deliveryFee: number;
  finalTotal: number;
  completeItemsCount: number;
  totalRequestedCount: number;
  isComplete: boolean;
  matchedItems: {
    requested: string;
    productName: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
  missingItems: string[];
}

export interface CatalogSearchOptions {
  maxBudget?: number | null;
  preference?: 'cheapest' | 'best_rated' | 'fastest' | 'best_value' | null;
  shadowMode?: boolean;
  /** Restrict a modification follow-up to the merchant already in the cart. */
  merchantBranchId?: number | null;
}

export type ProductResolutionStage =
  | 'EXACT_MATCH'
  | 'ALIAS_MATCH'
  | 'SPELLING_CANDIDATE'
  | 'VERIFIED_ALTERNATIVE'
  | 'NO_MATCH';

export interface ProductResolutionResult {
  stage: ProductResolutionStage;
  requestedName: string;
  matched?: SearchResult;
  spellingCandidates: string[];
  verifiedAlternatives: SearchResult[];
  searchedMerchantBranchId: number | null;
}

export class CatalogService {
  /**
   * Search across active, open demo merchants within delivery zone (G-023, G-024, G-025)
   */
  async searchProducts(
    rawQuery: string,
    maxBudgetOrOptions?: number | CatalogSearchOptions | null,
    preferenceParam?: 'cheapest' | 'best_rated' | 'fastest' | 'best_value' | null
  ): Promise<SearchResult[]> {
    let maxBudget: number | null = null;
    let preference: 'cheapest' | 'best_rated' | 'fastest' | 'best_value' | null = null;
    let shadowMode = false;
    let merchantBranchId: number | null = null;

    if (typeof maxBudgetOrOptions === 'object' && maxBudgetOrOptions !== null) {
      maxBudget = maxBudgetOrOptions.maxBudget ?? null;
      preference = maxBudgetOrOptions.preference ?? null;
      shadowMode = maxBudgetOrOptions.shadowMode ?? false;
      merchantBranchId = maxBudgetOrOptions.merchantBranchId ?? null;
    } else if (typeof maxBudgetOrOptions === 'number') {
      maxBudget = maxBudgetOrOptions;
      preference = preferenceParam ?? null;
    } else {
      preference = preferenceParam ?? null;
    }

    const { normalizedArabic, normalizedArabizi, tokens } = MultilingualNormalizer.normalizeQuery(rawQuery);
    const normalized = rawQuery.toLowerCase().trim();
    const operatingHoursFilter = isTestEnvironment()
      ? '1 = 1'
      : `(moh.id IS NULL OR (
          moh.is_closed = 0 AND (
            moh.open_time IS NULL OR moh.close_time IS NULL OR
            (moh.open_time <= moh.close_time AND CURRENT_TIME() BETWEEN moh.open_time AND moh.close_time) OR
            (moh.open_time > moh.close_time AND (CURRENT_TIME() >= moh.open_time OR CURRENT_TIME() <= moh.close_time))
          )
        ))`;

    // Fetch active merchant products that are available, from active merchants whose branches are open (G-023)
    const branchFilter = merchantBranchId ? ' AND mb.id = ?' : '';
    const rows = await query<any[]>(`
      SELECT 
        mp.id as merchantProductId,
        p.id as productId,
        m.id as merchantId,
        mb.id as merchantBranchId,
        m.name as merchantName,
        m.merchant_type as merchantType,
        m.rating as merchantRating,
        p.canonical_name as productName,
        p.name_ar as productNameAr,
        COALESCE(mp.description, p.description, '') as description,
        mp.base_price as basePrice,
        MAX(COALESCE(mbz.delivery_fee_override, dz.base_delivery_fee, 1.50)) as deliveryFee,
        MAX(COALESCE(mb.preparation_minutes, m.default_preparation_minutes, 20)) as preparationMinutes,
        mp.is_available as isAvailable,
        GROUP_CONCAT(DISTINCT pa.alias SEPARATOR '||') as aliases
      FROM merchant_products mp
      JOIN products p ON p.id = mp.product_id
      JOIN merchant_branches mb ON mb.id = mp.merchant_branch_id
      JOIN merchants m ON m.id = mb.merchant_id
      LEFT JOIN product_aliases pa ON pa.product_id = p.id
      LEFT JOIN merchant_branch_delivery_zones mbz ON mbz.merchant_branch_id = mb.id
      LEFT JOIN delivery_zones dz ON dz.id = mbz.delivery_zone_id
      LEFT JOIN merchant_operating_hours moh ON moh.merchant_branch_id = mb.id AND moh.day_of_week = (DAYOFWEEK(NOW()) - 1)
      WHERE mp.status = 'ACTIVE' 
        AND mp.is_available = 1
        AND m.status = 'ACTIVE'
        AND m.accepts_orders = 1 
        AND mb.status = 'ACTIVE'
        AND mb.accepts_orders = 1
        ${branchFilter}
        AND ${operatingHoursFilter}
      GROUP BY mp.id, p.id, m.id, mb.id, p.canonical_name, p.name_ar, mp.description, p.description, mp.base_price, mp.is_available
    `, merchantBranchId ? [merchantBranchId] : []);

    const results: SearchResult[] = [];

    for (const r of rows) {
      const aliasList = (r.aliases || '').split('||').map((a: string) => a.toLowerCase().trim());
      const productNameEn = (r.productName || '').toLowerCase();
      const productNameAr = (r.productNameAr || '').toLowerCase();
      const desc = (r.description || '').toLowerCase();

      let matchScore = 0;

      // Exact or alias match
      if (aliasList.includes(normalized) || (normalizedArabizi && aliasList.includes(normalizedArabizi))) {
        matchScore += 100;
      } else if (
        productNameEn.includes(normalized) ||
        productNameAr.includes(normalized) ||
        (normalizedArabic && productNameAr.includes(normalizedArabic)) ||
        (normalizedArabizi && productNameEn.includes(normalizedArabizi))
      ) {
        matchScore += 80;
      } else {
        // Multi-token overlap matching (Arabic, Arabizi, English tokens)
        for (const token of tokens) {
          if (aliasList.some((a: string) => a.includes(token))) matchScore += 30;
          if (productNameEn.includes(token) || productNameAr.includes(token)) matchScore += 25;
          if (desc.includes(token)) matchScore += 10;
        }
      }

      // Keyword synonym mapping for Lebanese Arabizi / Arabic:
      // "7elo" / "sweet" / "chocolate" / "كرسبي" / "burger"
      if (
        (normalized.includes('7elo') || normalized.includes('sweet') || normalized.includes('dessert') || normalized.includes('حلو') || normalized.includes('chocolate') || normalized.includes('knafeh') || normalizedArabizi.includes('7elo') || normalizedArabizi.includes('dessert')) &&
        (r.merchantType === 'CAFE' || productNameEn.includes('knafeh') || productNameEn.includes('cheesecake') || productNameEn.includes('crepe') || productNameEn.includes('dessert') || productNameEn.includes('cake'))
      ) {
        matchScore += 60;
      }
      if ((normalized.includes('crispy') || normalizedArabic.includes('كريسبي')) && productNameEn.includes('crispy')) {
        matchScore += 60;
      }
      if ((normalized.includes('chicken') || normalizedArabic.includes('دجاج')) && (productNameEn.includes('chicken') || productNameAr.includes('دجاج'))) {
        matchScore += 50;
      }
      if (normalized.includes('burger') && productNameEn.includes('burger')) {
        matchScore += 60;
      }
      if (normalized.includes('coke') || normalized.includes('cola') || normalized.includes('كولا') || normalizedArabic.includes('كولا')) {
        if (productNameEn.includes('coke') || productNameEn.includes('cola')) {
          matchScore += 70;
        }
      }

      if (matchScore >= 35) {
        const basePrice = parseFloat(r.basePrice);
        const deliveryFee = parseFloat(r.deliveryFee);
        const deliveredTotal = basePrice + deliveryFee;

        // Budget filter against COMPLETE delivered total (item + delivery) (G-025)
        if (maxBudget && deliveredTotal > maxBudget) {
          continue; // exceeds total delivered budget
        }

        results.push({
          merchantProductId: r.merchantProductId,
          productId: r.productId,
          merchantId: r.merchantId,
          merchantBranchId: r.merchantBranchId,
          merchantName: r.merchantName,
          merchantType: r.merchantType,
          merchantRating: parseFloat(r.merchantRating) || 4.5,
          productName: r.productName,
          description: r.description,
          basePrice,
          deliveryFee,
          estimatedMinutes: parseInt(r.preparationMinutes, 10) + 15,
          isAvailable: Boolean(r.isAvailable),
          score: matchScore,
        });
      }
    }

    // Shadow execution must remain mutation-free, including telemetry writes.
    if (!shadowMode) {
      try {
        await execute(
          `INSERT INTO search_sessions (public_id, raw_query, normalized_query, requested_budget, preference, result_count)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), rawQuery, normalized, maxBudget || null, preference || null, results.length]
        );
      } catch {
        // Telemetry non-fatal
      }
    }

    if (results.length === 0) return [];

    // A product can appear more than once when joins expose multiple delivery
    // zone rows. Keep the strongest catalog hit so duplicates cannot inflate
    // result counts, ranking, or evaluator relevance metrics.
    const strongestByMerchantProduct = new Map<number, SearchResult>();
    for (const result of results) {
      const existing = strongestByMerchantProduct.get(result.merchantProductId);
      if (!existing || result.score > existing.score) {
        strongestByMerchantProduct.set(result.merchantProductId, result);
      }
    }
    const deduplicatedResults = [...strongestByMerchantProduct.values()];

    // If search specifically asks for "crispy", exclude non-crispy items
    let candidateList = deduplicatedResults;
    if (normalized.includes('crispy') || normalized.includes('كرسبي')) {
      const crispyOnly = results.filter(r =>
        r.productName.toLowerCase().includes('crispy') ||
        r.description.toLowerCase().includes('crispy')
      );
      if (crispyOnly.length > 0) {
        candidateList = crispyOnly;
      }
    }

    // Filter out low-relevance noise
    const maxScore = Math.max(...candidateList.map(r => r.score));
    const relevantResults = candidateList.filter(r => r.score >= maxScore * 0.5);

    // Apply ranking preference (G-025)
    if (preference === 'cheapest') {
      relevantResults.sort((a, b) => (a.basePrice + a.deliveryFee) - (b.basePrice + b.deliveryFee));
    } else if (preference === 'best_rated') {
      relevantResults.sort((a, b) => b.merchantRating - a.merchantRating || (a.basePrice - b.basePrice));
    } else if (preference === 'fastest') {
      relevantResults.sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);
    } else if (preference === 'best_value') {
      // Composite best-value formula: high rating, low total price, quick delivery
      relevantResults.sort((a, b) => {
        const scoreA = (a.merchantRating * 15) - ((a.basePrice + a.deliveryFee) * 1.5) - (a.estimatedMinutes * 0.4);
        const scoreB = (b.merchantRating * 15) - ((b.basePrice + b.deliveryFee) * 1.5) - (b.estimatedMinutes * 0.4);
        return scoreB - scoreA;
      });
    } else {
      // Default balanced relevance
      relevantResults.sort((a, b) => (b.score * 1.5 + b.merchantRating * 10) - (a.score * 1.5 + a.merchantRating * 10));
    }

    return relevantResults.slice(0, 5);
  }

  /**
   * Resolve a short follow-up product name without silently substituting an
   * unavailable product. The caller can use the returned spelling candidates
   * and verified alternatives to ask the customer what they mean next.
   */
  async resolveProductName(
    requestedName: string,
    options?: { merchantBranchId?: number | null; category?: string | null; shadowMode?: boolean },
  ): Promise<ProductResolutionResult> {
    const cleanName = String(requestedName || '').trim();
    const merchantBranchId = options?.merchantBranchId ?? null;
    const direct = await this.searchProducts(cleanName, {
      merchantBranchId,
      shadowMode: options?.shadowMode,
    });

    if (direct.length > 0) {
      const normalized = cleanName.toLocaleLowerCase().trim();
      const exact = direct.find((entry) => entry.productName.toLocaleLowerCase() === normalized);
      return {
        stage: exact ? 'EXACT_MATCH' : 'ALIAS_MATCH',
        requestedName: cleanName,
        matched: exact || direct[0],
        spellingCandidates: [],
        verifiedAlternatives: [],
        searchedMerchantBranchId: merchantBranchId,
      };
    }

    const spellingCandidates = this.getSpellingCandidates(cleanName);
    for (const candidate of spellingCandidates) {
      const matches = await this.searchProducts(candidate, {
        merchantBranchId,
        shadowMode: options?.shadowMode,
      });
      if (matches.length > 0) {
        return {
          stage: 'SPELLING_CANDIDATE',
          requestedName: cleanName,
          matched: matches[0],
          spellingCandidates,
          verifiedAlternatives: [],
          searchedMerchantBranchId: merchantBranchId,
        };
      }
    }

    const verifiedAlternatives = await this.listVerifiedCategoryOptions(
      merchantBranchId,
      options?.category || null,
    );
    return {
      stage: verifiedAlternatives.length > 0 ? 'VERIFIED_ALTERNATIVE' : 'NO_MATCH',
      requestedName: cleanName,
      spellingCandidates,
      verifiedAlternatives,
      searchedMerchantBranchId: merchantBranchId,
    };
  }

  private getSpellingCandidates(rawName: string): string[] {
    const normalized = String(rawName || '').normalize('NFKC').toLocaleLowerCase().trim();
    const candidateMap: Record<string, string[]> = {
      kinza: ['kenza'],
      kenza: ['kinza'],
      kenze: ['kenza'],
      kenzaa: ['kenza'],
      'كينزا': ['كنزا'],
      'كنزا': ['كينزا'],
      pepsi: ['بيبسي'],
      'بيبسي': ['pepsi'],
    };
    return [...new Set(candidateMap[normalized] || [])];
  }

  /**
   * Return only currently verified merchant options for a category. This is a
   * catalog capability, not an intent heuristic; the AI decides when to ask
   * for a category and the server scopes it to trusted merchant state.
   */
  async listVerifiedCategoryOptions(
    merchantBranchId: number | null,
    category: string | null,
  ): Promise<SearchResult[]> {
    return this.listVerifiedMerchantMenu(merchantBranchId, { category, limit: 5 });
  }

  /** Return a verified merchant menu, optionally restricted to a category. */
  async listVerifiedMerchantMenu(
    merchantBranchId: number | null,
    options?: { category?: string | null; limit?: number },
  ): Promise<SearchResult[]> {
    if (!merchantBranchId) return [];
    const category = options?.category?.trim() || null;
    const categoryQuery = category && (category.toLocaleLowerCase().includes('drink') || category.toLocaleLowerCase().includes('beverage'))
      ? ['beverages', 'drinks']
      : category ? [category.toLocaleLowerCase()] : [];
    const categoryFilter = categoryQuery.length > 0
      ? `AND LOWER(c.slug) IN (${categoryQuery.map(() => '?').join(', ')})`
      : '';
    const rows = await query<any[]>(`
      SELECT
        mp.id AS merchantProductId,
        p.id AS productId,
        m.id AS merchantId,
        mb.id AS merchantBranchId,
        m.name AS merchantName,
        m.merchant_type AS merchantType,
        m.rating AS merchantRating,
        p.canonical_name AS productName,
        COALESCE(mp.description, p.description, '') AS description,
        mp.base_price AS basePrice,
        COALESCE(mbz.delivery_fee_override, dz.base_delivery_fee, 0) AS deliveryFee,
        COALESCE(mb.preparation_minutes, m.default_preparation_minutes, 20) + 15 AS estimatedMinutes
      FROM merchant_products mp
      JOIN products p ON p.id = mp.product_id
      JOIN categories c ON c.id = p.category_id
      JOIN merchant_branches mb ON mb.id = mp.merchant_branch_id
      JOIN merchants m ON m.id = mb.merchant_id
      LEFT JOIN merchant_branch_delivery_zones mbz ON mbz.merchant_branch_id = mb.id
      LEFT JOIN delivery_zones dz ON dz.id = mbz.delivery_zone_id
      WHERE mp.merchant_branch_id = ?
        AND mp.status = 'ACTIVE' AND mp.is_available = 1
        AND m.status = 'ACTIVE' AND m.accepts_orders = 1
        AND mb.status = 'ACTIVE' AND mb.accepts_orders = 1
        ${categoryFilter}
      ORDER BY mp.base_price ASC, mp.id ASC
      LIMIT ?
    `, [merchantBranchId, ...categoryQuery, Math.min(Math.max(options?.limit || 20, 1), 20)]);
    return rows.map((row) => ({
      merchantProductId: Number(row.merchantProductId),
      productId: Number(row.productId),
      merchantId: Number(row.merchantId),
      merchantBranchId: Number(row.merchantBranchId),
      merchantName: String(row.merchantName),
      merchantType: String(row.merchantType),
      merchantRating: Number(row.merchantRating || 0),
      productName: String(row.productName),
      description: String(row.description || ''),
      basePrice: Number(row.basePrice),
      deliveryFee: Number(row.deliveryFee || 0),
      estimatedMinutes: Number(row.estimatedMinutes || 0),
      isAvailable: true,
      score: 0,
    }));
  }

  /**
   * Supermarket whole-basket comparison (G-026, G-027)
   */
  async compareBasket(
    requestedItems: BasketItemRequest[],
    shadowMode = false
  ): Promise<BasketComparisonResult[]> {
    const supermarkets = await query<any[]>(`
      SELECT m.id as merchantId, mb.id as branchId, m.name, COALESCE(dz.base_delivery_fee, 1.50) as deliveryFee
      FROM merchants m
      JOIN merchant_branches mb ON mb.merchant_id = m.id
      LEFT JOIN delivery_zones dz ON dz.code = 'SAIDA_CENTRAL'
      LEFT JOIN merchant_operating_hours moh ON moh.merchant_branch_id = mb.id AND moh.day_of_week = (DAYOFWEEK(NOW()) - 1)
       WHERE m.merchant_type = 'SUPERMARKET'
        AND m.status = 'ACTIVE'
        AND m.accepts_orders = 1
        AND mb.status = 'ACTIVE'
        AND mb.accepts_orders = 1
         AND ${isTestEnvironment() ? '1 = 1' : `(moh.id IS NULL OR (
           moh.is_closed = 0 AND (
             moh.open_time IS NULL OR moh.close_time IS NULL OR
             (moh.open_time <= moh.close_time AND CURRENT_TIME() BETWEEN moh.open_time AND moh.close_time) OR
             (moh.open_time > moh.close_time AND (CURRENT_TIME() >= moh.open_time OR CURRENT_TIME() <= moh.close_time))
           )
         ))`}
    `);

    const comparisonList: BasketComparisonResult[] = [];

    for (const sm of supermarkets) {
      let itemsTotal = 0;
      const matchedItems = [];
      const missingItems: string[] = [];

      for (const item of requestedItems) {
        const matches = await this.searchProducts(item.query, { shadowMode });
        const storeMatch = matches.find(m => m.merchantId === sm.merchantId);

        if (storeMatch) {
          const lineTotal = storeMatch.basePrice * item.quantity;
          itemsTotal += lineTotal;
          matchedItems.push({
            requested: item.query,
            productName: storeMatch.productName,
            unitPrice: storeMatch.basePrice,
            quantity: item.quantity,
            lineTotal,
          });
        } else {
          missingItems.push(item.query);
        }
      }

      const deliveryFee = parseFloat(sm.deliveryFee);
      const isComplete = missingItems.length === 0;

      comparisonList.push({
        merchantId: sm.merchantId,
        merchantBranchId: sm.branchId,
        merchantName: sm.name,
        itemsTotal,
        deliveryFee,
        finalTotal: itemsTotal + deliveryFee,
        completeItemsCount: matchedItems.length,
        totalRequestedCount: requestedItems.length,
        isComplete,
        matchedItems,
        missingItems,
      });
    }

    // Rank by completeness first, then final total (G-027)
    comparisonList.sort((a, b) => {
      if (a.isComplete !== b.isComplete) return a.isComplete ? -1 : 1;
      return a.finalTotal - b.finalTotal;
    });

    return comparisonList;
  }

  async compareSupermarketBasket(
    requestedItems: BasketItemRequest[],
    shadowMode = false
  ): Promise<BasketComparisonResult[]> {
    return this.compareBasket(requestedItems, shadowMode);
  }

  async getAllMerchants(): Promise<any[]> {
    return query<any[]>(`
      SELECT m.*, mb.id as branch_id, mb.name as branch_name, mb.address, mb.preparation_minutes,
             COALESCE(dz.base_delivery_fee, 1.50) as delivery_fee
      FROM merchants m
      JOIN merchant_branches mb ON mb.merchant_id = m.id
      LEFT JOIN merchant_branch_delivery_zones mbz ON mbz.merchant_branch_id = mb.id
      LEFT JOIN delivery_zones dz ON dz.id = mbz.delivery_zone_id
      LEFT JOIN merchant_operating_hours moh ON moh.merchant_branch_id = mb.id AND moh.day_of_week = (DAYOFWEEK(NOW()) - 1)
      WHERE m.status = 'ACTIVE'
        AND m.accepts_orders = 1
        AND mb.status = 'ACTIVE'
        AND mb.accepts_orders = 1
         AND ${isTestEnvironment() ? '1 = 1' : `(moh.id IS NULL OR (
           moh.is_closed = 0 AND (
             moh.open_time IS NULL OR moh.close_time IS NULL OR
             (moh.open_time <= moh.close_time AND CURRENT_TIME() BETWEEN moh.open_time AND moh.close_time) OR
             (moh.open_time > moh.close_time AND (CURRENT_TIME() >= moh.open_time OR CURRENT_TIME() <= moh.close_time))
           )
         ))`}
      ORDER BY m.rating DESC
    `);
  }

  async getAllProducts(): Promise<any[]> {
    return query<any[]>(`
      SELECT 
        mp.id as merchant_product_id,
        p.id as product_id,
        p.canonical_name,
        p.name_ar,
        p.description,
        mp.base_price,
        mp.is_available,
        m.name as merchant_name,
        c.name_en as category_name
      FROM merchant_products mp
      JOIN products p ON p.id = mp.product_id
      JOIN merchant_branches mb ON mb.id = mp.merchant_branch_id
      JOIN merchants m ON m.id = mb.merchant_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN merchant_operating_hours moh ON moh.merchant_branch_id = mb.id AND moh.day_of_week = (DAYOFWEEK(NOW()) - 1)
      WHERE mp.status = 'ACTIVE'
        AND mp.is_available = 1
        AND m.status = 'ACTIVE'
        AND m.accepts_orders = 1
        AND mb.status = 'ACTIVE'
        AND mb.accepts_orders = 1
         AND ${isTestEnvironment() ? '1 = 1' : `(moh.id IS NULL OR (
           moh.is_closed = 0 AND (
             moh.open_time IS NULL OR moh.close_time IS NULL OR
             (moh.open_time <= moh.close_time AND CURRENT_TIME() BETWEEN moh.open_time AND moh.close_time) OR
             (moh.open_time > moh.close_time AND (CURRENT_TIME() >= moh.open_time OR CURRENT_TIME() <= moh.close_time))
           )
         ))`}
      ORDER BY m.name, p.canonical_name
    `);
  }
}

export const catalogService = new CatalogService();
