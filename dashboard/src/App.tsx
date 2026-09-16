import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { LiveOrders } from './components/LiveOrders';
import { RelayChat } from './components/RelayChat';
import { CatalogView } from './components/CatalogView';
import { DriversView } from './components/DriversView';
import { AnalyticsView } from './components/AnalyticsView';
import { ManagementAiView } from './components/ManagementAiView';
import { WhatsAppInbox } from './components/WhatsAppInbox';
import { PeopleView } from './components/PeopleView';
import { AILearningWorkbench } from './components/AILearningWorkbench';
import { WhatsAppSettings } from './components/WhatsAppSettings';
import { wsClient } from './services/websocket';
import { api } from './services/api';
import { Menu } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('orders');
  const [isConnected, setIsConnected] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    api.login().catch(console.error);

    wsClient.connect();
    const unsubscribeConnection = wsClient.onConnectionChange(setIsConnected);
    const unsubscribeEvents = wsClient.subscribe((event) => {
      if (event.type === 'ORDER_CREATED') {
        showToast(`New order created: #${event.payload.order_number}. Check Live Orders.`);
      } else if (event.type === 'NO_DRIVERS_AVAILABLE') {
        showToast(`No drivers available for ${event.payload.orderNumber || event.payload.orderId}. ETA extension notice sent to customer.`);
      }
    });

    return () => {
      unsubscribeConnection();
      unsubscribeEvents();
    };
  }, []);

  const handleResetDemo = async () => {
    try {
      const start = Date.now();
      await api.resetDemo();
      showToast(`Pristine demo baseline restored in ${Date.now() - start}ms.`);
    } catch (error: any) {
      showToast(`Failed to reset demo: ${error.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isConnected={isConnected}
        onResetDemo={handleResetDemo}
        isOpenMobile={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, minWidth: 0, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Mobile Header (Hidden on Desktop) */}
        <div
          className="mobile-header-bar"
          style={{
            display: 'none',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: '#ffffff',
            borderBottom: '1px solid var(--border-subtle)',
            zIndex: 40,
          }}
        >
          <button
            onClick={() => setMobileNavOpen(true)}
            style={{
              padding: '6px',
              borderRadius: '8px',
              background: '#f1f5f9',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Open Navigation"
          >
            <Menu size={20} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              LION DELIVERY
            </span>
            <span
              style={{
                background: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fde68a',
                borderRadius: '4px',
                padding: '1px 5px',
                fontSize: '9px',
                fontWeight: 700,
              }}
            >
              DEMO V1.0
            </span>
          </div>
          <div style={{ width: '32px' }} />
        </div>

        {/* Toast Feedback */}
        {toastMessage && (
          <div
            style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              zIndex: 1000,
              background: '#ffffff',
              border: '1px solid #d97706',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
              borderRadius: '10px',
              padding: '12px 20px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              animation: 'slideUp 0.25s ease-out',
            }}
          >
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Active Tab Viewport */}
        <main style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {activeTab === 'orders' && <LiveOrders />}
          {activeTab === 'relay' && <RelayChat />}
          {activeTab === 'catalog' && <CatalogView />}
          {activeTab === 'drivers' && <DriversView />}
          {activeTab === 'inbox' && <WhatsAppInbox />}
          {activeTab === 'contacts' && <PeopleView />}
          {activeTab === 'analytics' && <AnalyticsView />}
          {activeTab === 'management' && <ManagementAiView />}
          {activeTab === 'ai-learning' && <AILearningWorkbench />}
          {activeTab === 'whatsapp-settings' && <WhatsAppSettings />}
        </main>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .mobile-header-bar {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
};

export default App;
