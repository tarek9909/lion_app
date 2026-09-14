import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { WhatsAppSimulator } from './components/WhatsAppSimulator';
import { LiveOrders } from './components/LiveOrders';
import { RelayChat } from './components/RelayChat';
import { CatalogView } from './components/CatalogView';
import { DriversView } from './components/DriversView';
import { AnalyticsView } from './components/AnalyticsView';
import { ManagementAiView } from './components/ManagementAiView';
import { wsClient } from './services/websocket';
import { api } from './services/api';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('simulator');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  useEffect(() => {
    // Authenticate operator session (G-051)
    api.login().catch(console.error);

    wsClient.connect();
    const unsub = wsClient.onConnectionChange(setIsConnected);

    const unsubEvents = wsClient.subscribe((event) => {
      if (event.type === 'ORDER_CREATED') {
        showToast(`🎉 New Order Created: #${event.payload.order_number}!`);
      } else if (event.type === 'NO_DRIVERS_AVAILABLE') {
        showToast(`⚠️ No drivers available for #${event.payload.orderNumber || event.payload.orderId}. ETA extension notice sent to customer.`);
      }
    });

    return () => {
      unsub();
      unsubEvents();
    };
  }, []);

  const handleResetDemo = async () => {
    try {
      const start = Date.now();
      await api.resetDemo();
      const elapsed = Date.now() - start;
      showToast(`⚡ Pristine demo baseline restored in ${elapsed}ms!`);
    } catch (e: any) {
      showToast(`Failed to reset demo: ${e.message}`);
    }
  };

  const handleOrderCreated = (order: any) => {
    showToast(`🎉 Order #${order.order_number} confirmed! Check Live Orders.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isConnected={isConnected}
        onResetDemo={handleResetDemo}
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '70px',
          right: '24px',
          zIndex: 100,
          background: 'rgba(16, 21, 34, 0.95)',
          border: '1px solid #F59E0B',
          boxShadow: '0 10px 25px rgba(245, 158, 11, 0.25)',
          borderRadius: '10px',
          padding: '12px 20px',
          color: '#FFFFFF',
          fontSize: '14px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'slideUp 0.25s ease-out',
        }}>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Tab Content */}
      <main style={{ flex: 1 }}>
        {activeTab === 'simulator' && <WhatsAppSimulator onOrderCreated={handleOrderCreated} />}
        {activeTab === 'orders' && <LiveOrders />}
        {activeTab === 'relay' && <RelayChat />}
        {activeTab === 'catalog' && <CatalogView />}
        {activeTab === 'drivers' && <DriversView />}
        {activeTab === 'analytics' && <AnalyticsView />}
        {activeTab === 'management' && <ManagementAiView />}
      </main>
    </div>
  );
};

export default App;
