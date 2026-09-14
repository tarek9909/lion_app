import { execute } from '../../database/db.js';
import { catalogService } from '../catalog/catalog.service.js';
import { config } from '../../config/env.js';

export interface AudioTranscriptionResult {
  transcript: string;
  durationSeconds: number;
  provider: string;
  isMock: boolean;
}

export interface ImageAnalysisResult {
  detectedLabels: string[];
  matchedProduct?: any;
  candidates?: any[];
  confidence: number;
  description: string;
  provider: string;
  isMock: boolean;
}

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
  fileSizeBytes: number;
  fileName: string;
  providerMediaId?: string;
  isMock: boolean;
}

export interface AudioTranscriptionProvider {
  name: string;
  transcribe(media: DownloadedMedia, hint?: string): Promise<AudioTranscriptionResult>;
}

export interface ImageVisionProvider {
  name: string;
  analyze(media: DownloadedMedia, hint?: string): Promise<ImageAnalysisResult>;
}

/**
 * Real OpenAI Whisper Audio Transcription Provider (G-054)
 */
export class OpenAiWhisperAudioTranscriptionProvider implements AudioTranscriptionProvider {
  name = 'OPENAI_WHISPER';

  async transcribe(media: DownloadedMedia, hint?: string): Promise<AudioTranscriptionResult> {
    const apiKey = config.media.openAiApiKey;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured for Whisper transcription provider');
    }

    const formData = new FormData();
    const blob = new Blob([media.buffer], { type: media.mimeType });
    formData.append('file', blob, media.fileName || 'voice_note.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'ar');
    if (hint) formData.append('prompt', hint);

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI Whisper API error HTTP ${res.status}: ${err}`);
    }

    const data: any = await res.json();
    return {
      transcript: data.text,
      durationSeconds: 4.0,
      provider: 'OPENAI_WHISPER',
      isMock: false,
    };
  }
}

/**
 * Real OpenAI Vision Provider (G-054)
 */
export class OpenAiVisionProvider implements ImageVisionProvider {
  name = 'OPENAI_VISION';

  async analyze(media: DownloadedMedia, hint?: string): Promise<ImageAnalysisResult> {
    const apiKey = config.media.openAiApiKey;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured for Vision provider');
    }

    const base64Image = media.buffer.toString('base64');
    const prompt = `Identify the food dish or product in this image for a Lebanese delivery menu (e.g. Crispy Chicken Meal, Classic Cheeseburger, Nutella Crepe, Coke Zero). Hint text: "${hint || 'none'}". Return concise response identifying item.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${media.mimeType};base64,${base64Image}` } },
            ],
          },
        ],
        max_tokens: 100,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI Vision API error HTTP ${res.status}: ${err}`);
    }

    const data: any = await res.json();
    const content = (data.choices?.[0]?.message?.content || '').trim();

    // Match output against MySQL catalog
    const searchResults = await catalogService.searchProducts(content);
    const matchedProduct = searchResults.length > 0 ? searchResults[0] : undefined;

    return {
      detectedLabels: ['Food Item', content],
      matchedProduct,
      candidates: searchResults.slice(0, 3),
      confidence: 0.95,
      description: `Recognized: ${content}`,
      provider: 'OPENAI_VISION',
      isMock: false,
    };
  }
}

/**
 * Fixture Audio Transcription Provider (Explicit Local Demo / Offline Boundary)
 */
export class FixtureAudioTranscriptionProvider implements AudioTranscriptionProvider {
  name = 'FIXTURE_AUDIO_PROVIDER';

