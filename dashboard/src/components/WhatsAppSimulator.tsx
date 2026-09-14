import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, Image as ImageIcon, CheckCheck, Sparkles } from 'lucide-react';
import { api } from '../services/api';

interface ChatMessage {
  id: string;
  sender: 'customer' | 'ai';
  text: string;
  timestamp: string;
  mediaType?: 'text' | 'image' | 'audio';
  intent?: string;
}

interface WhatsAppSimulatorProps {
  onOrderCreated?: (order: any) => void;
}

export const WhatsAppSimulator: React.FC<WhatsAppSimulatorProps> = ({ onOrderCreated }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Marhaba! Welcome to **Lion Delivery**. 🦁\n\nHow can I help you today? You can search restaurants, compare supermarket baskets, modify meals, or send a voice note or photo in Lebanese Arabic, Arabizi, or English!',
      timestamp: '10:00 AM',
      intent: 'GREETING',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [phone] = useState('96170123456');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const sendMessage = async (textToSend: string, mediaType: 'text' | 'image' | 'audio' = 'text') => {
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'customer',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mediaType,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const response = await api.sendWhatsAppMessage(phone, textToSend, mediaType);
      
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: response.replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        intent: response.intent,
      };

      setMessages((prev) => [...prev, aiMsg]);

      if (response.orderCreated && onOrderCreated) {
        onOrderCreated(response.orderCreated);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'ai',
        text: `⚠️ Error processing request: ${err.message || 'Connection issue'}. Please try again.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  };

  // Demo script presets for presentation
  const demoPresets = [
    { label: '🍗 Budget Search', text: 'bade crispy chicken under 15$', media: 'text' as const },
    { label: '⭐ Best Rated?', text: 'which one is best rated?', media: 'text' as const },
    { label: '🥒 Select (No Pickles)', text: 'add the first one without pickles', media: 'text' as const },
    { label: '🥤 Add Coke Zero', text: 'add coke zero', media: 'text' as const },
    { label: '🔢 Make 2 Meals', text: 'actually make it 2 meals', media: 'text' as const },
    { label: '🏠 Deliver 3al Bet', text: '3al bet', media: 'text' as const },
    { label: '✅ Confirm Checkout', text: 'confirm', media: 'text' as const },
    { label: '🎙️ Voice Shopping List', text: 'bade 2 coke zero w lays w shufle arkhass mahal', media: 'audio' as const },
    { label: '📷 Photo Recognition', text: 'do they have this?', media: 'image' as const },
    { label: '🍰 Sweets (Arabizi)', text: 'bade shi 7elo bas ma ykoun ghale', media: 'text' as const },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '460px 1fr', gap: '24px', height: 'calc(100vh - 100px)', padding: '24px' }}>
      {/* WhatsApp Phone Mockup Frame */}
      <div style={{
        background: '#0B1014',
        borderRadius: '32px',
        border: '4px solid #1F2937',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 20px rgba(245, 158, 11, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
      }}>
        {/* WhatsApp Header */}
        <div style={{
          background: '#1F2C34',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #F59E0B, #B45309)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
          }}>
            🦁
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 700, fontSize: '15px', color: '#E9EDEF' }}>Lion Delivery</span>
              <span style={{ color: '#22C55E', fontSize: '13px' }}>✓</span>
            </div>
            <span style={{ fontSize: '12px', color: '#25D366' }}>Online (AI Operations Assistant)</span>
          </div>
          <div style={{
            fontSize: '11px',
            background: 'rgba(34, 197, 94, 0.15)',
            color: '#4ADE80',
            padding: '3px 8px',
            borderRadius: '12px',
            fontWeight: 600,
          }}>
            WhatsApp Business API
          </div>
        </div>

        {/* Chat Thread Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          background: '#0B141A',
          backgroundImage: 'radial-gradient(#17242C 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          {messages.map((msg) => {
            const isUser = msg.sender === 'customer';
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  maxWidth: '82%',
                  background: isUser ? '#005C4B' : '#202C33',
                  color: '#E9EDEF',
                  padding: '10px 14px',
                  borderRadius: isUser ? '12px 0px 12px 12px' : '0px 12px 12px 12px',
                  fontSize: '14px',
                  lineHeight: '1.45',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                  position: 'relative',
                }}>
                  {/* Media Badges */}
                  {msg.mediaType === 'audio' && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '4px 8px',
                      background: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      fontSize: '12px',
                      color: '#67E8F9',
                    }}>
                      <Mic size={14} />
                      <span>Voice Note Audio Ingested</span>
                    </div>
                  )}

                  {msg.mediaType === 'image' && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '4px 8px',
                      background: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      fontSize: '12px',
                      color: '#FBBF24',
                    }}>
                      <ImageIcon size={14} />
                      <span>Photo Attachment Sent</span>
                    </div>
                  )}

                  {/* Message text with basic markdown rendering */}
                  <div style={{ whiteSpace: 'pre-line' }}>
                    {msg.text.split('\n').map((line, idx) => {
                      const formatted = line
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em>$1</em>');
                      return <div key={idx} dangerouslySetInnerHTML={{ __html: formatted }} />;
                    })}
                  </div>

                  {/* Intent & Timestamp */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '4px',
                    marginTop: '6px',
                    fontSize: '11px',
                    color: '#8696A0',
                  }}>
                    {msg.intent && (
                      <span style={{
                        fontSize: '9px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        marginRight: 'auto',
                        color: '#CBD5E1',
                        fontFamily: 'monospace',
                      }}>
                        {msg.intent}
                      </span>
                    )}
                    <span>{msg.timestamp}</span>
                    {isUser && <CheckCheck size={14} color="#53BDEB" />}
                  </div>
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#202C33', borderRadius: '12px', width: 'fit-content' }}>
              <div className="pulse-dot" style={{ backgroundColor: '#25D366' }} />
              <span style={{ fontSize: '12px', color: '#8696A0' }}>Lion AI is searching & calculating...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div style={{
          background: '#202C33',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <input
            type="text"
            placeholder="Type WhatsApp message (Arabic, Arabizi, English)..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyPress}
            style={{
              flex: 1,
              background: '#2A3942',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#FFFFFF',
              fontSize: '14px',
              outline: 'none',
            }}
          />
          <button
            onClick={() => sendMessage(inputText)}
            style={{
              background: '#00A884',
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Presentation Control Panel & Live Script Guide */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
        {/* Pitch Callout */}
        <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid #F59E0B' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Sparkles size={20} color="#FBBF24" />
            <h2 style={{ fontSize: '18px', margin: 0 }}>The Core Pitch: WhatsApp As Complete Operating System</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5' }}>
            Zero app installation required for the customer. The customer talks to Lion Delivery as naturally as texting a friend. The AI understands Lebanese dialect, Arabizi, budget limits, multi-turn questions, corrections, and directly queries the real MySQL backend database.
          </p>
        </div>

        {/* One-Click Presets for Demo Presentation */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', color: '#FCD34D', marginBottom: '14px' }}>
            ⚡ 1-Click Interactive Demo Flow Presets
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Click buttons in sequence below to present the complete approved pitch flow to the client:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {demoPresets.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => sendMessage(preset.text, preset.media)}
                className="btn-secondary"
                style={{
                  justifyContent: 'flex-start',
                  fontSize: '13px',
                  padding: '10px 14px',
                  textAlign: 'left',
                }}
              >
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Live Conversation Architecture Card */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', color: '#38BDF8', marginBottom: '12px' }}>
            🛡️ Production Anti-Hallucination Guarantees
          </h3>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#10B981' }}>✓</span>
              <span><strong>Backend Source of Truth:</strong> Every price and item is queried live from MySQL. AI never invents numbers.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#10B981' }}>✓</span>
              <span><strong>Saved Address Resolution:</strong> "3al bet" dynamically looks up customer address `Al-Bahr Bldg, 3rd Floor`.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#10B981' }}>✓</span>
              <span><strong>Supermarket Basket Comparison:</strong> Voice list dynamically optimizes prices across local grocers.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
