import React, { useState } from 'react';
import { api } from '../services/api';
import { Bot, Send, Sparkles, HelpCircle } from 'lucide-react';

interface AIInteraction {
  question: string;
  answer: string;
  intent?: string;
  metrics?: any;
}

export const ManagementAiView: React.FC = () => {
  const [interactions, setInteractions] = useState<AIInteraction[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const askQuestion = async (q: string) => {
    if (!q.trim()) return;
    try {
      setLoading(true);
      setInputQuery('');
      const res = await api.askManagementAi(q);
      setInteractions((prev) => [
        ...prev,
        {
          question: q,
          answer: res.answer,
          intent: res.intent,
          metrics: res.metrics,
        },
      ]);
    } catch (e: any) {
      setInteractions((prev) => [
        ...prev,
        {
          question: q,
          answer: `Error querying management AI: ${e.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sampleQuestions = [
    'How many orders did we complete today?',
    'Which merchant rejected the most orders?',
    'Which driver completed the most deliveries?',
    'Which products were searched for that are unavailable?',
    "Give me today's business summary",
  ];

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 100px)', overflowY: 'auto' }}>
      {/* Header Banner */}
      <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid #A855F7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'rgba(168, 85, 247, 0.15)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Bot size={22} color="#C084FC" />
          </div>
          <div>
            <h2 style={{ fontSize: '18px', margin: 0, color: '#FFFFFF' }}>Management AI Intelligence Copilot</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              Ask executive questions in plain English. Queries live SQL telemetry across orders, rejections, couriers, and unmet customer demand.
            </p>
          </div>
        </div>

        <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#C084FC', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
          <Sparkles size={12} /> Executive Copilot
        </span>
      </div>

      {/* Suggested Quick Questions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {sampleQuestions.map((q, idx) => (
          <button
            key={idx}
            data-testid="management-ai-sample"
            onClick={() => askQuestion(q)}
            className="btn-secondary"
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            <HelpCircle size={13} color="#C084FC" />
            <span>"{q}"</span>
          </button>
        ))}
      </div>

      {/* Query History Log */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
        {interactions.map((item, idx) => (
          <div key={idx} className="glass-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>Q: "{item.question}"</span>
              {item.intent && (
                <span style={{ fontSize: '10px', fontFamily: 'monospace', background: 'rgba(255, 255, 255, 0.08)', padding: '2px 6px', borderRadius: '4px', color: '#9CA3AF' }}>
                  INTENT: {item.intent}
                </span>
              )}
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              color: '#E5E7EB',
              fontSize: '14px',
              lineHeight: '1.5',
            }}>
              {item.answer}
            </div>
          </div>
        ))}

        {loading && (
          <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="pulse-dot" style={{ backgroundColor: '#C084FC' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Analyzing operational data in MySQL...
            </span>
          </div>
        )}
      </div>

      {/* Input Box */}
      <div style={{
        position: 'sticky',
        bottom: 0,
        background: 'rgba(16, 21, 34, 0.95)',
        backdropFilter: 'blur(16px)',
        padding: '14px',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        gap: '10px',
      }}>
        <input
          data-testid="management-ai-input"
          type="text"
          placeholder="Ask executive question (e.g. 'Which merchant had highest sales?', 'Unavailable products?')..."
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && askQuestion(inputQuery)}
          style={{
            flex: 1,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '10px 14px',
            color: '#FFFFFF',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <button
          data-testid="management-ai-send"
          onClick={() => askQuestion(inputQuery)}
          disabled={loading || !inputQuery.trim()}
          className="btn-primary"
          style={{ background: 'linear-gradient(135deg, #C084FC, #9333EA)', color: '#FFFFFF' }}
        >
          <Send size={15} />
          <span>Ask Copilot</span>
        </button>
      </div>
    </div>
  );
};
