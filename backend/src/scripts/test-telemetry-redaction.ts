import { PiiRedactor } from '../modules/ai/telemetry/pii-redactor.js';
import { aiTelemetryService } from '../modules/ai/telemetry/ai-telemetry.service.js';
import { query } from '../database/db.js';
import { calculateGeminiCost, DEFAULT_GEMINI_38_FLASH_PRICING } from '../modules/ai/telemetry/gemini-pricing.js';
import { detectLanguage } from '../modules/ai/gemini.service.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${message}`);
    process.exit(1);
  }
  console.log(`  ✅ ${message} [PASS]`);
}

async function runTelemetryRedactionTests() {
  console.log('\n🧪 Starting AI Telemetry & PII Redaction Tests (Phase 3)...');

  // 1. Phone number and free-text personal name ("Karim") redaction
  const phoneText = 'Please deliver to Karim at +961 70 123456 or call 03123456';
  const phoneRedacted = PiiRedactor.redactText(phoneText);
  assert(!phoneRedacted.includes('70 123456'), 'Lebanese phone +961 70 123456 redacted');
  assert(!phoneRedacted.includes('03123456'), 'Lebanese local phone 03123456 redacted');
  assert(phoneRedacted.includes('[REDACTED_PHONE]'), 'Phone replacement token present');
  assert(!phoneRedacted.includes('Karim'), 'Customer name "Karim" in free text is redacted');
  assert(phoneRedacted.includes('[REDACTED_NAME]'), 'Customer name replacement token present');

  const introTextAr = 'أهلاً أنا كريم وبدي أطلب أكل';
  const introRedactedAr = PiiRedactor.redactText(introTextAr);
  assert(!introRedactedAr.includes('كريم'), 'Arabic customer name "كريم" after intro is redacted');
  assert(introRedactedAr.includes('[REDACTED_NAME]'), 'Arabic name token present');

  // 2. GPS coordinates redaction
  const gpsText = 'Customer shared location: Lat 33.5635, Lng 35.3720 (Near Saida Castle)';
  const gpsRedacted = PiiRedactor.redactText(gpsText);
  assert(!gpsRedacted.includes('33.5635'), 'Latitude coordinate redacted');
  assert(!gpsRedacted.includes('35.3720'), 'Longitude coordinate redacted');
  assert(gpsRedacted.includes('[REDACTED_GPS]'), 'GPS replacement token present');

  // 3. Provider Message IDs
  const providerText = 'Meta message received: wamid.HBgLMTc4OTQ1MjY4NDkyNA==';
  const providerRedacted = PiiRedactor.redactText(providerText);
  assert(!providerRedacted.includes('HBgLMTc4OTQ1'), 'WhatsApp provider ID redacted');
  assert(providerRedacted.includes('[REDACTED_PROVIDER_ID]'), 'Provider ID replacement token present');

  // 4. API keys and secrets
  const secretText = 'Calling Gemini with AIzaSyD987a6sd5f7as6df7as6d5f7asd6f and Bearer eyJhbGciOiJIUzI1NiJ9';
  const secretRedacted = PiiRedactor.redactText(secretText);
  assert(!secretRedacted.includes('AIzaSy'), 'Google Gemini API key redacted');
  assert(!secretRedacted.includes('eyJhbGciOiJIUzI1NiJ9'), 'Bearer token redacted');
  assert(secretRedacted.includes('[REDACTED_SECRET]'), 'Secret replacement token present');

  // 5. Deep object redaction with addresses and names (P0/P1 audit requirement)
  const complexObj = {
    customer: {
      customer_name: 'Tarek Demo',
      display_name: 'Tarek D.',
      phone: '+96170123456',
      token: 'secret_jwt_token_here',
      location: {
        latitude: 33.56,
        longitude: 35.37,
      },
      address: {
        street: 'Corniche El Baher',
        building: 'Al-Amir Tower',
        floor: '4th Floor',
        apartment: 'Apt 12B',
        landmark: 'Behind Saida Castle',
      },
    },
    message: 'Call me at 03998877 or deliver to بناية السلام طابق ٢ شقة ٣',
  };
  const redactedObj: any = PiiRedactor.redactObject(complexObj);
  assert(redactedObj.customer.customer_name === '[REDACTED_NAME]', 'Identifiable customer_name redacted');
  assert(redactedObj.customer.display_name === '[REDACTED_NAME]', 'Identifiable display_name redacted');
  assert(redactedObj.customer.phone === '[REDACTED_PHONE]', 'Object nested phone redacted');
  assert(redactedObj.customer.token === '[REDACTED_SECRET]', 'Object nested secret token redacted');
  assert(redactedObj.customer.location.latitude === '[REDACTED_GPS]', 'Object nested GPS redacted');
  assert(redactedObj.customer.address.street === '[REDACTED_ADDRESS]', 'Nested address street redacted');
  assert(redactedObj.customer.address.building === '[REDACTED_ADDRESS]', 'Nested address building redacted');
  assert(redactedObj.customer.address.floor === '[REDACTED_ADDRESS]', 'Nested address floor redacted');
  assert(redactedObj.customer.address.apartment === '[REDACTED_ADDRESS]', 'Nested address apartment redacted');
  assert(redactedObj.customer.address.landmark === '[REDACTED_ADDRESS]', 'Nested address landmark redacted');
  assert(redactedObj.message.includes('[REDACTED_PHONE]'), 'Object nested text phone redacted');
  assert(redactedObj.message.includes('[REDACTED_ADDRESS]'), 'Object nested Arabic address details redacted');

  // 6. Free-text address detail redactions (English and Arabic)
  const addressTextEn = 'Drop the food at building Al-Safir, 2nd floor, apartment 4';
  const addressRedactedEn = PiiRedactor.redactText(addressTextEn);
  assert(addressRedactedEn.includes('[REDACTED_ADDRESS]'), 'English address details redacted');
  assert(!addressRedactedEn.includes('Al-Safir'), 'English building name masked');

  const addressTextAr = 'التوصيل الى بناية الزهور طابق ٣ شقة ٥ قرب القلعة';
  const addressRedactedAr = PiiRedactor.redactText(addressTextAr);
  assert(addressRedactedAr.includes('[REDACTED_ADDRESS]'), 'Arabic address details redacted');
  assert(!addressRedactedAr.includes('الزهور'), 'Arabic building details masked');

  // 7. Non-blocking telemetry persistence to MySQL (Customer WhatsApp)
  const interactionId = await aiTelemetryService.recordInteraction({
    aiContext: 'CUSTOMER_WHATSAPP',
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    interactionType: 'CHAT_TURN',
    rawInput: 'Bade 2 crispy chicken meals to +96170123456 at building Al-Amir 3rd floor',
    rawOutput: 'Added 2 crispy chicken meals! Total is $22.00.',
    detectedIntent: 'ADD_TO_CART',
    detectedLanguage: 'arabizi',
    latencyMs: 450,
    estimatedCostUsd: 0.00045,
    toolCalls: [{ name: 'add_to_cart', args: { quantity: 2, query: 'crispy chicken' } }],
    success: true,
  });

  assert(Boolean(interactionId), 'Customer telemetry record saved and returned public UUID');

  // 8. Management AI telemetry with authenticated dashboard userId
  const mgmtInteractionId = await aiTelemetryService.recordInteraction({
    aiContext: 'MANAGEMENT_COPILOT',
    dashboardUserId: 1,
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    interactionType: 'ANALYTICS_QUERY',
    rawInput: 'How many orders today?',
    rawOutput: 'There were 15 orders placed today with total revenue of $210.00.',
    detectedIntent: 'MANAGEMENT_ANALYTICS',
    latencyMs: 320,
    estimatedCostUsd: 0.00021,
    success: true,
  });

  assert(Boolean(mgmtInteractionId), 'Management AI telemetry record saved with dashboardUserId');

  // 9. Verify records in MySQL
  const rows: any = await query(
    `SELECT public_id, dashboard_user_id, model_name, input_summary, output_summary, structured_output, tool_calls_json, latency_ms, success
     FROM ai_interactions WHERE public_id IN (?, ?)`,
    [interactionId, mgmtInteractionId]
  );

  assert(rows.length === 2, 'Both interaction rows exist in MySQL ai_interactions table');
  
  const customerRow = rows.find((r: any) => r.public_id === interactionId);
  assert(!customerRow.input_summary.includes('+96170123456'), 'Persisted customer input_summary has phone redacted');
  assert(customerRow.input_summary.includes('[REDACTED_PHONE]'), 'Persisted input_summary contains phone redaction marker');
  assert(customerRow.input_summary.includes('[REDACTED_ADDRESS]'), 'Persisted input_summary contains address redaction marker');
  assert(customerRow.model_name === 'gemini:gemini-3.8-flash', 'Model name correctly formatted');
  assert(customerRow.latency_ms === 450, 'Latency stored correctly');
  assert(customerRow.success === 1, 'Success flag recorded as 1');

  const mgmtRow = rows.find((r: any) => r.public_id === mgmtInteractionId);
  assert(mgmtRow.dashboard_user_id === 1, 'Authenticated dashboard userId correctly persisted in Management AI telemetry');

  // 10. Gemini 3.8 Flash Standard Pricing Calculations ($0.75 input / $3.75 output per 1M tokens)
  assert(DEFAULT_GEMINI_38_FLASH_PRICING.inputPerMillionUsd === 0.75, 'Standard input pricing is $0.75/1M tokens');
  assert(DEFAULT_GEMINI_38_FLASH_PRICING.outputPerMillionUsd === 3.75, 'Standard output pricing is $3.75/1M tokens');

  const zeroCost = calculateGeminiCost(0, 0);
  assert(zeroCost === 0, 'Zero tokens cost is $0.00');

  const oneMillionEach = calculateGeminiCost(1_000_000, 1_000_000);
  assert(oneMillionEach === 4.5, '1M input + 1M output tokens cost exactly $4.50');

  const typicalTurnCost = calculateGeminiCost(1000, 200);
  assert(typicalTurnCost === 0.0015, '1000 in + 200 out tokens cost exactly $0.0015 (0.00075 + 0.00075)');

  const customPricingCost = calculateGeminiCost(1_000_000, 1_000_000, {
    inputPerMillionUsd: 1.0,
    outputPerMillionUsd: 2.0,
  });
  assert(customPricingCost === 3.0, 'Custom pricing overrides apply correctly');

  // 11. Conversational Language Detection (Arabic script, Arabizi, English, Mixed)
  const langArabic = detectLanguage('بدي سندويش كريسبي دجاج مع بطاطا');
  assert(langArabic === 'ar', `Arabic script detected as 'ar' (got '${langArabic}')`);

  const langArabizi = detectLanguage('bade 2 crispy ma2liyeh ya3tik el 3afye');
  assert(langArabizi === 'arabizi', `Lebanese Arabizi detected as 'arabizi' (got '${langArabizi}')`);

  const langEnglish = detectLanguage('Can you add extra garlic and pickles to my burger please?');
  assert(langEnglish === 'en', `English text detected as 'en' (got '${langEnglish}')`);

  const langMixed = detectLanguage('bade 2 كريسبي مع extra garlic');
  assert(langMixed === 'mixed', `Mixed Arabic/Latin detected as 'mixed' (got '${langMixed}')`);

  // 12. Failure Telemetry Persistence with requestId
  const testRequestId = 'req-fail-test-' + Date.now();
  const failInteractionId = await aiTelemetryService.recordInteraction({
    aiContext: 'CUSTOMER_WHATSAPP',
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    interactionType: 'CHAT_TURN',
    rawInput: 'Baddi order burger',
    rawOutput: '',
    requestId: testRequestId,
    success: false,
    errorMessage: 'Error: UNAVAILABLE (code 503): No capacity available for model gemini-3.8-flash-high',
    latencyMs: 120,
    estimatedCostUsd: 0,
  });

  assert(Boolean(failInteractionId), 'Failure telemetry record saved');

  const [failRow]: any = await query(
    `SELECT public_id, structured_output, success, error_code, latency_ms
     FROM ai_interactions WHERE public_id = ?`,
    [failInteractionId]
  );
  assert(failRow !== undefined, 'Failure telemetry record found in MySQL');
  assert(failRow.success === 0, 'Failure row recorded success = 0');
  const structured = typeof failRow.structured_output === 'string'
    ? JSON.parse(failRow.structured_output)
    : failRow.structured_output;
  assert(structured.request_id === testRequestId, 'Failure row recorded matching request_id in structured_output');
  assert(
    failRow.error_code.includes('503') && failRow.error_code.includes('No capacity available'),
    'Failure row accurately captured API 503 error message in error_code column'
  );
  assert(
    structured.error_message.includes('503') && structured.error_message.includes('No capacity available'),
    'Failure row accurately captured API 503 error message in structured_output'
  );

  console.log('\n🏁 AI Telemetry & Redaction Tests: All Assertions Passed!\n');
}

runTelemetryRedactionTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
