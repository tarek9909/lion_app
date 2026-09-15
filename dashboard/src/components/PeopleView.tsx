import React, { useEffect, useState } from 'react';
import { Bike, Mail, Phone, RefreshCw, Shield, UserRound, Users } from 'lucide-react';
import { api, type DashboardContacts } from '../services/api';

export const PeopleView: React.FC = () => {
  const [data, setData] = useState<DashboardContacts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.getDashboardContacts());
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Unable to load people and contacts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const stat = (label: string, value: number, icon: React.ReactNode, color: string) => (
    <div className="glass-panel" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ color, display: 'flex' }}>{icon}</div>
      <div><div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</div><strong style={{ fontSize: '24px' }}>{value}</strong></div>
    </div>
  );

  return (
    <div data-testid="people-contacts" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><h2 style={{ fontSize: '20px', margin: 0 }}>People & Contacts</h2><p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Internal operations directory. Full user, driver, and customer numbers are visible to dashboard operators.</p></div>
        <button className="btn-secondary" onClick={load} disabled={loading}><RefreshCw size={14} /> Refresh</button>
      </div>
      {error && <div className="badge badge-rose" style={{ alignSelf: 'flex-start' }}>{error}</div>}
      {loading && !data ? <div style={{ padding: '40px', color: 'var(--text-secondary)' }}>Loading people records...</div> : data && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: '14px' }}>
          {stat('Users', data.counts.users, <Users size={22} />, '#9333ea')}
          {stat('Drivers', data.counts.drivers, <Bike size={22} />, '#d97706')}
          {stat('Customers', data.counts.customers, <UserRound size={22} />, '#059669')}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(300px, 1fr))', gap: '18px', alignItems: 'start' }}>
          <section className="glass-panel" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '8px', alignItems: 'center' }}><Shield size={16} color="#9333ea" /><strong>Users</strong></div>
            {data.users.map((user) => <div key={user.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}><strong>{user.full_name}</strong><div style={{ color: '#7c3aed', fontSize: '12px', marginTop: '3px' }}>{user.roles || user.status}</div><div style={{ display: 'flex', flexDirection: 'column', gap: '3px', color: 'var(--text-secondary)', fontSize: '12px', marginTop: '8px' }}><span><Phone size={12} /> {user.phone || 'No phone'}</span><span><Mail size={12} /> {user.email || 'No email'}</span>{user.username && <span>@{user.username}</span>}</div></div>)}
          </section>

          <section className="glass-panel" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '8px', alignItems: 'center' }}><Bike size={16} color="#d97706" /><strong>Drivers</strong></div>
            {data.drivers.map((driver) => <div key={driver.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><strong>{driver.full_name_private || 'Unnamed driver'}</strong><span className="badge badge-gold">{driver.display_code}</span></div><div style={{ color: '#b45309', fontSize: '12px', marginTop: '5px' }}>{driver.availability_status} · {driver.vehicle_type || 'Vehicle not set'}</div><div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '8px' }}><div><Phone size={12} /> Phone: {driver.phone_private || 'Not set'}</div><div><Phone size={12} /> WhatsApp: {driver.whatsapp_number}</div></div></div>)}
          </section>

          <section className="glass-panel" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '8px', alignItems: 'center' }}><UserRound size={16} color="#059669" /><strong>Customers</strong></div>
            {data.customers.map((customer) => <div key={customer.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}><strong>{customer.display_name || 'WhatsApp customer'}</strong><div style={{ color: '#0369a1', fontFamily: 'monospace', fontSize: '12px', marginTop: '5px' }}>{customer.whatsapp_number}</div><div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '7px' }}>{customer.total_completed_orders || 0} completed orders · ${Number(customer.lifetime_spend || 0).toFixed(2)} lifetime</div><span className="badge badge-emerald" style={{ marginTop: '7px' }}>{customer.status}</span></div>)}
          </section>
        </div>
      </>}
    </div>
  );
};
