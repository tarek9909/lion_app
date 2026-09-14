import React, { useState, useEffect } from 'react';
import { api, type DriverInfo } from '../services/api';
import { Bike, Star, MapPin, CheckCircle } from 'lucide-react';

export const DriversView: React.FC = () => {
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [simulatedDrivers, setSimulatedDrivers] = useState<DriverInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.getDrivers()
      .then((data) => {
        if (mounted) {
          setDrivers(data);
          setSimulatedDrivers(data);
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

  // Demo-only GPS interpolation: once a driver is carrying an order, move the
  // displayed marker toward the saved customer destination every few seconds.
  // The source records remain server-owned; this only makes the demo fleet view
  // communicate the in-transit state without pretending to be live GPS.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setSimulatedDrivers((current) => current.map((driver) => {
        if (driver.active_order_status !== 'PICKED_UP' && driver.active_order_status !== 'OUT_FOR_DELIVERY') return driver;
        if (driver.latitude == null || driver.longitude == null || driver.destination_latitude == null || driver.destination_longitude == null) return driver;
        return {
          ...driver,
          latitude: driver.latitude + (driver.destination_latitude - driver.latitude) * 0.08,
          longitude: driver.longitude + (driver.destination_longitude - driver.longitude) * 0.08,
        };
      }));
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 100px)', overflowY: 'auto' }}>
      <div>
        <h2 style={{ fontSize: '20px', margin: 0 }}>Fleet Dispatch & Driver Network</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
          Dedicated couriers with automated delivery offers and private masked communication channels.
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
          {simulatedDrivers.map((d) => (
            <div key={d.display_code} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Bike size={22} color="#FBBF24" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', color: '#FFFFFF', margin: 0 }}>{d.full_name_private}</h3>
                    <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#FCD34D' }}>{d.display_code}</span>
                  </div>
                </div>

                <span className={`badge ${d.availability_status === 'AVAILABLE' ? 'badge-emerald' : 'badge-gold'}`}>
                  {d.availability_status}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <div>
                  <strong>Vehicle:</strong> {d.vehicle_type}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} color="#06B6D4" />
                  <span><strong>Zone:</strong> Saida Central (8.5 km radius)</span>
                </div>
                {d.latitude != null && d.longitude != null && (
                  <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#67E8F9' }}>
                    GPS: {Number(d.latitude).toFixed(5)}, {Number(d.longitude).toFixed(5)}
                    {(d.active_order_status === 'PICKED_UP' || d.active_order_status === 'OUT_FOR_DELIVERY') && ' · simulated in transit'}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Star size={14} color="#FBBF24" />
                  <span><strong>Rating:</strong> <strong style={{ color: '#FCD34D' }}>{parseFloat(String(d.rating)).toFixed(2)}⭐</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={14} color="#10B981" />
                  <span><strong>Active Load:</strong> {d.current_order_count || 0} in progress</span>
                </div>
              </div>

              <div style={{
                marginTop: 'auto',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                fontSize: '12px',
                color: 'var(--text-tertiary)',
              }}>
                🔒 <em>Private Number Relay: Active. Direct phone dialing is masked.</em>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
