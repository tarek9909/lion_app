import React, { useState } from 'react';
import { RefreshCw, MessageSquare, LayoutDashboard, ShieldCheck, Store, Bike, BarChart3, Bot, WifiOff } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isConnected: boolean;
  onResetDemo: () => Promise<void>;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isConnected,
  onResetDemo,
}) => {
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    try {
      setResetting(true);
      await onResetDemo();
    } finally {
      setResetting(false);
    }
  };

  const navItems = [
    { id: 'simulator', label: 'WhatsApp AI', icon: MessageSquare, badge: 'Main Pitch' },
    { id: 'orders', label: 'Live Orders', icon: LayoutDashboard },
    { id: 'relay', label: 'Masked Relay', icon: ShieldCheck, badge: 'Privacy' },
    { id: 'catalog', label: 'Merchants & Menu', icon: Store },
    { id: 'drivers', label: 'Fleet & Drivers', icon: Bike },
    { id: 'analytics', label: 'Live Analytics', icon: BarChart3 },
    { id: 'management', label: 'Management AI', icon: Bot, badge: 'Executive' },
  ];

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 24px',
      background: 'rgba(16, 21, 34, 0.92)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border-subtle)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #F59E0B, #B45309)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '22px',
          boxShadow: '0 0 16px rgba(245, 158, 11, 0.3)',
        }}>
          🦁
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: '#FFFFFF' }}>
              LION DELIVERY
            </h1>
            <span style={{
              background: 'rgba(245, 158, 11, 0.2)',
              color: '#FBBF24',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '4px',
              padding: '1px 6px',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}>
              DEMO V1.0
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
            Autonomous WhatsApp Operations & Fulfillment
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              data-tab={item.id}
              data-testid={`tab-${item.id}`}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                background: isActive ? 'rgba(245, 158, 11, 0.16)' : 'transparent',
                border: isActive ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={16} color={isActive ? '#FBBF24' : '#9CA3AF'} />
              <span>{item.label}</span>
              {item.badge && (
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: isActive ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 255, 255, 0.08)',
                  color: isActive ? '#FCD34D' : '#9CA3AF',
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Status & Reset Action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* WS Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '6px',
          background: isConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
          border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
          fontSize: '12px',
          color: isConnected ? '#34D399' : '#FB7185',
        }}>
          {isConnected ? (
            <>
              <div className="pulse-dot" />
              <span style={{ fontWeight: 600 }}>Live Sync</span>
            </>
          ) : (
            <>
              <WifiOff size={13} />
              <span style={{ fontWeight: 600 }}>Offline</span>
            </>
          )}
        </div>

        {/* Reset Demo Button */}
        <button
          data-testid="reset-demo-btn"
          onClick={handleReset}
          disabled={resetting}
          className="btn-primary"
          style={{
            padding: '7px 14px',
            fontSize: '13px',
            opacity: resetting ? 0.7 : 1,
          }}
          title="Reset database and Redis to pristine demo baseline in < 3s"
        >
          <RefreshCw size={14} style={{ animation: resetting ? 'spin 1s linear infinite' : 'none' }} />
          <span>{resetting ? 'Resetting...' : 'Reset Demo'}</span>
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </header>
  );
};
