import React, { useState, useEffect } from 'react';
import { api, type MerchantInfo } from '../services/api';
import { Store, Search, Star } from 'lucide-react';

export const CatalogView: React.FC = () => {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<MerchantInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMerchant, setSelectedMerchant] = useState<string>('ALL');

  useEffect(() => {
    api.getCatalog().then(setCatalog).catch(console.error);
    api.getMerchants().then(setMerchants).catch(console.error);
  }, []);

  const filteredCatalog = catalog.filter((item) => {
    const matchesSearch =
      item.canonical_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name_en?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name_ar?.includes(searchQuery);
    const matchesMerchant = selectedMerchant === 'ALL' || item.merchant_name === selectedMerchant;
    return matchesSearch && matchesMerchant;
  });

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 100px)', overflowY: 'auto' }}>
      {/* Header & Search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '20px', margin: 0 }}>Merchant Catalog & Dynamic Aliases</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Unified product taxonomy with multilingual aliases (English, Arabic, Arabizi) queried by the WhatsApp AI.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '6px 12px',
          }}>
            <Search size={14} color="#9CA3AF" />
            <input
              type="text"
              placeholder="Search products or aliases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: '13px', outline: 'none', width: '200px' }}
            />
          </div>
        </div>
      </div>

      {/* Merchants Banner Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
        {merchants.map((m) => {
          const isSelected = selectedMerchant === m.name;
          return (
            <div
              key={m.id}
              onClick={() => setSelectedMerchant(isSelected ? 'ALL' : m.name)}
              className="glass-panel"
              style={{
                padding: '16px',
                cursor: 'pointer',
                borderColor: isSelected ? 'var(--brand-gold)' : 'var(--border-subtle)',
                background: isSelected ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-card)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <Store size={20} color={isSelected ? '#FBBF24' : '#9CA3AF'} />
                <span className="badge badge-gold">
                  <Star size={11} /> {parseFloat(String(m.rating)).toFixed(2)}
                </span>
              </div>
              <h4 style={{ fontSize: '15px', color: '#FFFFFF', margin: '0 0 4px 0' }}>{m.name}</h4>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span>Type: {m.merchant_type}</span>
                <span>Prep Time: ~{m.preparation_minutes || m.default_preparation_minutes || 20} mins</span>
                <span>Commission: {(parseFloat(String(m.commission_value || 0.10)) * 100).toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Products Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {filteredCatalog.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            No products found matching "{searchQuery}".
          </div>
        ) : (
          filteredCatalog.map((p, idx) => (
            <div key={idx} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ fontSize: '15px', color: '#FFFFFF', margin: 0 }}>{p.canonical_name}</h4>
                  <span style={{ fontSize: '12px', color: '#9CA3AF' }}>{p.name_ar}</span>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#FCD34D' }}>
                  ${parseFloat(p.base_price).toFixed(2)}
                </div>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                <strong>Merchant:</strong> {p.merchant_name}
              </div>

              {p.description && (
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: '1.4' }}>
                  {p.description}
                </p>
              )}

              <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="badge badge-emerald">In Stock</span>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  Category: {p.category_name || 'General'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
