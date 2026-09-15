import React, { useState, useEffect } from 'react';
import { api, type DriverInfo } from '../services/api';
import { Bike, Star, MapPin, CheckCircle } from 'lucide-react';

export const DriversView: React.FC = () => {
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.getDrivers()
      .then((data) => {
        if (mounted) {
          setDrivers(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch drivers:', err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div>
        <h2 style={{ fontSize: '20px', margin: 0 }}>Fleet Dispatch & Driver Network</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
          Internal fleet records with full contact numbers. WhatsApp privacy applies only to customer/driver communication.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Loading active fleet couriers from MySQL...
        </div>
      ) : drivers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          No drivers registered in this zone.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {drivers.map((d) => (
            <div key={d.display_code} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#fef3c7', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bike size={22} color="#d97706" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', margin: 0 }}>{d.full_name_private || 'Unnamed driver'}</h3>
                    <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#b45309' }}>{d.display_code}</span>
                  </div>
                </div>
                <span className={`badge ${d.availability_status === 'AVAILABLE' ? 'badge-emerald' : 'badge-gold'}`}>
                  {d.availability_status}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <div><strong>Vehicle:</strong> {d.vehicle_type || '—'}</div>
                <div><strong>Phone:</strong> {d.phone_private || d.whatsapp_number}</div>
                <div><strong>WhatsApp:</strong> {d.whatsapp_number}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} color="#0891b2" />
                  <span><strong>Zone:</strong> Saida Central (8.5 km radius)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Star size={14} color="#d97706" />
                  <span><strong>Rating:</strong> <strong style={{ color: '#b45309' }}>{parseFloat(String(d.rating)).toFixed(2)} stars</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={14} color="#059669" />
                  <span><strong>Active Load:</strong> {d.current_order_count || 0} in progress</span>
                </div>
              </div>

              <div style={{ marginTop: 'auto', padding: '10px 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid var(--border-subtle)', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                Internal operations view. WhatsApp customer/driver number privacy remains active.
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