  async transcribe(media: DownloadedMedia, hint?: string): Promise<AudioTranscriptionResult> {
    const raw = (hint || media.fileName || '').toLowerCase();

    let transcript = 'Baddi 2 haleeb, cartonet bayd, w khobez';
    if (raw.includes('chicken') || raw.includes('crispy')) {
      transcript = 'Baddi wahad Crispy Chicken Meal w wahed Coke Zero';
    } else if (raw.includes('groceries') || raw.includes('basket') || raw.includes('metro') || raw.includes('supermarket')) {
      transcript = 'Baddi 2 haleeb, 1 bayd, w khobez min Metro Supermarket';
    } else if (raw.includes('burger')) {
      transcript = 'Baddi 2 burger spot meal w french fries';
    } else if (raw.includes('sweet') || raw.includes('knafeh') || raw.includes('crepe')) {
      transcript = 'Baddi Nutella Crepe w 3asir';
    }

    return {
      transcript,
      durationSeconds: 4.2,
      provider: 'FIXTURE_AUDIO_BOUNDARY',
      isMock: true,
    };
  }
}

/**
 * Fixture Vision Provider (Explicit Local Demo / Offline Boundary)
 */
export class FixtureVisionProvider implements ImageVisionProvider {
  name = 'FIXTURE_VISION_PROVIDER';

  async analyze(media: DownloadedMedia, hint?: string): Promise<ImageAnalysisResult> {
    const raw = (hint || media.fileName || '').toLowerCase();

    if (raw.includes('ambiguous') || raw.includes('unclear') || raw.includes('multiple matches')) {
      const candidates = (await catalogService.searchProducts('crispy')).slice(0, 3);
      return {
        detectedLabels: ['Crispy food', 'Fast food', 'Multiple possible matches'],
        matchedProduct: candidates[0],
        candidates,
        confidence: 0.72,
        description: 'Image resembles multiple catalog products',
        provider: 'FIXTURE_VISION_BOUNDARY',
        isMock: true,
      };
    }

    let matchedItemName = 'Crispy Chicken Meal';
    let detectedLabels = ['Fried Chicken', 'Fast Food', 'Meal Box'];
    let confidence = 0.94;

    if (raw.includes('burger') || raw.includes('cheese')) {
      matchedItemName = 'Classic Cheeseburger';
      detectedLabels = ['Cheeseburger', 'Beef Burger', 'Fast Food'];
      confidence = 0.92;
    } else if (raw.includes('sweet') || raw.includes('knafeh') || raw.includes('crepe') || raw.includes('dessert')) {
      matchedItemName = 'Nutella Crepe';
      detectedLabels = ['Nutella Crepe', 'Middle Eastern Sweet', 'Dessert'];
      confidence = 0.96;
    } else if (raw.includes('coke') || raw.includes('cola')) {
      matchedItemName = 'Coke Zero';
      detectedLabels = ['Soft Drink', 'Can', 'Beverage'];
      confidence = 0.95;
    }

    const searchResults = await catalogService.searchProducts(matchedItemName);
    const matchedProduct = searchResults.length > 0 ? searchResults[0] : undefined;

    return {
      detectedLabels,
      matchedProduct,
      candidates: searchResults.slice(0, 3),
      confidence,
      description: `Identified ${matchedItemName} with ${(confidence * 100).toFixed(0)}% confidence`,
      provider: 'FIXTURE_VISION_BOUNDARY',
      isMock: true,
    };
  }
}

export class MediaService {
  private audioProvider: AudioTranscriptionProvider;
  private visionProvider: ImageVisionProvider;

  constructor() {
    this.audioProvider = this.createAudioProvider();
    this.visionProvider = this.createVisionProvider();
  }

  public createAudioProvider(): AudioTranscriptionProvider {
    if (config.media.mode === 'LIVE') {
      if (config.media.transcriptionProvider === 'WHISPER') {
        return new OpenAiWhisperAudioTranscriptionProvider();
      }
      throw new Error(`Invalid live transcription provider: ${config.media.transcriptionProvider}`);
    }
    return new FixtureAudioTranscriptionProvider();
  }

  public createVisionProvider(): ImageVisionProvider {
    if (config.media.mode === 'LIVE') {
      if (config.media.visionProvider === 'VISION_API') {
        return new OpenAiVisionProvider();
      }
      throw new Error(`Invalid live vision provider: ${config.media.visionProvider}`);
    }
    return new FixtureVisionProvider();
  }

  public reconfigureProviders() {
    this.audioProvider = this.createAudioProvider();
    this.visionProvider = this.createVisionProvider();
  }

