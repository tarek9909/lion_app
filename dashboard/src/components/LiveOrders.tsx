import React, { useState, useEffect } from 'react';
import { api, type Order } from '../services/api';
import { wsClient } from '../services/websocket';
import { CheckCircle2, User, MapPin, Store, Bike } from 'lucide-react';

export const LiveOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const formatLbp = (order: Order) => `${Math.round(order.grand_total_lbp ?? order.grand_total * (order.lbp_exchange_rate || 89500)).toLocaleString('en-US')} LBP`;

  useEffect(() => {
    let mounted = true;

    const loadOrders = () => {
      api.getOrders()
        .then((data) => {
          if (!mounted) return;
          setOrders(data);
          setLoading(false);
          setSelectedOrder((curr) => {
            if (!curr && data.length > 0) return data[0];
            return curr;
          });
        })
        .catch((e) => {
          console.error('Failed to fetch orders', e);
          if (mounted) setLoading(false);
        });
    };

    loadOrders();

    const unsubscribe = wsClient.subscribe((event) => {
      if (event.type === 'ORDER_CREATED' && event.payload) {
        setOrders((prev) => [event.payload, ...prev.filter((o) => o.id !== event.payload.id)]);
      } else if (event.type === 'ORDER_UPDATED' && event.payload) {
        setOrders((prev) => prev.map((o) => (o.id === event.payload.id ? event.payload : o)));
        setSelectedOrder((curr) => (curr?.id === event.payload.id ? event.payload : curr));
      }
    });

    const unsubReconnect = wsClient.onReconnect(() => {
      loadOrders();
    });

    // Fallback polling every 8s for maximum robustness
    const pollInterval = setInterval(() => {
      loadOrders();
    }, 8000);

    return () => {
      mounted = false;
      unsubscribe();
      unsubReconnect();
      clearInterval(pollInterval);
    };
  }, []);

  const handleMerchantAccept = async (orderId: number) => {
    try {
      setActionLoading(orderId);
      const updated = await api.merchantAcceptOrder(orderId, 20);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) setSelectedOrder(updated);
    } finally {
      setActionLoading(null);
    }
  };

  const handleMerchantReject = async (orderId: number) => {
    try {
      setActionLoading(orderId);
      const updated = await api.merchantRejectOrder(orderId, 'Kitchen at peak capacity');
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) setSelectedOrder(updated);
    } finally {
      setActionLoading(null);
    }
  };

  const handleMerchantReady = async (orderId: number) => {
    try {
      setActionLoading(orderId);
      const updated = await api.merchantReadyOrder(orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) setSelectedOrder(updated);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDriverAccept = async (orderId: number) => {
    try {
      setActionLoading(orderId);
      const updated = await api.driverAcceptOrder(orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) setSelectedOrder(updated);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDriverReject = async (orderId: number) => {
    try {
      setActionLoading(orderId);
      const updated = await api.driverRejectOrder(orderId, undefined, 'Captain unavailable / reassigning');
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) setSelectedOrder(updated);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDriverPickup = async (orderId: number) => {
    try {
      setActionLoading(orderId);
      const updated = await api.driverPickupOrder(orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) setSelectedOrder(updated);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDriverDeliver = async (orderId: number) => {
    try {
      setActionLoading(orderId);
      const updated = await api.driverDeliverOrder(orderId, 5, 'Delivered promptly, customer happy!');
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) setSelectedOrder(updated);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'CONFIRMED': return 'badge-gold';
      case 'PREPARING': return 'badge-cyan';
      case 'WAITING_FOR_DRIVER': return 'badge-gold';
      case 'DRIVER_ASSIGNED': return 'badge-cyan';
      case 'PICKED_UP': return 'badge-cyan';
      case 'DELIVERED': return 'badge-emerald';
      case 'MERCHANT_REJECTED': return 'badge-rose';
      default: return 'badge-gray';
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ACTIVE') return !['DELIVERED', 'CANCELLED', 'MERCHANT_REJECTED'].includes(o.status);
    if (statusFilter === 'DELIVERED') return o.status === 'DELIVERED';
    return o.status === statusFilter;
  });

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 100px)' }}>
      {/* Top Filter Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '20px', margin: 0 }}>Live Fulfillment & Dispatch Operations</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Orders automatically flow from customer WhatsApp conversations into merchant and driver queues.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {['ALL', 'ACTIVE', 'CONFIRMED', 'PREPARING', 'DELIVERED'].map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={statusFilter === filter ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: '12px', padding: '6px 14px' }}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Orders List & Detail Drawer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 480px', gap: '24px', flex: 1, minHeight: 0 }}>
        {/* Orders List */}
        <div className="glass-panel" style={{ overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              Loading real-time orders from MySQL...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              No orders found for this filter.
            </div>
          ) : (
            filteredOrders.map((order) => {
              const isSelected = selectedOrder?.id === order.id;
              return (
                <div
                  key={order.id}
                  data-testid={`order-card-${order.id}`}
                  onClick={() => setSelectedOrder(order)}
                  style={{
                    padding: '16px',
                    borderRadius: '10px',
                    background: isSelected ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${isSelected ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255, 255, 255, 0.06)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '15px', color: '#FCD34D' }}>
                        #{order.order_number}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginLeft: '8px' }}>
                        {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className={`badge ${getStatusBadgeClass(order.status)}`}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Store size={14} color="#FBBF24" />
                      <span style={{ fontWeight: 600, color: '#E5E7EB' }}>{order.merchant_name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <User size={14} color="#38BDF8" />
                      <span>{order.customer_name}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                      Deliver to: <strong style={{ color: '#E5E7EB' }}>{order.address_label || 'Home'}</strong>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '16px', color: '#FCD34D' }}>
                      ${order.grand_total.toFixed(2)}
                      <div style={{ fontSize: '11px', fontWeight: 500, color: '#FDE68A' }}>≈ {formatLbp(order)}</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Order Detail Drawer / Action Card */}
        {selectedOrder ? (
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '18px', color: '#FCD34D', margin: 0 }}>
                  Order #{selectedOrder.order_number}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  Placed via WhatsApp • {new Date(selectedOrder.created_at).toLocaleString()}
                </span>
              </div>
              <span className={`badge ${getStatusBadgeClass(selectedOrder.status)}`}>
                {selectedOrder.status.replace(/_/g, ' ')}
              </span>
            </div>

            {/* Merchant & Customer Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <Store size={15} color="#FBBF24" />
                <span style={{ color: 'var(--text-secondary)' }}>Merchant:</span>
                <strong style={{ color: '#FFFFFF' }}>{selectedOrder.merchant_name}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <User size={15} color="#38BDF8" />
                <span style={{ color: 'var(--text-secondary)' }}>Customer:</span>
                <strong style={{ color: '#FFFFFF' }}>{selectedOrder.customer_name}</strong>
                <span style={{ fontSize: '11px', color: '#9CA3AF' }}>({selectedOrder.customer_phone})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <MapPin size={15} color="#F43F5E" />
                <span style={{ color: 'var(--text-secondary)' }}>Address:</span>
                <strong style={{ color: '#FFFFFF' }}>{selectedOrder.address_label}</strong>
                <span style={{ fontSize: '11px', color: '#9CA3AF' }}>— {selectedOrder.formatted_address}</span>
              </div>
              {selectedOrder.delivery_notes && (
                <div style={{ padding: '8px 10px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '6px', fontSize: '12px', color: '#FCD34D' }}>
                  <strong>Address Note:</strong> {selectedOrder.delivery_notes}
                </div>
              )}
            </div>

            {/* Items Breakdown */}
            <div>
              <h4 style={{ fontSize: '14px', color: '#E5E7EB', marginBottom: '10px' }}>Ordered Items</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                  selectedOrder.items.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <div>
                        <span>{item.quantity}x <strong>{item.product_name_snapshot}</strong></span>
                        {item.customer_notes && (
                          <div style={{ fontSize: '11px', color: '#38BDF8', marginLeft: '18px' }}>
                            ↳ Note: {item.customer_notes}
                          </div>
                        )}
                      </div>
                      <span style={{ fontWeight: 600, color: '#FCD34D' }}>
                        ${parseFloat(String(item.line_total)).toFixed(2)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Standard item bundle
                  </div>
                )}
              </div>

              {/* Financial Totals */}
              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Subtotal:</span>
                  <span>${selectedOrder.subtotal?.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Delivery Fee:</span>
                  <span>${selectedOrder.delivery_fee?.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700, color: '#FCD34D', marginTop: '6px' }}>
                  <span>Grand Total (Cash):</span>
                  <span style={{ textAlign: 'right' }}>
                    ${selectedOrder.grand_total?.toFixed(2)}
                    <div style={{ fontSize: '11px', fontWeight: 500, color: '#FDE68A' }}>≈ {formatLbp(selectedOrder)}</div>
                  </span>
                </div>
              </div>
            </div>

            {/* Operator Actions Bar (Merchant / Driver Workflows) */}
            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <h4 style={{ fontSize: '13px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
                Live Workflow Simulation · Operator Master Console
              </h4>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {selectedOrder.status === 'CONFIRMED' && (
                  <>
                    <button
                      data-testid="btn-merchant-accept"
                      onClick={() => handleMerchantAccept(selectedOrder.id)}
                      disabled={actionLoading === selectedOrder.id}
                      className="btn-primary"
                      style={{ flex: 1 }}
                    >
                      <CheckCircle2 size={16} />
                      <span>Restaurant Tablet · Accept (20m)</span>
                    </button>
                    <button
                      data-testid="btn-merchant-reject"
                      onClick={() => handleMerchantReject(selectedOrder.id)}
                      disabled={actionLoading === selectedOrder.id}
                      className="btn-secondary"
                      style={{ flex: 1, borderColor: '#F43F5E', color: '#FDA4AF' }}
                    >
                      <span>Restaurant Tablet · Reject (Kitchen Peak)</span>
                    </button>
                  </>
                )}

                {selectedOrder.status === 'PREPARING' && (
                  <>
                    <button
                      data-testid="btn-merchant-ready"
                      onClick={() => handleMerchantReady(selectedOrder.id)}
                      disabled={actionLoading === selectedOrder.id}
                      className="btn-primary"
                      style={{ flex: 1, background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)' }}
                    >
                      <span>Restaurant Tablet · Mark Ready</span>
                    </button>
                    <button
                      data-testid="btn-driver-accept"
                      onClick={() => handleDriverAccept(selectedOrder.id)}
                      disabled={actionLoading === selectedOrder.id}
                      className="btn-secondary"
                      style={{ flex: 1, borderColor: '#06B6D4', color: '#67E8F9' }}
                    >
                      <Bike size={16} />
                      <span>Driver App · Accept Offer</span>
                    </button>
                  </>
                )}

                {selectedOrder.status === 'WAITING_FOR_DRIVER' && (
                  <button
                    data-testid="btn-driver-accept"
                    onClick={() => handleDriverAccept(selectedOrder.id)}
                    disabled={actionLoading === selectedOrder.id}
                    className="btn-secondary"
                    style={{ flex: 1, borderColor: '#06B6D4', color: '#67E8F9' }}
                  >
                    <Bike size={16} />
                    <span>Driver App · Accept Offer</span>
                  </button>
                )}

                {(selectedOrder.status === 'DRIVER_ASSIGNED' || selectedOrder.status === 'READY_FOR_PICKUP') && (
                  <>
                    <button
                      data-testid="btn-driver-pickup"
                      onClick={() => handleDriverPickup(selectedOrder.id)}
                      disabled={actionLoading === selectedOrder.id}
                      className="btn-secondary"
                      style={{ flex: 1, borderColor: '#F59E0B', color: '#FBBF24' }}
                    >
                      <Store size={16} />
                      <span>Driver App · Pick Up</span>
                    </button>
                    <button
                      data-testid="btn-driver-reject"
                      onClick={() => handleDriverReject(selectedOrder.id)}
                      disabled={actionLoading === selectedOrder.id}
                      className="btn-secondary"
                      style={{ borderColor: '#F43F5E', color: '#FDA4AF', fontSize: '11px', padding: '6px 10px' }}
                    >
                      <span>Driver App · Reject / Reassign</span>
                    </button>
                  </>
                )}

                {(selectedOrder.status === 'PICKED_UP' || selectedOrder.status === 'OUT_FOR_DELIVERY') && (
                  <button
                    data-testid="btn-driver-deliver"
                    onClick={() => handleDriverDeliver(selectedOrder.id)}
                    disabled={actionLoading === selectedOrder.id}
                    className="btn-primary"
                    style={{ flex: 1, background: 'linear-gradient(135deg, #10B981, #059669)', color: '#FFFFFF' }}
                  >
                    <CheckCircle2 size={16} />
                    <span>Driver App · Deliver & Rate</span>
                  </button>
                )}

                {selectedOrder.status === 'DELIVERED' && (
                  <div style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34D399',
                    fontSize: '13px',
                    textAlign: 'center',
                    fontWeight: 600,
                  }}>
                    ✓ Order Delivered & Paid (Cash on Delivery)
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            Select an order on the left to view fulfillment details.
          </div>
        )}
      </div>
    </div>
  );
};
