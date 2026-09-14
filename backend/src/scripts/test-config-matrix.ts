import { validateStartupConfig, config } from '../config/env.js';
import { mediaService, OpenAiWhisperAudioTranscriptionProvider, OpenAiVisionProvider, FixtureAudioTranscriptionProvider, FixtureVisionProvider } from '../modules/media/media.service.js';
import { whatsappService } from '../modules/whatsapp/whatsapp.service.js';

export async function runConfigMatrixTests(): Promise<boolean> {
  console.log('\n🧪 Starting Configuration & Provider Matrix Tests (G-061, G-062, G-065)...');

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, name: string, detail?: any) => {
    if (condition) {
      console.log(`  ✅ ${name} [PASS]`);
      passed++;
    } else {
      console.error(`  ❌ ${name} [FAIL]`, detail || '');
      failed++;
    }
  };

  // -------------------------------------------------------------
  // Test 1: MOCK / FIXTURE Startup Validation (G-061)
  // -------------------------------------------------------------
  try {
    const res = validateStartupConfig({
      whatsapp: { mode: 'MOCK', accessToken: '', phoneNumberId: '' },
      media: { mode: 'FIXTURE', transcriptionProvider: 'FIXTURE', visionProvider: 'FIXTURE', openAiApiKey: '' },
    });
    assert(res.whatsappValid === true, 'MOCK/FIXTURE startup succeeds without requiring external credentials (G-061)');
  } catch (err: any) {
    assert(false, 'MOCK/FIXTURE startup validation threw unexpected error', err.message);
  }

  // -------------------------------------------------------------
  // Test 2: LIVE Startup Rejection Without Credentials (G-061)
  // -------------------------------------------------------------
  try {
    validateStartupConfig({
      whatsapp: { mode: 'LIVE', accessToken: '', phoneNumberId: '' },
      media: { mode: 'FIXTURE' },
    });
    assert(false, 'LIVE mode without credentials must fail startup');
  } catch (err: any) {
    assert(
      err.message.includes('WHATSAPP_MODE is set to LIVE') && err.message.includes('missing or placeholder'),
      'LIVE WhatsApp startup fails fast when credentials are empty (G-061)'
    );
  }

  try {
    validateStartupConfig({
      whatsapp: {
        mode: 'LIVE',
        accessToken: 'demo_whatsapp_access_token_placeholder',
        phoneNumberId: 'demo_phone_number_id_placeholder',
      },
      media: { mode: 'FIXTURE' },
    });
    assert(false, 'LIVE mode with placeholder credentials must fail startup');
  } catch (err: any) {
    assert(
      err.message.includes('missing or placeholder'),
      'LIVE WhatsApp startup fails fast when placeholder credentials are used (G-061)'
    );
  }

  // -------------------------------------------------------------
  // Test 3: Correct Provider Selection in FIXTURE vs LIVE (G-062, G-065)
  // -------------------------------------------------------------
  const originalMediaMode = config.media.mode;
  const originalTransProvider = config.media.transcriptionProvider;
  const originalVisionProvider = config.media.visionProvider;
  const originalApiKey = config.media.openAiApiKey;
  const originalWaMode = config.whatsapp.mode;
  const originalWaToken = config.whatsapp.accessToken;

  try {
    // 3a. FIXTURE mode selection
    config.media.mode = 'FIXTURE';
    const fixtureAudio = mediaService.createAudioProvider();
    const fixtureVision = mediaService.createVisionProvider();
    assert(
      fixtureAudio instanceof FixtureAudioTranscriptionProvider && fixtureAudio.name === 'FIXTURE_AUDIO_PROVIDER',
      'FIXTURE mode selects FixtureAudioTranscriptionProvider (G-065)'
    );
    assert(
      fixtureVision instanceof FixtureVisionProvider && fixtureVision.name === 'FIXTURE_VISION_PROVIDER',
      'FIXTURE mode selects FixtureVisionProvider (G-065)'
    );

    // 3b. LIVE mode selection
    config.media.mode = 'LIVE';
    config.media.transcriptionProvider = 'WHISPER';
    config.media.visionProvider = 'VISION_API';
    const liveAudio = mediaService.createAudioProvider();
    const liveVision = mediaService.createVisionProvider();
    assert(
      liveAudio instanceof OpenAiWhisperAudioTranscriptionProvider && liveAudio.name === 'OPENAI_WHISPER',
      'LIVE mode selects OpenAiWhisperAudioTranscriptionProvider (G-062)'
    );
    assert(
      liveVision instanceof OpenAiVisionProvider && liveVision.name === 'OPENAI_VISION',
      'LIVE mode selects OpenAiVisionProvider (G-062)'
    );

    // 3c. LIVE mode never selects fixture providers automatically
    assert(
      !(liveAudio instanceof FixtureAudioTranscriptionProvider),
      'LIVE mode never selects FixtureAudioTranscriptionProvider automatically (G-062)'
    );
    assert(
      !(liveVision instanceof FixtureVisionProvider),
      'LIVE mode never selects FixtureVisionProvider automatically (G-062)'
    );

    // -------------------------------------------------------------
    // Test 4: LIVE Media Fail-Closed Behavior (G-062)
    // -------------------------------------------------------------
    // In LIVE mode without credentials, downloadMedia must throw and reject fixture fallback
    config.whatsapp.accessToken = '';
    try {
      await mediaService.downloadMedia('meta_live_test_123', 'audio');
      assert(false, 'LIVE downloadMedia without token must fail');
    } catch (err: any) {
      assert(
        err.message.includes('MEDIA_MODE is LIVE') && err.message.includes('WHATSAPP_ACCESS_TOKEN is missing'),
        'LIVE downloadMedia fails fast when Meta token is missing (G-062)'
      );
    }

    // Process audio in LIVE mode without key -> must fail closed, NOT return canned transcript
    mediaService.reconfigureProviders();
    config.media.openAiApiKey = '';
    try {
      const audioRes = await mediaService.processAudioMessage('meta_live_audio_fail');
      assert(false, 'LIVE audio processing without credentials must throw, got: ' + JSON.stringify(audioRes));
    } catch (err: any) {
      assert(
        err.message.includes('failed in LIVE mode') || err.message.includes('OPENAI_API_KEY'),
        'LIVE audio processing fails closed without credentials and does not return canned transcript (G-062)'
      );
    }

    // Process image in LIVE mode without key -> must fail closed, NOT return canned labels
    try {
      const imgRes = await mediaService.processImageMessage('meta_live_img_fail');
      assert(false, 'LIVE image processing without credentials must throw, got: ' + JSON.stringify(imgRes));
    } catch (err: any) {
      assert(
        err.message.includes('failed in LIVE mode') || err.message.includes('OPENAI_API_KEY'),
        'LIVE image processing fails closed without credentials and does not return canned labels (G-062)'
      );
    }

    // -------------------------------------------------------------
    // Test 5: Reverting to FIXTURE restores deterministic demo behavior (G-062)
    // -------------------------------------------------------------
    config.media.mode = 'FIXTURE';
    config.media.transcriptionProvider = 'FIXTURE';
    config.media.visionProvider = 'FIXTURE';
    mediaService.reconfigureProviders();

    const fixtureAudioRes = await mediaService.processAudioMessage('voice_order_crispy_chicken.ogg');
    assert(
      fixtureAudioRes.isMock === true && fixtureAudioRes.transcript.includes('Crispy Chicken'),
      'FIXTURE mode successfully provides deterministic audio demo results (G-062)'
    );

    const fixtureImgRes = await mediaService.processImageMessage('crispy_tenders.jpg');
    assert(
      fixtureImgRes.isMock === true && Boolean(fixtureImgRes.matchedProduct),
      'FIXTURE mode successfully matches demo food photo against catalog (G-062)'
    );

    // -------------------------------------------------------------
    // Test 6: External Verification Status Reporting (G-065)
    // -------------------------------------------------------------
    config.whatsapp.mode = 'LIVE';
    config.whatsapp.accessToken = '';
    const pingRes = await whatsappService.pingMetaApi();
    assert(
      pingRes.ok === false && Boolean(pingRes.error?.includes('EXTERNAL VERIFICATION PENDING') || pingRes.error?.includes('Credentials not configured')),
      'Meta API ping clearly reports EXTERNAL VERIFICATION PENDING when unconfigured (G-065)'
    );

  } finally {
    // Restore original configs
    config.media.mode = originalMediaMode;
    config.media.transcriptionProvider = originalTransProvider;
    config.media.visionProvider = originalVisionProvider;
    config.media.openAiApiKey = originalApiKey;
    config.whatsapp.mode = originalWaMode;
    config.whatsapp.accessToken = originalWaToken;
    mediaService.reconfigureProviders();
  }

  console.log(`\n🏁 Configuration Matrix Results: ${passed} Passed, ${failed} Failed`);
  return failed === 0;
}

if (process.argv[1]?.endsWith('test-config-matrix.ts') || process.argv[1]?.endsWith('test-config-matrix.js')) {
  runConfigMatrixTests()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error('Fatal config matrix failure:', err);
      process.exit(1);
    });
}
