import { query } from '../../database/db.js';

export interface DemoAnalyticsData {
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

export class AnalyticsService {
  async getDemoAnalytics(): Promise<DemoAnalyticsData> {
    // 1. Orders count and financials for today
    const orderRows: any = await query(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN status NOT IN ('DELIVERED', 'CANCELLED', 'FAILED', 'REFUNDED') THEN 1 ELSE 0 END) as active_orders,
        SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled_orders,
        COALESCE(SUM(CASE WHEN status = 'DELIVERED' THEN grand_total ELSE 0 END), 0) as total_revenue,
        COALESCE(AVG(CASE WHEN status = 'DELIVERED' THEN grand_total ELSE NULL END), 0) as avg_order_value,
        AVG(CASE WHEN status = 'DELIVERED' AND confirmed_at IS NOT NULL AND delivered_at IS NOT NULL 
            THEN TIMESTAMPDIFF(MINUTE, confirmed_at, delivered_at) ELSE NULL END) as avg_delivery_minutes
      FROM orders
      WHERE DATE(created_at) = CURRENT_DATE() OR status = 'DELIVERED'
    `);
    const orderStats = orderRows[0] || {};

    // 2. Active drivers & merchants/branches
    const driverRows: any = await query(`
      SELECT COUNT(*) as active_drivers FROM drivers WHERE status = 'ACTIVE'
    `);
    const driverStats = driverRows[0] || {};

    const merchantRows: any = await query(`
      SELECT COUNT(*) as active_merchants FROM merchants WHERE status = 'ACTIVE' AND accepts_orders = 1
    `);
    const merchantStats = merchantRows[0] || {};

    const branchRows: any = await query(`
      SELECT COUNT(*) as active_branches FROM merchant_branches WHERE status = 'ACTIVE' AND accepts_orders = 1
    `);
    const branchStats = branchRows[0] || {};

    // 3. WhatsApp conversations
    const convRows: any = await query(`
      SELECT COUNT(*) as conversations_count FROM conversations
    `);
    const convStats = convRows[0] || {};

    const totalOrders = parseInt(orderStats.total_orders || '0', 10);
    const completedOrders = parseInt(orderStats.completed_orders || '0', 10);
    const activeOrders = parseInt(orderStats.active_orders || '0', 10);
    const cancelledOrders = parseInt(orderStats.cancelled_orders || '0', 10);
    const totalRevenue = parseFloat(orderStats.total_revenue || '0');
    const averageOrderValue = parseFloat(orderStats.avg_order_value || '0');
    const avgDeliveryMins = orderStats.avg_delivery_minutes != null ? Math.round(parseFloat(orderStats.avg_delivery_minutes)) : null;

    const conversations = parseInt(convStats.conversations_count || '0', 10);
    const conversionRatePercent = conversations > 0
      ? Math.min(100, Math.round((totalOrders / conversations) * 100))
      : 0;

    const recentOrders = await query<any[]>(`
      SELECT o.order_number, o.status, o.grand_total, m.name as merchant_name, o.created_at
      FROM orders o
      JOIN merchants m ON m.id = o.merchant_id
      ORDER BY o.created_at DESC LIMIT 5
    `);

    return {
      ordersToday: totalOrders,
      completedOrders,
      activeOrders,
      cancelledOrders,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      averageOrderValue: Number(averageOrderValue.toFixed(2)),
      averageDeliveryMinutes: avgDeliveryMins,
      activeDrivers: parseInt(driverStats.active_drivers || '0', 10),
      activeMerchants: parseInt(merchantStats.active_merchants || '0', 10),
      activeBranches: parseInt(branchStats.active_branches || '0', 10),
      whatsappConversations: conversations,
      conversionRatePercent,
      recentOrders,
    };
  }
}

export const analyticsService = new AnalyticsService();
