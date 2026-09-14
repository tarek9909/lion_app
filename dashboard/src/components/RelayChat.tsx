import React, { useState, useEffect } from 'react';
import { api, type RelayMessage, type Order } from '../services/api';
import { wsClient } from '../services/websocket';
import { ShieldCheck, PhoneCall, Send, Lock, MessageSquare } from 'lucide-react';

export const RelayChat: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [messages, setMessages] = useState<RelayMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [customerInput, setCustomerInput] = useState('');
  const [driverInput, setDriverInput] = useState('');

  // Load active orders on mount
  useEffect(() => {
    let mounted = true;
    api.getOrders().then((ordList) => {
      if (!mounted) return;
      setOrders(ordList);
      if (ordList.length > 0) {
        setSelectedOrderId((prev) => prev || ordList[0].id);
      }
    }).catch(console.error);

    return () => {
      mounted = false;
    };
  }, []);

  // Fetch relay messages whenever selected order changes
  useEffect(() => {
    if (!selectedOrderId) return;
    let mounted = true;

    api.getRelayMessages(selectedOrderId)
      .then((msgs) => {
        if (!mounted) return;
        setMessages(msgs);
        setLoadingMessages(false);
      })
      .catch((err) => {
        console.error('Failed to load relay messages:', err);
        if (mounted) setLoadingMessages(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedOrderId]);

  // Subscribe to live WebSocket relay events
  useEffect(() => {
    const unsubscribe = wsClient.subscribe((event) => {
      const msg = event.payload || event.data;
      if (event.type === 'RELAY_MESSAGE' && msg) {
        if (Number(msg.orderId) === Number(selectedOrderId)) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id || (m.publicId && m.publicId === msg.publicId))) {
              return prev;
            }
            return [...prev, msg];
          });
        }
      }
    });

    const unsubReconnect = wsClient.onReconnect(() => {
      if (selectedOrderId) {
        api.getRelayMessages(selectedOrderId).then(setMessages).catch(console.error);
      }
    });

    return () => {
      unsubscribe();
      unsubReconnect();
    };
  }, [selectedOrderId]);

  const sendFromCustomer = async (text: string) => {
    if (!text.trim() || !selectedOrderId) return;
    try {
      const msg = await api.sendRelayMessage(selectedOrderId, 'CUSTOMER', text);
      setMessages((prev) => [...prev, msg]);
      setCustomerInput('');
    } catch (e) {
      console.error(e);
    }
  };

  const sendFromDriver = async (text: string) => {
    if (!text.trim() || !selectedOrderId) return;
    try {
      const msg = await api.sendRelayMessage(selectedOrderId, 'DRIVER', text);
      setMessages((prev) => [...prev, msg]);
      setDriverInput('');
    } catch (e) {
      console.error(e);
    }
  };

  const currentOrder = orders.find((o) => o.id === selectedOrderId);

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 100px)' }}>
      {/* Privacy Guarantee Header Banner */}
      <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid #10B981', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(16, 185, 129, 0.3)',
          }}>
            <ShieldCheck size={22} color="#34D399" />
          </div>
          <div>
            <h3 style={{ fontSize: '16px', margin: 0, color: '#FFFFFF' }}>
              Zero-Exposure Privacy & Identity Protection Relay
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              Neither customer nor driver ever sees the other's personal phone number. All messages pass through the masked relay bridge.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Active Order Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Relay Channel:</span>
            <select
              data-testid="relay-order-select"
              value={selectedOrderId || ''}
              onChange={(e) => setSelectedOrderId(Number(e.target.value))}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#FFFFFF',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '12px',
                outline: 'none',
              }}
            >
              {orders.map((o) => (
                <option key={o.id} value={o.id} style={{ background: '#111827', color: '#FFFFFF' }}>
                  #{o.order_number} ({o.customer_name} • {o.merchant_name})
                </option>
              ))}
            </select>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#38BDF8',
          }}>
            <PhoneCall size={14} />
            <span>Masked VoIP Ready</span>
          </div>
          <span className="badge badge-emerald">
            <Lock size={12} /> Active Relay
          </span>
        </div>
      </div>

      {/* 2-Column Split: Customer Terminal vs Driver Terminal */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', flex: 1, minHeight: 0 }}>
        {/* Customer Side Terminal */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            padding: '14px 18px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontWeight: 700 }}>
                C
              </div>
              <div>
                <strong style={{ fontSize: '14px', color: '#FFFFFF' }}>Customer View ({currentOrder?.customer_name || 'Customer'})</strong>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  Phone Protected: <span style={{ color: '#34D399' }}>+961 70 ••• •••</span>
                </div>
              </div>
            </div>
            <span style={{ fontSize: '12px', color: '#38BDF8', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
              Talking to: {currentOrder?.driver_name ? `Driver ${currentOrder.driver_code}` : 'Driver D-101'}
            </span>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {loadingMessages ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Loading encrypted relay conversation...
              </div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                <MessageSquare size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                No messages yet in this delivery relay. Send a masked message below!
              </div>
            ) : (
              messages.map((m, idx) => {
                const isMine = m.senderRole === 'CUSTOMER';
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isMine ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div style={{
                      maxWidth: '85%',
                      background: isMine ? '#0284C7' : 'rgba(255, 255, 255, 0.08)',
                      color: '#FFFFFF',
                      padding: '10px 14px',
                      borderRadius: isMine ? '12px 0 12px 12px' : '0 12px 12px 12px',
                      fontSize: '13px',
                    }}>
                      {m.text}
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                      {m.senderDisplay} • {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick instructions & Input */}
          <div style={{ padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => sendFromCustomer('Bala ma tdo2 el jaras 3afak el baby nayem')}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                👶 "Baby sleeping, don't ring bell"
              </button>
              <button
                onClick={() => sendFromCustomer('Khalli el talab 3al bab 3afak')}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                🚪 "Leave package at door"
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                data-testid="relay-customer-input"
                type="text"
                placeholder="Send masked message to driver..."
                value={customerInput}
                onChange={(e) => setCustomerInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendFromCustomer(customerInput)}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#FFFFFF',
                  fontSize: '13px',
                }}
              />
              <button data-testid="relay-customer-send" onClick={() => sendFromCustomer(customerInput)} className="btn-primary" style={{ padding: '8px 14px' }}>
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Driver Side Terminal */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            padding: '14px 18px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0B0F19', fontWeight: 700 }}>
                D
              </div>
              <div>
                <strong style={{ fontSize: '14px', color: '#FFFFFF' }}>Driver View ({currentOrder?.driver_name || 'Captain Ahmad Saleh'})</strong>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  Driver Phone Protected: <span style={{ color: '#FBBF24' }}>+961 76 ••• •••</span>
                </div>
              </div>
            </div>
            <span style={{ fontSize: '12px', color: '#34D399', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
              Order #{currentOrder?.order_number || 'ORD-DEMO'}
            </span>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {loadingMessages ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Loading encrypted relay conversation...
              </div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                <MessageSquare size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                No messages yet in this delivery relay.
              </div>
            ) : (
              messages.map((m, idx) => {
                const isMine = m.senderRole === 'DRIVER';
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isMine ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div style={{
                      maxWidth: '85%',
                      background: isMine ? '#D97706' : 'rgba(255, 255, 255, 0.08)',
                      color: '#FFFFFF',
                      padding: '10px 14px',
                      borderRadius: isMine ? '12px 0 12px 12px' : '0 12px 12px 12px',
                      fontSize: '13px',
                    }}>
                      {m.text}
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                      {m.senderDisplay} • {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick instructions & Input */}
          <div style={{ padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => sendFromDriver('Khaye akid, ha 7etta 3al beb w de2lekk')}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                👍 "Sure, leaving at door & buzzing"
              </button>
              <button
                onClick={() => sendFromDriver('Wsolt 3al bineye ana ta7et')}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                📍 "I have arrived downstairs"
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                data-testid="relay-driver-input"
                type="text"
                placeholder="Send masked reply to customer..."
                value={driverInput}
                onChange={(e) => setDriverInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendFromDriver(driverInput)}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#FFFFFF',
                  fontSize: '13px',
                }}
              />
              <button data-testid="relay-driver-send" onClick={() => sendFromDriver(driverInput)} className="btn-primary" style={{ padding: '8px 14px' }}>
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
