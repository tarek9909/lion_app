import crypto from 'crypto';
import { config } from '../../config/env.js';
import { execute, query } from '../../database/db.js';

const ACCESS_TOKEN_SETTING_KEY = 'whatsapp.meta.access_token.v1';
const ENCRYPTION_KEY = crypto.createHash('sha256')
  .update(`lion:whatsapp-dashboard-token:${config.jwtSecret}`)
  .digest();

function encrypt(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decrypt(value: string): string | null {
  try {
    const [version, ivValue, tagValue, ciphertext] = value.split('.');
    if (version !== 'v1' || !ivValue || !tagValue || !ciphertext) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Server-only Meta credential store. The dashboard can set a replacement
 * access token, but can never retrieve it after submission.
 */
export class WhatsAppCredentialService {
  private loaded = false;
  private dashboardToken: string | null = null;
  private updatedAt: string | null = null;

  private async load(): Promise<void> {
    if (this.loaded) return;
    const rows = await query<any[]>(
      `SELECT setting_value, updated_at FROM system_settings WHERE setting_key = ? AND is_secret = 1 LIMIT 1`,
      [ACCESS_TOKEN_SETTING_KEY],
    );
    if (rows.length > 0) {
      try {
        const stored = typeof rows[0].setting_value === 'string'
          ? JSON.parse(rows[0].setting_value)
          : rows[0].setting_value;
        this.dashboardToken = stored?.encrypted ? decrypt(String(stored.encrypted)) : null;
      } catch {
        this.dashboardToken = null;
      }
      this.updatedAt = rows[0].updated_at ? new Date(rows[0].updated_at).toISOString() : null;
    }
    this.loaded = true;
  }

  async warm(): Promise<void> {
    await this.load();
  }

  async getAccessToken(): Promise<string> {
    await this.load();
    return this.dashboardToken || config.whatsapp.accessToken;
  }

  async getStatus(): Promise<{ configured: boolean; source: 'dashboard' | 'environment' | 'none'; updatedAt: string | null }> {
    await this.load();
    if (this.dashboardToken) return { configured: true, source: 'dashboard', updatedAt: this.updatedAt };
    if (config.whatsapp.accessToken && !config.whatsapp.accessToken.startsWith('demo_')) {
      return { configured: true, source: 'environment', updatedAt: null };
    }
    return { configured: false, source: 'none', updatedAt: null };
  }

  async saveAccessToken(accessToken: string, updatedBy: number): Promise<void> {
    const normalized = accessToken.trim();
    if (!normalized) throw new Error('WhatsApp access token is required.');
    const encrypted = encrypt(normalized);
    await execute(
      `INSERT INTO system_settings (setting_key, setting_value, setting_group, is_secret, description, updated_by)
       VALUES (?, ?, 'INTEGRATIONS', 1, 'Encrypted Meta WhatsApp Cloud API access token managed by a superadmin.', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), is_secret = 1, updated_by = VALUES(updated_by), description = VALUES(description), updated_at = CURRENT_TIMESTAMP(3)`,
      [ACCESS_TOKEN_SETTING_KEY, JSON.stringify({ encrypted }), updatedBy],
    );
    this.dashboardToken = normalized;
    this.updatedAt = new Date().toISOString();
    this.loaded = true;
  }
}

export const whatsappCredentialService = new WhatsAppCredentialService();
