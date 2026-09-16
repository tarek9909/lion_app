const API_BASE = '/api';

export interface OrderItem {
  id: number;
  product_name_snapshot: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  customer_notes?: string | null;
}

export interface Order {
  id: number;
  public_id: string;
  order_number: string;
  status: 'CONFIRMED' | 'PREPARING' | 'WAITING_FOR_DRIVER' | 'DRIVER_ASSIGNED' | 'READY_FOR_PICKUP' | 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'MERCHANT_REJECTED' | 'CANCELLED';
  subtotal: number;
  delivery_fee: number;
  grand_total: number;
  lbp_exchange_rate?: number;
  grand_total_lbp?: number;
  currency: string;
  payment_status: string;
  customer_name: string;
  customer_phone: string;
  merchant_name: string;
  driver_code?: string | null;
  driver_name?: string | null;
  driver_whatsapp_number?: string | null;
  address_label: string;
  formatted_address: string;
  delivery_notes?: string | null;
  items?: OrderItem[];
  created_at: string;
}

export interface AnalyticsData {
  ordersToday: number;
  completedOrders: number;
  activeOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  averageDeliveryMinutes: number | null;
  activeDrivers: number;
  activeMerchants: number;
  activeBranches: number;
  whatsappConversations: number;
  conversionRatePercent: number;
  recentOrders: any[];
}

export interface RelayMessage {
  id: number;
  publicId: string;
  orderId: number;
  senderRole: 'CUSTOMER' | 'DRIVER' | 'SYSTEM';
  senderDisplay: string;
  recipientDisplay: string;
  text: string;
  createdAt: string;
}

export interface DriverInfo {
  id: number;
  public_id: string;
  display_code: string;
  full_name_private: string;
  phone_private?: string | null;
  whatsapp_number: string;
  status: string;
  availability_status: string;
  vehicle_type: string;
  rating: number;
  current_order_count: number;
  latitude?: number | null;
  longitude?: number | null;
  location_recorded_at?: string | null;
  active_order_id?: number | null;
  active_order_status?: string | null;
  destination_latitude?: number | null;
  destination_longitude?: number | null;
}

export interface MerchantInfo {
  id: number;
  name: string;
  merchant_type: string;
  rating: number;
  commission_value: number;
  default_preparation_minutes: number;
  branch_name?: string;
  address?: string;
  preparation_minutes?: number;
  delivery_fee?: number;
}

export interface WhatsAppConversationSummary {
  id: number;
  public_id: string;
  channel: string;
  status: string;
  ai_mode: string;
  last_message_at: string | null;
  created_at: string;
  whatsapp_number: string;
  display_name: string | null;
  message_count: number;
  inbound_count: number;
  last_message: string | null;
  last_message_direction: 'INBOUND' | 'OUTBOUND' | null;
  last_message_type: string | null;
}

export interface WhatsAppMessage {
  id: number;
  conversation_id: number;
  direction: 'INBOUND' | 'OUTBOUND';
  sender_type: string;
  sender_reference?: string | null;
  message_type: string;
  text_body: string | null;
  status: string;
  created_at: string;
  media_url?: string | null;
  media_transcript?: string | null;
}

export interface DashboardContacts {
  counts: { users: number; drivers: number; customers: number };
  users: Array<{ id: number; public_id: string; full_name: string; email: string | null; username: string | null; phone: string | null; status: string; roles: string | null }>;
  drivers: Array<{ id: number; public_id: string; display_code: string; full_name_private: string | null; phone_private: string | null; whatsapp_number: string; status: string; availability_status: string; vehicle_type: string | null }>;
  customers: Array<{ id: number; public_id: string; display_name: string | null; whatsapp_number: string; status: string; created_at: string; last_order_at: string | null; total_completed_orders: number; lifetime_spend: number }>;
}

export interface WhatsAppCredentialStatus {
  configured: boolean;
  source: 'dashboard' | 'environment' | 'none';
  updatedAt: string | null;
}

// Token management & authenticated fetch helper (G-051)
let cachedToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('lion_auth_token') : null;

export function getAuthToken(): string | null {
  return cachedToken;
}

