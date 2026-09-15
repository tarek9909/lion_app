import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, Send, UserRound, Image as ImageIcon, Mic } from 'lucide-react';
import { api, type WhatsAppConversationSummary, type WhatsAppMessage } from '../services/api';
import { wsClient } from '../services/websocket';

const formatDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No activity';

export const WhatsAppInbox: React.FC = () => {
  const [conversations, setConversations] = useState<WhatsAppConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async (keepSelection = true) => {
    try {
      const data = await api.getWhatsAppConversations();
      setConversations(data);
      setSelectedId((current) => keepSelection && current && data.some((item) => item.id === current) ? current : (data[0]?.id || null));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Unable to load WhatsApp conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: number) => {
    setLoadingMessages(true);
    try {
      setMessages(await api.getWhatsAppMessages(conversationId));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Unable to load conversation messages');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    loadConversations(false);
  }, [loadConversations]);

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
    else setMessages([]);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    const refresh = () => {
      loadConversations();
      if (selectedId) loadMessages(selectedId);
    };
    const unsubscribe = wsClient.subscribe((event) => {
      if (event.type === 'CONVERSATION_MESSAGE') refresh();
    });
    const unsubscribeReconnect = wsClient.onReconnect(refresh);
    return () => {
      unsubscribe();
      unsubscribeReconnect();
    };
  }, [loadConversations, loadMessages, selectedId]);

  const selected = conversations.find((conversation) => conversation.id === selectedId) || null;

  const sendReply = async () => {
    const text = input.trim();
    if (!text || !selectedId || sending) return;
    setSending(true);
    try {
      await api.sendWhatsAppReply(selectedId, text);
      setInput('');
      await loadMessages(selectedId);
      await loadConversations();
    } catch (err: any) {
      setError(err.message || 'WhatsApp reply failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-testid="whatsapp-inbox" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', height: '100%', minHeight: '600px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', margin: 0 }}>Live WhatsApp Inbox</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Real Meta WhatsApp Cloud API conversations, media events, AI replies, and operator replies.</p>
        </div>
        <button className="btn-secondary" onClick={() => loadConversations(false)} disabled={loading} data-testid="whatsapp-inbox-refresh">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="badge badge-rose" style={{ alignSelf: 'flex-start' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.8fr) minmax(420px, 1.7fr)', gap: '18px', flex: 1, minHeight: 0 }}>
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong>Conversations</strong>
            <span className="badge badge-cyan">{conversations.length} live</span>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? <div style={{ padding: '30px', color: 'var(--text-secondary)' }}>Loading inbox...</div> : conversations.length === 0 ? <div style={{ padding: '30px', color: 'var(--text-secondary)' }}>No WhatsApp conversations recorded yet.</div> : conversations.map((conversation) => (
              <button
                key={conversation.id}
                data-testid={`whatsapp-conversation-${conversation.id}`}
                onClick={() => setSelectedId(conversation.id)}
                style={{ width: '100%', textAlign: 'left', padding: '14px 16px', color: 'var(--text-primary)', background: selectedId === conversation.id ? '#fef3c7' : 'transparent', borderBottom: '1px solid var(--border-subtle)', borderLeft: selectedId === conversation.id ? '3px solid #d97706' : '3px solid transparent' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <strong>{conversation.display_name || 'WhatsApp customer'}</strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{formatDate(conversation.last_message_at)}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#0369a1', fontFamily: 'monospace', marginTop: '3px' }}>{conversation.whatsapp_number}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '7px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conversation.last_message || 'No message text'}</div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <span className="badge badge-gray">{conversation.message_count} messages</span>
                  <span className="badge badge-emerald">{conversation.ai_mode}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {selected ? <div><strong>{selected.display_name || 'WhatsApp customer'}</strong><div style={{ color: '#0369a1', fontFamily: 'monospace', fontSize: '12px' }}>{selected.whatsapp_number}</div></div> : <strong>Select a WhatsApp conversation</strong>}
            {selected && <span className="badge badge-emerald">{selected.status}</span>}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {!selected ? <div style={{ margin: 'auto', color: 'var(--text-secondary)', textAlign: 'center' }}><MessageSquare size={30} /><div>Choose a conversation to view messages.</div></div> : loadingMessages ? <div style={{ color: 'var(--text-secondary)' }}>Loading messages...</div> : messages.length === 0 ? <div style={{ color: 'var(--text-secondary)' }}>No messages in this conversation.</div> : messages.map((message) => {
              const inbound = message.direction === 'INBOUND';
              const media = message.message_type !== 'TEXT';
              return <div key={message.id} style={{ alignSelf: inbound ? 'flex-start' : 'flex-end', maxWidth: '78%' }}>
                <div style={{ padding: '10px 13px', borderRadius: inbound ? '4px 12px 12px 12px' : '12px 4px 12px 12px', background: inbound ? '#f1f5f9' : '#fef3c7', border: `1px solid ${inbound ? 'var(--border-subtle)' : '#fde68a'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: inbound ? '#0369a1' : '#b45309', marginBottom: '4px' }}>
                    {inbound ? <UserRound size={12} /> : <Send size={12} />} {inbound ? 'Customer' : 'Business'}
                    {media && (message.message_type === 'AUDIO' ? <Mic size={12} /> : <ImageIcon size={12} />)}
                    {media && message.message_type}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '13px', color: 'var(--text-primary)' }}>{message.text_body || `[${message.message_type.toLowerCase()} message]`}</div>
                  {message.media_transcript && <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '6px' }}>Transcript: {message.media_transcript}</div>}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px', textAlign: inbound ? 'left' : 'right' }}>{formatDate(message.created_at)} · {message.status}</div>
              </div>;
            })}
          </div>

          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '8px' }}>
            <input data-testid="whatsapp-reply-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') sendReply(); }} disabled={!selected || sending} placeholder={selected ? 'Reply through Meta WhatsApp...' : 'Select a conversation first'} style={{ flex: 1, background: '#ffffff', border: '1px solid var(--border-medium)', borderRadius: '7px', padding: '10px 12px', color: 'var(--text-primary)' }} />
            <button data-testid="whatsapp-reply-send" className="btn-primary" onClick={sendReply} disabled={!selected || !input.trim() || sending}><Send size={14} /> {sending ? 'Sending...' : 'Send'}</button>
          </div>
        </section>
      </div>
    </div>
  );
};
