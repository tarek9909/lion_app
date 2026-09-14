import http from 'http';
import crypto from 'crypto';
import { app } from '../app.js';
import { resetDemo } from './reset-demo.js';
import { config } from '../config/env.js';
import { query } from '../database/db.js';
import { whatsappService } from '../modules/whatsapp/whatsapp.service.js';

export async function runWebhookTests(): Promise<boolean> {
  console.log('\n🧪 Starting WhatsApp Webhook & Media Integration Tests (Step 4, 5, 10)...');
  await resetDemo();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

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

  try {
    // 1. Meta Webhook Verification - Valid Token (G-016)
    const challengeCode = '1158201258';
    const verifyRes = await fetch(
      `${baseUrl}/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=${challengeCode}&hub.verify_token=${config.whatsapp.verifyToken}`
    );
    const verifyText = await verifyRes.text();
    assert(
      verifyRes.status === 200 && verifyText === challengeCode,
      'GET /webhooks/whatsapp verifies subscription and echoes hub.challenge'
    );

    // 2. Meta Webhook Verification - Invalid Token
    const badVerifyRes = await fetch(
      `${baseUrl}/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=${challengeCode}&hub.verify_token=wrong_token`
    );
    assert(
      badVerifyRes.status === 403,
      'GET /webhooks/whatsapp rejects invalid verify token with 403 Forbidden'
    );

    // 3. Webhook Inbound Message & Signature Verification (G-018)
    const testMsgId = `wamid.HBgL${Date.now()}`;
    const webhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '96170123456', phone_number_id: '123456789' },
                contacts: [{ profile: { name: 'Karim Test' }, wa_id: '96170123456' }],
                messages: [
                  {
                    from: '96170123456',
                    id: testMsgId,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    text: { body: 'bade crispy chicken under 15$' },
                    type: 'text',
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const payloadString = JSON.stringify(webhookPayload);
    const validSignature = `sha256=${crypto
      .createHmac('sha256', config.whatsapp.appSecret)
      .update(payloadString)
      .digest('hex')}`;

    const postRes = await fetch(`${baseUrl}/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': validSignature,
      },
      body: payloadString,
    });
    const postText = await postRes.text();
    assert(
      postRes.status === 200 && postText === 'EVENT_RECEIVED',
      'POST /webhooks/whatsapp validates HMAC-SHA256 signature and accepts inbound message'
    );

    // 4. Inbound Deduplication Verification (G-018)
    const replayRes = await fetch(`${baseUrl}/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': validSignature,
      },
      body: payloadString,
    });
    assert(
      replayRes.status === 200,
      'POST /webhooks/whatsapp handles replayed webhook gracefully without error'
    );

    let webhookRecords: any[] = [];
    for (let i = 0; i < 20; i++) {
      webhookRecords = await query<any[]>(
        `SELECT * FROM integration_webhook_events WHERE provider_event_id = ?`,
        [testMsgId]
      );
      if (webhookRecords.length > 0 && webhookRecords[0].processing_status === 'PROCESSED') {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    assert(
      webhookRecords.length === 1 && webhookRecords[0].processing_status === 'PROCESSED',
      'integration_webhook_events records exactly-once event persistence (deduplicated)'
    );

    const signPayload = (payload: any) => {
      const s = JSON.stringify(payload);
      return {
        body: s,
        signature: `sha256=${crypto
          .createHmac('sha256', config.whatsapp.appSecret)
          .update(s)
          .digest('hex')}`,
      };
    };

    // 5. Inbound Voice Note Processing (G-017, G-030)
    const audioMsgId = `wamid.AUDIO_${Date.now()}`;
    const audioPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '96170123456',
                    id: audioMsgId,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'audio',
                    audio: { id: 'media_audio_001', mime_type: 'audio/ogg' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const signedAudio = signPayload(audioPayload);
    const audioRes = await fetch(`${baseUrl}/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signedAudio.signature,
      },
      body: signedAudio.body,
    });
    assert(
      audioRes.status === 200,
      'POST /webhooks/whatsapp processes inbound voice note audio payload'
    );

    // 6. Inbound Image Processing (G-031)
    const imgMsgId = `wamid.IMG_${Date.now()}`;
    const imgPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '96170123456',
                    id: imgMsgId,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'image',
                    image: { id: 'media_image_001', caption: 'do they have this?' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const signedImg = signPayload(imgPayload);
    const imgRes = await fetch(`${baseUrl}/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signedImg.signature,
      },
      body: signedImg.body,
    });
    assert(
      imgRes.status === 200,
      'POST /webhooks/whatsapp processes inbound image vision payload'
    );

    // 7. Outbound Delivery Boundary & Retry Logic (G-016)
    const outboundResult = await whatsappService.sendMessage(
      '96170123456',
      'Test delivery confirmation message'
    );
    assert(
      outboundResult.success && Boolean(outboundResult.messageId),
      'whatsappService.sendMessage safely handles outbound delivery boundary with logging'
    );

  } finally {
    server.close();
  }

  console.log(`\n🏁 Webhook & Media Test Results: ${passed} Passed, ${failed} Failed`);
  return failed === 0;
}

if (process.argv[1]?.endsWith('test-webhook.ts') || process.argv[1]?.endsWith('test-webhook.js')) {
  runWebhookTests()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