export function setAuthToken(token: string | null) {
  cachedToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('lion_auth_token', token);
    } else {
      localStorage.removeItem('lion_auth_token');
    }
  }
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  // Ensure authenticated Bearer token
  if (!cachedToken) {
    await api.login('admin@liondelivery.com', 'admin123');
  }

  if (cachedToken) {
    headers.set('Authorization', `Bearer ${cachedToken}`);
  }

  let res = await fetch(url, { ...options, headers });

  // If token expired / unauthorized, attempt one transparent re-login
  if (res.status === 401) {
    const loginOk = await api.login('admin@liondelivery.com', 'admin123');
    if (loginOk && cachedToken) {
      headers.set('Authorization', `Bearer ${cachedToken}`);
      res = await fetch(url, { ...options, headers });
    }
  }

  return res;
}

export const api = {
  // Authentication (G-051)
  async login(email: string = 'admin@liondelivery.com', password: string = 'admin123'): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.data?.token) {
        setAuthToken(data.data.token);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  // Orders
  async getOrders(): Promise<Order[]> {
    const res = await authFetch(`${API_BASE}/orders`);
    const data = await res.json();
    return data.data || [];
  },

  async getOrder(id: number): Promise<Order | null> {
    const res = await authFetch(`${API_BASE}/orders/${id}`);
    const data = await res.json();
    return data.data || null;
  },

  async merchantAcceptOrder(id: number, prepMinutes: number = 20): Promise<Order> {
    const res = await authFetch(`${API_BASE}/orders/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify({ prepMinutes, preparationMinutes: prepMinutes }),
    });
    const data = await res.json();
    return data.data;
  },

  async merchantRejectOrder(id: number, reason: string = 'Kitchen capacity reached'): Promise<Order> {
    const res = await authFetch(`${API_BASE}/orders/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    return data.data;
  },

  async merchantReadyOrder(id: number): Promise<Order> {
    const res = await authFetch(`${API_BASE}/orders/${id}/ready`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const data = await res.json();
    return data.data;
  },

  async driverAcceptOrder(id: number, driverId?: number): Promise<Order> {
    const res = await authFetch(`${API_BASE}/orders/${id}/driver-accept`, {
      method: 'POST',
      body: JSON.stringify({ driverId }),
    });
    const data = await res.json();
    return data.data;
  },

  async driverRejectOrder(id: number, driverId?: number, reason: string = 'Driver unavailable / vehicle issue'): Promise<Order> {
    const res = await authFetch(`${API_BASE}/orders/${id}/driver-reject`, {
      method: 'POST',
      body: JSON.stringify({ driverId, reason }),
    });
    const data = await res.json();
    return data.data;
  },

  async driverPickupOrder(id: number): Promise<Order> {
    const res = await authFetch(`${API_BASE}/orders/${id}/pickup`, {
      method: 'POST',
    });
    const data = await res.json();
    return data.data;
  },

  async driverDeliverOrder(id: number, rating: number = 5, comment: string = 'Great delivery!'): Promise<Order> {
    const res = await authFetch(`${API_BASE}/orders/${id}/deliver`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    });
    const data = await res.json();
    return data.data;
  },

  // Drivers Fleet View (G-057)
  async getDrivers(): Promise<DriverInfo[]> {
    const res = await authFetch(`${API_BASE}/drivers`);
    const data = await res.json();
    return data.data || [];
  },

  // Live WhatsApp Inbox
  async getWhatsAppConversations(): Promise<WhatsAppConversationSummary[]> {
    const res = await authFetch(`${API_BASE}/whatsapp/inbox/conversations`);
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error?.message || 'Failed to load WhatsApp conversations');
    return data.data || [];
  },

  async getWhatsAppMessages(conversationId: number): Promise<WhatsAppMessage[]> {
    const res = await authFetch(`${API_BASE}/whatsapp/inbox/conversations/${conversationId}/messages`);
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error?.message || 'Failed to load WhatsApp messages');
    return data.data || [];
  },

  async sendWhatsAppReply(conversationId: number, text: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/whatsapp/inbox/conversations/${conversationId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error?.message || 'WhatsApp reply failed');
    return data.data;
  },

  // WhatsApp integration credential. The API only returns metadata, never the token itself.
  async getWhatsAppCredentialStatus(): Promise<WhatsAppCredentialStatus> {
    const res = await authFetch(`${API_BASE}/settings/whatsapp`);
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error?.message || 'Failed to load WhatsApp credential status');
    return data.data;
  },

  async saveWhatsAppAccessToken(accessToken: string): Promise<WhatsAppCredentialStatus> {
    const res = await authFetch(`${API_BASE}/settings/whatsapp/access-token`, {
      method: 'PUT',
      body: JSON.stringify({ accessToken }),
    });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error?.message || 'Failed to save WhatsApp access token');
    return data.data;
  },

  // Internal People & Contacts
  async getDashboardContacts(): Promise<DashboardContacts> {
    const res = await authFetch(`${API_BASE}/dashboard/contacts`);
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error?.message || 'Failed to load contacts');
    return data.data;
  },

  // Merchants (G-057)
  async getMerchants(): Promise<MerchantInfo[]> {
    const res = await fetch(`${API_BASE}/merchants`);
    const data = await res.json();
    return data.data || [];
  },

  // Private Masked Relay (G-052)
  async getRelayMessages(orderId: number): Promise<RelayMessage[]> {
    const res = await authFetch(`${API_BASE}/relay/${orderId}/messages`);
    const data = await res.json();
    return data.data || [];
  },

  async sendRelayMessage(orderId: number, senderRole: 'CUSTOMER' | 'DRIVER', text: string): Promise<RelayMessage> {
    const res = await authFetch(`${API_BASE}/relay/${orderId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ senderRole, text, message: text }),
    });
    const data = await res.json();
    return data.data;
  },

  // Analytics (G-056)
  async getAnalytics(): Promise<AnalyticsData> {
    const res = await authFetch(`${API_BASE}/analytics/dashboard`);
    const data = await res.json();
    return data.data;
  },



  // Management AI (G-056)
  async askManagementAi(question: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/management-ai/ask`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    return data.data;
  },

  // Catalog
  async getCatalog(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/catalog`);
    const data = await res.json();
    return data.data || [];
  },

  // Demo Reset
  async resetDemo(): Promise<any> {
    const res = await authFetch(`${API_BASE}/demo/reset`, {
      method: 'POST',
    });
    return res.json();
  },

  // AI Learning Workbench (Section 17)
  async getLearningCases(status?: string, rootCause?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (rootCause) params.append('rootCause', rootCause);
    const res = await authFetch(`${API_BASE}/ai-learning/cases?${params.toString()}`);
    const data = await res.json();
    return data.data || [];
  },

  async reviewLearningCase(publicId: string, review: any): Promise<any> {
    const res = await authFetch(`${API_BASE}/ai-learning/cases/${publicId}/review`, {
      method: 'POST',
      body: JSON.stringify(review),
    });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error?.message || 'Case review failed');
    return data.data;
  },

  async getCustomerMemoryItems(customerId?: number): Promise<any[]> {
    const params = customerId ? `?customerId=${customerId}` : '';
    const res = await authFetch(`${API_BASE}/ai-learning/memory-items${params}`);
    const data = await res.json();
    return data.data || [];
  },

  async confirmCustomerMemoryItem(publicId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/ai-learning/memory-items/${publicId}/confirm`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error?.message || 'Confirm memory failed');
    return data.data;
  },

  async deleteCustomerMemoryItem(publicId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/ai-learning/memory-items/${publicId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error?.message || 'Delete memory failed');
    return data.data;
  },

  async getPromptVersions(): Promise<any[]> {
    const res = await authFetch(`${API_BASE}/ai-learning/prompts`);
    const data = await res.json();
    return data.data || [];
  },

  async activatePromptVersion(version: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/ai-learning/prompts/${version}/activate`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error?.message || 'Activate prompt failed');
    return data.data;
  },

  async getLearningDashboardMetrics(): Promise<any> {
    const res = await authFetch(`${API_BASE}/ai-learning/dashboard/metrics`);
    const data = await res.json();
    return data.data || {};
  },

  async exportLearningDataset(options?: { name?: string; minQualityScore?: number; format?: string }): Promise<any> {
    const res = await authFetch(`${API_BASE}/ai-learning/export`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error?.message || 'Dataset export failed');
    return data.data;
  },

  async triggerHarvest(): Promise<any> {
    const res = await authFetch(`${API_BASE}/ai-learning/harvest`, {
      method: 'POST',
    });
    const data = await res.json();
    return data.data;
  },
};