  setAudioProvider(provider: AudioTranscriptionProvider) {
    this.audioProvider = provider;
  }

  setVisionProvider(provider: ImageVisionProvider) {
    this.visionProvider = provider;
  }

  getAudioProviderName(): string {
    return this.audioProvider.name;
  }

  getVisionProviderName(): string {
    return this.visionProvider.name;
  }

  /**
   * Download Media using Meta Cloud API or return fixture boundary (G-054)
   */
  async downloadMedia(mediaIdOrUrl: string, expectedType: 'audio' | 'image'): Promise<DownloadedMedia> {
    const isAudio = expectedType === 'audio';

    // Explicit LIVE download handling
    if (config.media.mode === 'LIVE') {
      if (!config.whatsapp.accessToken || config.whatsapp.accessToken.startsWith('demo_')) {
        throw new Error('MEDIA_MODE is LIVE but Meta Cloud API WHATSAPP_ACCESS_TOKEN is missing');
      }

      // Step 1: Query Meta Graph API for media URL
      const metaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaIdOrUrl}`, {
        headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
      });

      if (!metaRes.ok) {
        throw new Error(`Failed to fetch media metadata from Meta: HTTP ${metaRes.status}`);
      }

      const metaData: any = await metaRes.json();
      const { url: downloadUrl, mime_type, file_size } = metaData;

      // Validate MIME type
      if (isAudio && mime_type && !mime_type.startsWith('audio/')) {
        throw new Error(`Invalid MIME type for audio: ${mime_type}`);
      }
      if (!isAudio && mime_type && !mime_type.startsWith('image/')) {
        throw new Error(`Invalid MIME type for image: ${mime_type}`);
      }

      // Size validation (< 16 MB)
      if (file_size && file_size > 16 * 1024 * 1024) {
        throw new Error(`Media file exceeds 16MB limit (${file_size} bytes)`);
      }

      // Step 2: Download binary stream
      const binRes = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
      });

      if (!binRes.ok) {
        throw new Error(`Failed to download binary from Meta CDN: HTTP ${binRes.status}`);
      }

      const arrayBuf = await binRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      if (buffer.length > 16 * 1024 * 1024) {
        throw new Error(`Media file exceeds 16MB limit (${buffer.length} bytes)`);
      }

      return {
        buffer,
        mimeType: mime_type || (isAudio ? 'audio/ogg' : 'image/jpeg'),
        fileSizeBytes: buffer.length,
        fileName: `meta_${mediaIdOrUrl}.${isAudio ? 'ogg' : 'jpg'}`,
        providerMediaId: mediaIdOrUrl,
        isMock: false,
      };
    }

    // Fixture fallback ONLY for explicit FIXTURE or MOCK mode (G-062)
    if ((config.media.mode as string) === 'LIVE') {
      throw new Error('Cannot use fixture media payload when MEDIA_MODE is LIVE');
    }

    const mockContent = Buffer.from(`LION_DEMO_FIXTURE_PAYLOAD:${expectedType}:${mediaIdOrUrl}`);
    return {
      buffer: mockContent,
      mimeType: isAudio ? 'audio/ogg' : 'image/jpeg',
      fileSizeBytes: mockContent.length,
      fileName: `fixture_${mediaIdOrUrl}.${isAudio ? 'ogg' : 'jpg'}`,
      providerMediaId: mediaIdOrUrl,
      isMock: true,
    };
  }

  /**
   * Process Voice / Audio Message (G-030, G-054, G-062)
   * Downloads media, transcribes via provider boundary, persists to message_media
   */
  async processAudioMessage(
    audioUrlOrId: string,
    messageId?: number,
    voiceTranscriptHint?: string
  ): Promise<AudioTranscriptionResult> {
    try {
      const media = await this.downloadMedia(audioUrlOrId, 'audio');
      const result = await this.audioProvider.transcribe(media, voiceTranscriptHint);

      if (messageId) {
        try {
          await execute(
            `INSERT INTO message_media 
             (message_id, media_type, provider_media_id, original_url, mime_type, file_name, file_size_bytes, duration_seconds, transcript)
             VALUES (?, 'AUDIO', ?, ?, ?, ?, ?, ?, ?)`,
            [
              messageId,
              media.providerMediaId || null,
              audioUrlOrId,
              media.mimeType,
              media.fileName,
              media.fileSizeBytes,
              result.durationSeconds,
              result.transcript,
            ]
          );
        } catch (err) {
          console.warn('[MediaService] Error persisting audio media record:', err);
        }
      }

      return result;
    } catch (err: any) {
      console.error('[MediaService] Audio processing error:', err.message || err);

      // Fail closed when in LIVE mode (G-062)
      if (config.media.mode === 'LIVE') {
        if (messageId) {
          try {
            await execute(
              `INSERT INTO message_media 
               (message_id, media_type, provider_media_id, original_url, mime_type, file_name, file_size_bytes, transcript)
               VALUES (?, 'AUDIO', ?, ?, 'FAILED', 'audio_failed', 0, NULL)`,
              [messageId, audioUrlOrId, audioUrlOrId]
            );
          } catch (dbErr) {
            console.warn('[MediaService] Error persisting audio failure record:', dbErr);
          }
        }
        throw new Error(`Audio processing failed in LIVE mode: ${err.message || err}`);
      }

      return {
        transcript: voiceTranscriptHint || 'Baddi 2 haleeb, cartonet bayd, w khobez',
        durationSeconds: 3.5,
        provider: 'FALLBACK_BOUNDARY',
        isMock: true,
      };
    }
  }

  /**
   * Process Image / Photo Message (G-031, G-054, G-062)
   * Downloads image, inspects via vision provider, matches catalog, persists to message_media
   */
  async processImageMessage(
    imageUrlOrBase64: string,
    messageId?: number,
    hintText?: string
  ): Promise<ImageAnalysisResult> {
    try {
      const media = await this.downloadMedia(imageUrlOrBase64, 'image');
      const result = await this.visionProvider.analyze(media, hintText);

      if (messageId) {
        try {
          await execute(
            `INSERT INTO message_media 
             (message_id, media_type, provider_media_id, original_url, mime_type, file_name, file_size_bytes, analysis_json)
             VALUES (?, 'IMAGE', ?, ?, ?, ?, ?, ?)`,
            [
              messageId,
              media.providerMediaId || null,
              imageUrlOrBase64.substring(0, 1000),
              media.mimeType,
              media.fileName,
              media.fileSizeBytes,
              JSON.stringify({
                labels: result.detectedLabels,
                matchedProduct: result.matchedProduct?.productName,
                candidates: (result.candidates || []).map((candidate: any) => candidate.productName),
                confidence: result.confidence,
                provider: result.provider,
                isMock: result.isMock,
              }),
            ]
          );
        } catch (err) {
          console.warn('[MediaService] Error persisting image media record:', err);
        }
      }

      return result;
    } catch (err: any) {
      console.error('[MediaService] Image processing error:', err.message || err);

      // Fail closed when in LIVE mode (G-062)
      if (config.media.mode === 'LIVE') {
        if (messageId) {
          try {
            await execute(
              `INSERT INTO message_media 
               (message_id, media_type, provider_media_id, original_url, mime_type, file_name, file_size_bytes, analysis_json)
               VALUES (?, 'IMAGE', ?, ?, 'FAILED', 'image_failed', 0, ?)`,
              [
                messageId,
                imageUrlOrBase64.substring(0, 100),
                imageUrlOrBase64.substring(0, 1000),
                JSON.stringify({ error: err.message || 'Image processing failed', isFailure: true }),
              ]
            );
          } catch (dbErr) {
            console.warn('[MediaService] Error persisting image failure record:', dbErr);
          }
        }
        throw new Error(`Image processing failed in LIVE mode: ${err.message || err}`);
      }

      return {
        detectedLabels: ['Meal Box', 'Fast Food'],
        matchedProduct: undefined,
        confidence: 0.85,
        description: 'Product recognized from customer photo',
        provider: 'FALLBACK_BOUNDARY',
        isMock: true,
      };
    }
  }
}

export const mediaService = new MediaService();
