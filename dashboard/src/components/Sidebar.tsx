import React, { useState } from 'react';
import {
  RefreshCw,
  LayoutDashboard,
  ShieldCheck,
  Store,
  Bike,
  BarChart3,
  Bot,
  WifiOff,
  MessageSquare,
  Users,
  X,
  Radio,
} from 'lucide-react';

export interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isConnected: boolean;
  onResetDemo: () => Promise<void>;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>;
  badge?: string;
  badgeVariant?: 'gold' | 'emerald' | 'cyan' | 'rose' | 'gray';
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isConnected,
  onResetDemo,
  isOpenMobile = false,
  onCloseMobile,
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

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const navGroups: NavGroup[] = [
    {
      title: 'Fulfillment & Ops',
      items: [
        { id: 'orders', label: 'Live Orders', icon: LayoutDashboard },
        { id: 'relay', label: 'Masked Relay', icon: ShieldCheck, badge: 'Privacy', badgeVariant: 'emerald' },
        { id: 'inbox', label: 'WhatsApp Inbox', icon: MessageSquare, badge: 'Live', badgeVariant: 'cyan' },
      ],
    },
    {
      title: 'Network & Fleet',
      items: [
        { id: 'catalog', label: 'Merchants & Menu', icon: Store },
        { id: 'drivers', label: 'Fleet & Drivers', icon: Bike },
        { id: 'contacts', label: 'People & Contacts', icon: Users, badge: 'Internal', badgeVariant: 'gray' },
      ],
    },
    {
      title: 'Executive Intelligence',
      items: [
        { id: 'analytics', label: 'Live Analytics', icon: BarChart3 },
        { id: 'management', label: 'Management AI', icon: Bot, badge: 'Executive', badgeVariant: 'gold' },
      ],
    },
  ];

  const getBadgeClass = (variant?: string) => {
    switch (variant) {
      case 'gold':
        return 'badge-gold';
      case 'emerald':
        return 'badge-emerald';
      case 'cyan':
        return 'badge-cyan';
      case 'rose':
        return 'badge-rose';
      default:
        return 'badge-gray';
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 90,
          }}
        />
      )}

      <aside
        className={`app-sidebar ${isOpenMobile ? 'sidebar-open' : ''}`}
        style={{
          width: '272px',
          height: '100vh',
          background: '#ffffff',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flexShrink: 0,
          position: 'relative',
          zIndex: 100,
          userSelect: 'none',
        }}
      >
        {/* Top Brand Section - Contains <header> tag for automated E2E tests compatibility */}
        <header
          style={{
            padding: '20px 18px 16px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  margin: 0,
                  color: 'var(--text-primary)',
                  lineHeight: 1.2,
                }}
              >
                LION DELIVERY
              </h1>
              <span
                style={{
                  background: '#fef3c7',
                  color: '#b45309',
                  border: '1px solid #fde68a',
                  borderRadius: '4px',
                  padding: '1px 6px',
                  fontSize: '9px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                DEMO V1.0
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Autonomous WhatsApp Fulfillment
            </div>
          </div>

          {/* Mobile Close Button */}
          {isOpenMobile && onCloseMobile && (
            <button
              onClick={onCloseMobile}
              style={{
                background: '#f1f5f9',
                color: 'var(--text-secondary)',
                borderRadius: '8px',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} />
            </button>
          )}
        </header>

        {/* Scrollable Navigation Groups */}
        <nav
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {navGroups.map((group) => (
            <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-tertiary)',
                  padding: '4px 10px 2px 10px',
                }}
              >
                {group.title}
              </div>

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    data-tab={item.id}
                    data-testid={`tab-${item.id}`}
                    onClick={() => handleTabClick(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? '#b45309' : 'var(--text-secondary)',
                      background: isActive ? '#fef3c7' : 'transparent',
                      border: isActive ? '1px solid #fde68a' : '1px solid transparent',
                      position: 'relative',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = '#f1f5f9';
                        e.currentTarget.style.color = 'var(--text-primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Icon
                        size={16}
                        color={isActive ? '#d97706' : '#64748b'}
                        style={{ flexShrink: 0 }}
                      />
                      <span style={{ letterSpacing: '-0.01em' }}>{item.label}</span>
                    </div>

                    {item.badge && (
                      <span
                        className={`badge ${getBadgeClass(item.badgeVariant)}`}
                        style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          letterSpacing: '0.02em',
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom System Actions & Live Sync Status */}
        <div
          style={{
            padding: '14px 14px 18px 14px',
            borderTop: '1px solid var(--border-subtle)',
            background: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Live Sync Status Card */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: '8px',
              background: isConnected ? '#ecfdf5' : '#fff1f2',
              border: `1px solid ${isConnected ? '#a7f3d0' : '#fecdd3'}`,
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isConnected ? (
                <>
                  <div className="pulse-dot" />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600, color: '#047857', lineHeight: 1.2 }}>Live Sync</span>
                    <span style={{ fontSize: '10px', color: '#059669' }}>WebSocket Active</span>
                  </div>
                </>
              ) : (
                <>
                  <WifiOff size={14} color="#be123c" />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600, color: '#be123c', lineHeight: 1.2 }}>Offline</span>
                    <span style={{ fontSize: '10px', color: '#e11d48' }}>Reconnecting...</span>
                  </div>
                </>
              )}
            </div>

            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isConnected ? '#059669' : '#e11d48',
              }}
            />
          </div>

          {/* Reset Demo Button */}
          <button
            data-testid="reset-demo-btn"
            onClick={handleReset}
            disabled={resetting}
            className="btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '9px 14px',
              fontSize: '13px',
              fontWeight: 600,
              opacity: resetting ? 0.75 : 1,
              borderRadius: '8px',
            }}
            title="Reset database and Redis to pristine demo baseline in < 3s"
          >
            <RefreshCw
              size={14}
              style={{
                animation: resetting ? 'spin 1s linear infinite' : 'none',
                flexShrink: 0,
              }}
            />
            <span>{resetting ? 'Resetting Demo...' : 'Reset Demo'}</span>
          </button>

          {/* Operations Footer Note */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '10px',
              color: 'var(--text-tertiary)',
            }}
          >
            <Radio size={10} color="#10B981" />
            <span>HQ Dispatch Engine Active</span>
          </div>
        </div>

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @media (max-width: 1024px) {
            .app-sidebar {
              position: fixed !important;
              top: 0;
              left: 0;
              transform: translateX(-100%);
              transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
              box-shadow: 10px 0 30px rgba(0, 0, 0, 0.7);
            }
            .app-sidebar.sidebar-open {
              transform: translateX(0);
            }
          }
        `}</style>
      </aside>
    </>
  );
};

export default Sidebar;
