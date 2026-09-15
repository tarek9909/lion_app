import { catalogService } from '../modules/catalog/catalog.service.js';

function assert(condition: boolean, message: string, extra?: any) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`, extra || '');
    process.exit(1);
  }
  console.log(`  ✅ ${message} [PASS]`);
}

interface BenchmarkCase {
  id: string;
  category:
    | 'ENGLISH'
    | 'ARABIZI'
    | 'ARABIC_SCRIPT'
    | 'TYPO_VARIATION'
    | 'BUDGET_FILTERED'
    | 'MULTI_ITEM_BASKET'
    | 'NO_RESULT_UNAVAILABLE';
  query: string;
  expectedRelevantProducts: string[];
  basketItems?: { query: string; quantity: number }[];
  maxBudget?: number;
  preference?: 'cheapest' | 'best_rated' | 'fastest' | 'best_value';
  expectZeroResults?: boolean;
}

async function runCatalogSearchQualityTests() {
  console.log('\n🧪 Starting Multilingual Lexical & Normalized Search Quality Benchmark (Phase 7)...');
  console.log('ℹ️  Retrieval Mode: Lexical & Normalized N-Gram Matching (Embeddings not loaded offline: marked LEXICAL_NORMALIZED)\n');

  // Expanded benchmark with 25 diverse test cases covering all requirements
  const testCases: BenchmarkCase[] = [
    // 1. English queries
    {
      id: 'en_01',
      category: 'ENGLISH',
      query: 'crispy chicken',
      expectedRelevantProducts: ['Crispy Chicken Meal', 'Double Crispy Meal'],
    },
    {
      id: 'en_02',
      category: 'ENGLISH',
      query: 'beef burger',
      expectedRelevantProducts: ['Gourmet Beef Burger'],
    },
    {
      id: 'en_03',
      category: 'ENGLISH',
      query: 'french fries',
      expectedRelevantProducts: ['French Fries'],
    },
    {
      id: 'en_04',
      category: 'ENGLISH',
      query: 'chocolate cake',
      expectedRelevantProducts: ['Chocolate Cake Slice'],
    },
    {
      id: 'en_05',
      category: 'ENGLISH',
      query: 'coke zero',
      expectedRelevantProducts: ['Coke Zero', 'Coke Zero Can 330ml'],
    },

    // 2. Lebanese Arabizi queries
    {
      id: 'abz_01',
      category: 'ARABIZI',
      query: 'bade crispy chicken under 15$',
      expectedRelevantProducts: ['Crispy Chicken Meal', 'Double Crispy Meal'],
      maxBudget: 15,
    },
    {
      id: 'abz_02',
      category: 'ARABIZI',
      query: '7elo arkhas shi',
      expectedRelevantProducts: ['Chocolate Cake Slice', 'Nutella Crepe'],
      preference: 'cheapest',
    },
    {
      id: 'abz_03',
      category: 'ARABIZI',
      query: 'burger djej',
      expectedRelevantProducts: ['Chicken Burger'],
    },
    {
      id: 'abz_04',
      category: 'ARABIZI',
      query: 'batata ma2liyeh',
      expectedRelevantProducts: ['French Fries'],
    },
    {
      id: 'abz_05',
      category: 'ARABIZI',
      query: 'bade shi 7elo',
      expectedRelevantProducts: ['Nutella Crepe', 'Chocolate Cake Slice'],
    },

    // 3. Arabic script queries (with tashkeel, standard & Lebanese)
    {
      id: 'ar_01',
      category: 'ARABIC_SCRIPT',
      query: 'وَجْبَة كِرِيسْبِي',
      expectedRelevantProducts: ['Crispy Chicken Meal', 'Double Crispy Meal'],
    },
    {
      id: 'ar_02',
      category: 'ARABIC_SCRIPT',
      query: 'حلو شوكولا',
      expectedRelevantProducts: ['Chocolate Cake Slice'],
    },
    {
      id: 'ar_03',
      category: 'ARABIC_SCRIPT',
      query: 'برغر لحمة',
      expectedRelevantProducts: ['Gourmet Beef Burger'],
    },
    {
      id: 'ar_04',
      category: 'ARABIC_SCRIPT',
      query: 'بطاطا مقلية',
      expectedRelevantProducts: ['French Fries'],
    },
    {
      id: 'ar_05',
      category: 'ARABIC_SCRIPT',
      query: 'كوكا كولا زيرو',
      expectedRelevantProducts: ['Coke Zero', 'Coke Zero Can 330ml'],
    },

    // 4. Spelling variations & typos
    {
      id: 'typo_01',
      category: 'TYPO_VARIATION',
      query: 'krispy cheken',
      expectedRelevantProducts: ['Crispy Chicken Meal'],
    },
    {
      id: 'typo_02',
      category: 'TYPO_VARIATION',
      query: 'chiken burger',
      expectedRelevantProducts: ['Chicken Burger'],
    },
    {
      id: 'typo_03',
      category: 'TYPO_VARIATION',
      query: 'crep nutela',
      expectedRelevantProducts: ['Nutella Crepe'],
    },
    {
      id: 'typo_04',
      category: 'TYPO_VARIATION',
      query: 'شوكلا كيك',
      expectedRelevantProducts: ['Chocolate Cake Slice'],
    },

    // 5. Budget filtering
    {
      id: 'bud_01',
      category: 'BUDGET_FILTERED',
      query: 'crispy chicken under 13$',
      expectedRelevantProducts: ['Crispy Chicken Meal'],
      maxBudget: 12.5,
    },
    {
      id: 'bud_02',
      category: 'BUDGET_FILTERED',
      query: 'dessert under 5$',
      expectedRelevantProducts: ['Chocolate Cake Slice'],
      maxBudget: 5,
    },

    // 6. Multi-item basket queries
    {
      id: 'bsk_01',
      category: 'MULTI_ITEM_BASKET',
      query: 'milk and bread',
      expectedRelevantProducts: ['Fresh Milk 1L', 'White Sliced Bread'],
      basketItems: [{ query: 'milk', quantity: 1 }, { query: 'bread', quantity: 1 }],
    },
    {
      id: 'bsk_02',
      category: 'MULTI_ITEM_BASKET',
      query: 'coke zero and milk',
      expectedRelevantProducts: ['Coke Zero Can 330ml', 'Fresh Milk 1L'],
      basketItems: [{ query: 'coke zero', quantity: 1 }, { query: 'milk', quantity: 1 }],
    },

    // 7. No-result / unavailable items (testing zero false positive rate)
    {
      id: 'nores_01',
      category: 'NO_RESULT_UNAVAILABLE',
      query: 'sushi sashimi salmon roll',
      expectedRelevantProducts: [],
      expectZeroResults: true,
    },
    {
      id: 'nores_02',
      category: 'NO_RESULT_UNAVAILABLE',
      query: 'iphone 16 pro max case',
      expectedRelevantProducts: [],
      expectZeroResults: true,
    },
    {
      id: 'nores_03',
      category: 'NO_RESULT_UNAVAILABLE',
      query: 'beluga caviar 100g',
      expectedRelevantProducts: [],
      expectZeroResults: true,
    },
  ];

  let totalQueriesWithRelevant = 0;
  let sumRecallAt5 = 0;
  let sumNdcgAt5 = 0;
  let sumMrr = 0;
  let correctNoResults = 0;
  let totalNoResultQueries = 0;
  let totalBasketCases = 0;

  for (const tc of testCases) {
    if (tc.category === 'MULTI_ITEM_BASKET') {
      totalBasketCases++;
      const comparisons = await catalogService.compareBasket(tc.basketItems || []);
      const complete = comparisons.find((comparison) => comparison.isComplete);
      assert(Boolean(complete), `${tc.id} returns a complete basket comparison`);
      assert(
        Boolean(complete && complete.completeItemsCount === (tc.basketItems || []).length),
        `${tc.id} verifies every requested basket item is matched`
      );
      continue;
    }

    const results = await catalogService.searchProducts(tc.query, {
      maxBudget: tc.maxBudget,
      preference: tc.preference,
    });

    // Handle no-result queries
    if (tc.expectZeroResults) {
      totalNoResultQueries++;
      if (results.length === 0) {
        correctNoResults++;
      }
      continue;
    }

    assert(
      new Set(results.map((result) => result.merchantProductId)).size === results.length,
      `${tc.id} does not return duplicate merchant catalog products`
    );

    totalQueriesWithRelevant++;
    const expectedNormalized = tc.expectedRelevantProducts.map((p) => p.toLowerCase());
    const top5 = results.slice(0, 5);

    // True Recall@5: fraction of expected relevant items found in top 5
    const matchedExpectedInTop5 = new Set<string>();
    let firstHitRank: number | null = null;
    let dcgAt5 = 0;

    for (let i = 0; i < top5.length; i++) {
      const resName = top5[i].productName.toLowerCase();
      let isRelevant = false;

      for (const exp of expectedNormalized) {
        if (matchedExpectedInTop5.has(exp)) continue;
        if (resName.includes(exp) || exp.includes(resName)) {
          matchedExpectedInTop5.add(exp);
          isRelevant = true;
        }
      }

      if (isRelevant) {
        dcgAt5 += 1 / Math.log2(i + 2); // (i + 1) + 1 = i + 2
        if (firstHitRank === null) firstHitRank = i + 1;
      }
    }

    const queryRecallAt5 =
      expectedNormalized.length > 0 ? matchedExpectedInTop5.size / expectedNormalized.length : 1;
    if (queryRecallAt5 < 1) {
      console.log(`[RECALL MISS] ${tc.id} (${tc.query}): recall=${(queryRecallAt5*100).toFixed(1)}% | expected: ${JSON.stringify(tc.expectedRelevantProducts)} | top5: ${JSON.stringify(top5.map(t => t.productName))}`);
    }
    sumRecallAt5 += queryRecallAt5;

    // Ideal DCG@5
    let idcgAt5 = 0;
    const idealCount = Math.min(expectedNormalized.length, 5);
    for (let i = 0; i < idealCount; i++) {
      idcgAt5 += 1 / Math.log2(i + 2);
    }
    const queryNdcgAt5 = idcgAt5 > 0 ? dcgAt5 / idcgAt5 : 1;
    sumNdcgAt5 += queryNdcgAt5;

    if (firstHitRank !== null) {
      sumMrr += 1 / firstHitRank;
    }
  }

  const recallAt5 = sumRecallAt5 / totalQueriesWithRelevant;
  const ndcgAt5 = sumNdcgAt5 / totalQueriesWithRelevant;
  const mrr = sumMrr / totalQueriesWithRelevant;
  const noResultAccuracy = totalNoResultQueries > 0 ? correctNoResults / totalNoResultQueries : 1;

  console.log(`📊 Catalog Retrieval Quality Metrics (over ${testCases.length} diverse queries):`);
  console.log(`   - Recall@5: ${(recallAt5 * 100).toFixed(1)}% (Target: >= 95.0%)`);
  console.log(`   - NDCG@5: ${ndcgAt5.toFixed(3)} (Target: >= 0.850)`);
  console.log(`   - MRR: ${mrr.toFixed(3)} (Target: >= 0.800)`);
  console.log(`   - No-Result Accuracy: ${(noResultAccuracy * 100).toFixed(1)}% (Target: 100.0%)`);
  console.log(`   - Complete basket cases: ${totalBasketCases}/${testCases.filter((tc) => tc.category === 'MULTI_ITEM_BASKET').length}`);

  assert(recallAt5 >= 0.95, `True Recall@5 (${(recallAt5 * 100).toFixed(1)}%) >= 95% target`);
  assert(ndcgAt5 >= 0.85, `True NDCG@5 (${ndcgAt5.toFixed(3)}) >= 0.85 target`);
  assert(ndcgAt5 <= 1.0, `True NDCG@5 (${ndcgAt5.toFixed(3)}) is bounded at 1.0`);
  assert(mrr >= 0.80, `MRR (${mrr.toFixed(3)}) >= 0.80 target`);
  assert(noResultAccuracy === 1.0, `No-Result Accuracy (${(noResultAccuracy * 100).toFixed(1)}%) is strictly 100%`);

  // Verify cheapest preference ranking
  const cheapestResults = await catalogService.searchProducts('crispy chicken', { preference: 'cheapest' });
  assert(cheapestResults.length >= 2, 'cheapest preference returns multiple results');
  assert(
    cheapestResults[0].basePrice + cheapestResults[0].deliveryFee <=
      cheapestResults[1].basePrice + cheapestResults[1].deliveryFee,
    'cheapest preference properly sorts total delivered price ascending'
  );

  console.log('\n🏁 Multilingual Lexical Search Quality Benchmark: All Assertions Passed!\n');
}

runCatalogSearchQualityTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
