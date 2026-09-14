import React, { useState, useEffect } from 'react';
import { api, type AnalyticsData } from '../services/api';
import { wsClient } from '../services/websocket';
import { DollarSign, ShoppingBag, Clock, Percent, Users, Store, Bike } from 'lucide-react';

export const AnalyticsView: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.getAnalytics()
      .then((res) => {
        if (mounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error('Failed to fetch analytics', e);
        if (mounted) setLoading(false);
      });

    const unsubscribe = wsClient.subscribe((event) => {
      if (['ORDER_CREATED', 'ORDER_UPDATED'].includes(event.type)) {
        api.getAnalytics().then((res) => {
          if (mounted) setData(res);
        });
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (loading && !data) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Calculating live business metrics from MySQL...
      </div>
    );
  }

  const kpis = [
    {
      title: 'Gross Revenue Today',
      value: `$${data?.totalRevenue.toFixed(2) || '0.00'}`,
      subtitle: `AOV: $${data?.averageOrderValue.toFixed(2) || '0.00'}`,
      icon: DollarSign,
      color: '#F59E0B',
    },
    {
      title: 'Delivered Orders',
      value: `${data?.completedOrders || 0}`,
      subtitle: `${data?.activeOrders || 0} active in transit`,
      icon: ShoppingBag,
      color: '#10B981',
    },
    {
      title: 'WhatsApp Conversion',
      value: `${data?.conversionRatePercent || 0}%`,
      subtitle: `From ${data?.whatsappConversations || 0} customer chats`,
      icon: Percent,
      color: '#06B6D4',
    },
    {
      title: 'Avg Delivery Time',
      value: data?.averageDeliveryMinutes != null ? `${data.averageDeliveryMinutes} min` : 'Pending',
      subtitle: data?.averageDeliveryMinutes != null ? 'Target: < 30 mins' : 'Awaiting completed orders',
      icon: Clock,
      color: '#A855F7',
    },
  ];

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', height: 'calc(100vh - 100px)', overflowY: 'auto' }}>
      <div>
        <h2 style={{ fontSize: '20px', margin: 0 }}>Executive Real-Time Analytics</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
          Real-time transactional metrics computed directly from active MySQL tables.
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div key={idx} className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>{kpi.title}</span>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: `${kpi.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon size={18} color={kpi.color} />
                </div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', marginBottom: '4px' }}>
                {kpi.value}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                {kpi.subtitle}
              </div>
            </div>
          );
        })}
      </div>

      {/* Network Health & Recent Transactions */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px' }}>
        {/* Network Status */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '15px', color: '#FFFFFF', margin: 0 }}>Operational Network Health</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Store size={16} color="#FBBF24" />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Active Merchants</span>
              </div>
              <strong style={{ color: '#FFFFFF' }}>{data?.activeMerchants ?? 0} partners</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Store size={16} color="#F59E0B" />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Operating Branches</span>
              </div>
              <strong style={{ color: '#FFFFFF' }}>{data?.activeBranches ?? 0} branches</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bike size={16} color="#34D399" />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Active Couriers</span>
              </div>
              <strong style={{ color: '#FFFFFF' }}>{data?.activeDrivers ?? 0} online</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} color="#38BDF8" />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Conversations Engaged</span>
              </div>
              <strong style={{ color: '#FFFFFF' }}>{data?.whatsappConversations ?? 0} chats</strong>
            </div>
          </div>
        </div>

        {/* Recent Transaction Log */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ fontSize: '15px', color: '#FFFFFF', margin: 0 }}>Recent Delivered Orders</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data?.recentOrders && data.recentOrders.length > 0 ? (
              data.recentOrders.map((ord: any, idx: number) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#FCD34D' }}>
                      #{ord.order_number}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{ord.merchant_name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontWeight: 700, color: '#FFFFFF' }}>${parseFloat(ord.grand_total).toFixed(2)}</span>
                    <span className="badge badge-emerald">Delivered</span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No completed orders yet today.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
