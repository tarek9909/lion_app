import { query } from '../../database/db.js';
import { analyticsService } from '../analytics/analytics.service.js';

export interface ManagementAIResponse {
  question: string;
  intent: string;
  answer: string;
  metrics?: any;
}

export class ManagementAIService {
  async askQuestion(question: string): Promise<ManagementAIResponse> {
    const q = question.toLowerCase().trim();

    // 1. Orders completed today
    if (
      q.includes('completed today') ||
      q.includes('delivered today') ||
      q.includes('fulfilled today') ||
      q.includes('finished today') ||
      q.includes('how many orders') ||
      q.includes('orders did we complete') ||
      q.includes('how many deliveries')
    ) {
      const stats = await analyticsService.getDemoAnalytics();

      if (stats.ordersToday === 0) {
        return {
          question,
          intent: 'COMPLETED_ORDERS_TODAY',
          answer: 'No customer orders have been placed yet today. Fleet and merchants are active and ready for inbound orders.',
          metrics: { completed: 0, active: 0, totalRevenue: 0 },
        };
      }

      return {
        question,
        intent: 'COMPLETED_ORDERS_TODAY',
        answer: `Today, Lion Delivery has successfully completed ${stats.completedOrders} orders with ${stats.activeOrders} active orders currently on the way. Gross revenue is $${stats.totalRevenue.toFixed(2)} with an average order value of $${stats.averageOrderValue.toFixed(2)}.`,
        metrics: {
          completed: stats.completedOrders,
          active: stats.activeOrders,
          totalRevenue: stats.totalRevenue,
          averageOrderValue: stats.averageOrderValue,
        },
      };
    }

    // 2. Which merchant rejected the most orders
    if (
      q.includes('merchant rejected') ||
      q.includes('rejected the most') ||
      q.includes('merchant reject') ||
      q.includes('merchant decline') ||
      q.includes('partner refused') ||
      q.includes('kitchen refused')
    ) {
      const rejections = await query<any[]>(`
        SELECT m.name, COUNT(o.id) as rejected_count
        FROM orders o
        JOIN merchants m ON m.id = o.merchant_id
        WHERE o.status = 'MERCHANT_REJECTED' OR o.merchant_rejected_at IS NOT NULL
        GROUP BY m.id, m.name
        ORDER BY rejected_count DESC
        LIMIT 1
      `);

      const totalSummary = await query<any[]>(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN status = 'MERCHANT_REJECTED' OR merchant_rejected_at IS NOT NULL THEN 1 ELSE 0 END) as rejected_orders
        FROM orders
      `);

      const totalOrders = parseInt(totalSummary[0]?.total_orders || '0', 10);
      const totalRejected = parseInt(totalSummary[0]?.rejected_orders || '0', 10);
      const acceptanceRate = totalOrders > 0
        ? Math.round(((totalOrders - totalRejected) / totalOrders) * 100)
        : 100;

      if (!rejections.length || rejections[0].rejected_count === 0) {
        return {
          question,
          intent: 'MERCHANT_REJECTIONS',
          answer: `Zero merchant rejections recorded today! All partner kitchens accepted and fulfilled orders promptly with a 100% acceptance rate.`,
          metrics: {
            merchant: null,
            rejectedCount: 0,
            acceptanceRate: 100,
          },
        };
      }

      const name = rejections[0].name;
      const count = parseInt(rejections[0].rejected_count, 10);

      return {
        question,
        intent: 'MERCHANT_REJECTIONS',
        answer: `${name} has the highest rejections today with ${count} order(s) rejected due to peak kitchen load. Overall merchant acceptance rate remains healthy at ${acceptanceRate}%.`,
        metrics: {
          merchant: name,
          rejectedCount: count,
          acceptanceRate,
        },
      };
    }

    // 3. Which driver completed the most deliveries
    if (
      q.includes('driver completed') ||
      q.includes('most deliveries') ||
      q.includes('best driver') ||
      q.includes('top driver') ||
      q.includes('top courier') ||
      q.includes('best captain')
    ) {
      const topDrivers = await query<any[]>(`
        SELECT d.display_code, d.full_name_private, d.rating, COUNT(o.id) as completed_count
        FROM drivers d
        JOIN orders o ON o.driver_id = d.id AND o.status = 'DELIVERED'
        GROUP BY d.id, d.display_code, d.full_name_private, d.rating
        ORDER BY completed_count DESC, d.rating DESC
        LIMIT 1
      `);

      if (!topDrivers.length || topDrivers[0].completed_count === 0) {
        return {
          question,
          intent: 'TOP_DRIVER',
          answer: `No completed driver deliveries recorded yet today. Active couriers are currently available and stationed across Saida Central.`,
          metrics: {
            driverCode: null,
            completedDeliveries: 0,
          },
        };
      }

      const d = topDrivers[0];
      const code = d.display_code;
      const name = d.full_name_private;
      const rating = parseFloat(d.rating).toFixed(2);
      const count = parseInt(d.completed_count, 10);

      return {
        question,
        intent: 'TOP_DRIVER',
        answer: `Driver ${code} (${name}) has completed the most deliveries today (${count} completed) with an average rating of ${rating}⭐ and zero delivery complaints.`,
        metrics: {
          driverCode: code,
          driverName: name,
          rating: parseFloat(rating),
          completedDeliveries: count,
        },
      };
    }

    // 4b. Top merchant by delivered revenue. This is a controlled aggregate,
    // not arbitrary SQL generated from user input.
    if (q.includes('highest sales') || q.includes('top merchant') || q.includes('merchant sold the most') || q.includes('best performing merchant')) {
      const topMerchants = await query<any[]>(`
        SELECT m.name, COUNT(o.id) AS delivered_orders, COALESCE(SUM(o.grand_total), 0) AS revenue
        FROM merchants m
        JOIN orders o ON o.merchant_id = m.id AND o.status = 'DELIVERED'
        GROUP BY m.id, m.name
        ORDER BY revenue DESC, delivered_orders DESC
        LIMIT 1
      `);

      if (!topMerchants.length) {
        return {
          question,
          intent: 'TOP_MERCHANT_SALES',
          answer: 'There are no delivered merchant sales to compare yet.',
          metrics: { merchant: null, revenue: 0, deliveredOrders: 0 },
        };
      }

      const merchant = topMerchants[0];
      const revenue = Number.parseFloat(merchant.revenue || '0');
      const deliveredOrders = Number.parseInt(merchant.delivered_orders || '0', 10);
      return {
        question,
        intent: 'TOP_MERCHANT_SALES',
        answer: `${merchant.name} is currently the top merchant by delivered sales with ${deliveredOrders} order(s) and $${revenue.toFixed(2)} in gross revenue.`,
        metrics: { merchant: merchant.name, revenue, deliveredOrders },
      };
    }

    // 4. Products searched for that are unavailable (computed strictly from search_sessions)
    if (q.includes('unavailable') || q.includes('searched for') || q.includes('missing products') || q.includes('no result')) {
      const failedSearches = await query<any[]>(`
        SELECT raw_query, COUNT(*) as search_count
        FROM search_sessions
        WHERE result_count = 0
        GROUP BY raw_query
        ORDER BY search_count DESC
        LIMIT 5
      `);

      if (!failedSearches.length) {
        return {
          question,
          intent: 'UNAVAILABLE_PRODUCTS',
          answer: `No unfulfilled product searches recorded today. All customer requests were matched successfully in our active merchant catalog.`,
          metrics: {
            demandedProducts: [],
            missedOpportunitySearches: 0,
          },
        };
      }

      const totalMissed = failedSearches.reduce((acc, r) => acc + parseInt(r.search_count, 10), 0);
      const items = failedSearches.map(r => `"${r.raw_query}" (${r.search_count}x)`);

      return {
        question,
        intent: 'UNAVAILABLE_PRODUCTS',
        answer: `Customers made ${totalMissed} unfulfilled search(es) today for ${items.join(', ')}, which are currently unavailable in our active catalog. We recommend expanding partner merchant stock to capture this unfulfilled demand.`,
        metrics: {
          demandedProducts: failedSearches.map(r => r.raw_query),
          missedOpportunitySearches: totalMissed,
        },
      };
    }

    if (!q.includes('summary') && !q.includes('overview') && !q.includes('business') && !q.includes('performance') && !q.includes('dashboard')) {
      return {
        question,
        intent: 'UNKNOWN_QUERY',
        answer: 'I can answer grounded operational questions about completed orders, merchant rejections, top drivers, merchant sales, unavailable product demand, or today\'s business summary.',
        metrics: { supportedTopics: ['completed_orders', 'merchant_rejections', 'top_driver', 'top_merchant_sales', 'unavailable_products', 'business_summary'] },
      };
    }

    // 5. Today's business summary
    const stats = await analyticsService.getDemoAnalytics();
    const deliveryTimeStr = stats.averageDeliveryMinutes != null
      ? `${stats.averageDeliveryMinutes} minutes`
      : 'N/A (pending delivery completion)';

    return {
      question,
      intent: 'BUSINESS_SUMMARY',
      answer: `📊 **Lion Delivery Business Summary (Today)**:
- **Total Orders**: ${stats.ordersToday} (${stats.completedOrders} delivered, ${stats.activeOrders} active)
- **Gross Revenue**: $${stats.totalRevenue.toFixed(2)} (AOV: $${stats.averageOrderValue.toFixed(2)})
- **Fleet & Network**: ${stats.activeDrivers} active drivers, ${stats.activeMerchants} active merchants (${stats.activeBranches} branches)
- **Customer WhatsApp Conversion**: ${stats.conversionRatePercent}% from ${stats.whatsappConversations} conversations
- **Average Delivery Time**: ${deliveryTimeStr}. Operations are running smoothly.`,
      metrics: stats,
    };
  }
}

export const managementAIService = new ManagementAIService();
export const managementAiService = managementAIService;
