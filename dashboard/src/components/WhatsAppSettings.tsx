import React, { useEffect, useState } from 'react';
import { KeyRound, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import type { WhatsAppCredentialStatus } from '../services/api';

const sourceLabel: Record<WhatsAppCredentialStatus['source'], string> = {
  dashboard: 'Dashboard token active',
  environment: 'Environment fallback active',
  none: 'No token configured',
};

export const WhatsAppSettings: React.FC = () => {
  const [accessToken, setAccessToken] = useState('');
  const [status, setStatus] = useState<WhatsAppCredentialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      setStatus(await api.getWhatsAppCredentialStatus());
    } catch (err: any) {
      setError(err.message || 'Could not load WhatsApp settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const saveToken = async () => {
    const token = accessToken.trim();
    if (!token) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      setStatus(await api.saveWhatsAppAccessToken(token));
      setAccessToken('');
      setMessage('New token saved and is now active for WhatsApp messages.');
    } catch (err: any) {
      setError(err.message || 'Could not save the WhatsApp access token.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '24px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '760px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid #16a34a', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <KeyRound size={21} color="#15803d" />
          </div>
          <div>
            <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)' }}>WhatsApp Cloud API Token</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Add or replace the token used to send live WhatsApp messages.
            </p>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Current credential</div>
              <div data-testid="whatsapp-settings-status" style={{ fontSize: '14px', fontWeight: 700, color: status?.configured ? '#15803d' : '#b45309' }}>
                {loading ? 'Checking configuration…' : sourceLabel[status?.source || 'none']}
              </div>
              {status?.updatedAt && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>Last changed {new Date(status.updatedAt).toLocaleString()}</div>}
            </div>
            <button onClick={() => void loadStatus()} disabled={loading || saving} className="btn-secondary" style={{ fontSize: '12px' }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', display: 'flex', gap: '9px', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.45 }}>
            <ShieldCheck size={18} color="#15803d" style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>Stored encrypted on the server. The token is never shown again; pasting and saving a new value securely replaces the current one immediately.</span>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            New Meta access token
            <input
              data-testid="whatsapp-settings-token-input"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder="Paste a new WhatsApp Cloud API access token"
              style={{ background: '#ffffff', border: '1px solid var(--border-medium)', borderRadius: '8px', padding: '11px 12px', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }}
            />
          </label>

          {error && <div role="alert" style={{ color: '#b91c1c', fontSize: '13px' }}>{error}</div>}
          {message && <div role="status" style={{ color: '#15803d', fontSize: '13px', fontWeight: 600 }}>{message}</div>}

          <div>
            <button data-testid="whatsapp-settings-save" onClick={() => void saveToken()} disabled={saving || !accessToken.trim()} className="btn-primary" style={{ background: '#15803d', color: '#ffffff' }}>
              <Save size={15} /> {saving ? 'Saving…' : status?.configured ? 'Replace token' : 'Save token'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
