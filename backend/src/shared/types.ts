export type RoleCode =
  | 'SUPERADMIN'
  | 'OWNER'
  | 'OPERATIONS_MANAGER'
  | 'DISPATCHER'
  | 'CUSTOMER_SUPPORT'
  | 'FINANCE'
  | 'MERCHANT_MANAGER'
  | 'ANALYST';

export type OrderStatus =
  | 'DRAFT'
  | 'PENDING_CUSTOMER_CONFIRMATION'
  | 'CONFIRMED'
  | 'WAITING_FOR_MERCHANT'
  | 'MERCHANT_ACCEPTED'
  | 'MERCHANT_REJECTED'
  | 'PREPARING'
  | 'READY'
  | 'WAITING_FOR_DRIVER'
  | 'DRIVER_ASSIGNED'
  | 'PICKED_UP'
  | 'ON_THE_WAY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED'
  | 'REFUNDED';

export type DriverStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type DriverAvailability = 'AVAILABLE' | 'BUSY' | 'OFFLINE';

export interface Customer {
  id: number;
  public_id: string;
  whatsapp_number: string;
  display_name: string | null;
  preferred_language: string | null;
  status: string;
  default_address_id: number | null;
  created_at: string;
}

export interface CustomerAddress {
  id: number;
  public_id: string;
  customer_id: number;
  label: string;
  formatted_address: string | null;
  area_name: string | null;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  delivery_notes: string | null;
  entrance_photo_url: string | null;
  voice_note_url: string | null;
  is_default: number;
}

export interface Merchant {
  id: number;
  public_id: string;
  name: string;
  merchant_type: string;
  status: string;
  rating: number;
  commission_value: number;
  default_preparation_minutes: number;
  accepts_orders: number;
  branches?: MerchantBranch[];
}

export interface MerchantBranch {
  id: number;
  public_id: string;
  merchant_id: number;
  name: string;
  address: string | null;
  area_name: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  accepts_orders: number;
  preparation_minutes: number;
}

export interface Product {
  id: number;
  public_id: string;
  canonical_name: string;
  name_en: string | null;
  name_ar: string | null;
  description: string | null;
  brand: string | null;
  category_id: number | null;
  merchant_product_id?: number;
  merchant_branch_id?: number;
  merchant_name?: string;
  price?: number;
  is_available?: number;
  aliases?: string[];
}

export interface CartItem {
  id: number;
  cart_id: number;
  merchant_product_id: number;
  merchant_product_variant_id?: number | null;
  product_name: string;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  customer_notes?: string | null;
  size?: string;
}

export interface Cart {
  id: number;
  public_id: string;
  customer_id: number;
  merchant_branch_id: number | null;
  merchant_name?: string;
  status: string;
  currency: string;
  subtotal: number;
  estimated_delivery_fee: number;
  estimated_total: number;
  items: CartItem[];
  budget_limit?: number | null;
}

export interface Order {
  id: number;
  public_id: string;
  order_number: string;
  customer_id: number;
  customer_name?: string;
  customer_phone?: string;
  merchant_id: number;
  merchant_branch_id: number;
  merchant_name?: string;
  driver_id: number | null;
  driver_name?: string;
  driver_code?: string;
  driver_whatsapp_number?: string;
  customer_address_id: number;
  address_label?: string;
  formatted_address?: string;
  delivery_notes?: string;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  grand_total: number;
  lbp_exchange_rate?: number;
  grand_total_lbp?: number;
  currency: string;
  customer_notes: string | null;
  created_at: string;
  updated_at: string;
  timeline?: OrderStatusHistory[];
  items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_name_snapshot: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  customer_notes?: string | null;
}

export interface OrderStatusHistory {
  id: number;
  order_id: number;
  previous_status: string | null;
  new_status: string;
  actor_type: string;
  note: string | null;
  created_at: string;
}

export interface Driver {
  id: number;
  public_id: string;
  whatsapp_number: string;
  display_code: string;
  full_name_private: string;
  phone_private: string;
  status: DriverStatus;
  availability_status: DriverAvailability;
  vehicle_type: string | null;
  rating: number;
  current_order_count: number;
}

export interface DeliveryMessage {
  id: number;
  public_id: string;
  delivery_channel_id: number;
  order_id: number;
  sender_role: 'CUSTOMER' | 'DRIVER' | 'SYSTEM';
  message_type: string;
  text_body: string;
  relay_status: string;
  created_at: string;
}
