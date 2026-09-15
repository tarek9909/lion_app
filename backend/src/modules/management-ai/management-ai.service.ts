import { query } from '../../database/db.js';
import { analyticsService } from '../analytics/analytics.service.js';
import { aiTelemetryService } from '../ai/telemetry/ai-telemetry.service.js';

export interface ManagementAIResponse {
  question: string;
  intent: string;
  answer: string;
  metrics?: any;
}

export class ManagementAIService {
  /**
   * Controlled intent router for executive management inquiries.
   * Strictly read-only, backed by MySQL aggregations.
   * NEVER generates or executes arbitrary user-supplied SQL.
   * Every fact in every answer is strictly grounded in queried metrics.
   */
  async askQuestion(question: string, dashboardUserId?: number): Promise<ManagementAIResponse> {
    const start = Date.now();
    const q = (question || '').toLowerCase().trim();

    let response: ManagementAIResponse;

    // Security guard: Reject attempts to inject SQL or extract internal schemas
    if (
      q.includes('select ') ||
      q.includes('insert ') ||
      q.includes('drop ') ||
      q.includes('delete ') ||
      q.includes('update ') ||
      q.includes('password') ||
      q.includes('system prompt') ||
      q.includes('api_key') ||
      q.includes('secret')
    ) {
      response = {
        question,
        intent: 'UNAUTHORIZED_QUERY',
        answer:
          'I am a read-only management analytics assistant. Direct database queries, schema modifications, and secret access are strictly prohibited.',
        metrics: { authorized: false },
      };
      await this.logTelemetry(question, response, Date.now() - start, dashboardUserId);
      return response;
    }

    // 1. Orders completed today
    if (
      q.includes('completed today') ||
      q.includes('delivered today') ||
      q.includes('fulfilled today') ||
      q.includes('finished today') ||
      q.includes('how many orders') ||
      q.includes('orders did we complete') ||
      q.includes('how many deliveries') ||
      q.includes('kam order tkhallas') ||
      q.includes('kam order') ||
      q.includes('كم طلب') ||
      q.includes('توصيله اليوم')
    ) {
      const stats = await analyticsService.getDemoAnalytics();

      if (stats.ordersToday === 0) {
        response = {
          question,
          intent: 'COMPLETED_ORDERS_TODAY',
          answer: 'No customer orders have been placed yet today.',
          metrics: { completed: 0, active: 0, totalRevenue: 0 },
        };
      } else {
        response = {
          question,
          intent: 'COMPLETED_ORDERS_TODAY',
          answer: `Today, Lion Delivery has completed ${stats.completedOrders} orders with ${stats.activeOrders} active orders currently in progress. Gross revenue is $${stats.totalRevenue.toFixed(2)} with an average order value of $${stats.averageOrderValue.toFixed(2)}.`,
          metrics: {
            completed: stats.completedOrders,
            active: stats.activeOrders,
            totalRevenue: stats.totalRevenue,
            averageOrderValue: stats.averageOrderValue,
          },
        };
      }
      await this.logTelemetry(question, response, Date.now() - start, dashboardUserId);
      return response;
    }

    // 2. Merchant rejections (Grounded with explicit date filter)
    if (
      q.includes('merchant rejected') ||
      q.includes('rejected the most') ||
      q.includes('merchant reject') ||
      q.includes('merchant decline') ||
      q.includes('partner refused') ||
      q.includes('kitchen refused') ||
      q.includes('ayya mat3am 3emel reject') ||
      q.includes('mat3am reject') ||
      q.includes('رفض طلبات') ||
      q.includes('أي مطعم رفض')
    ) {
      const rejections = await query<any[]>(`
        SELECT m.name, COUNT(o.id) as rejected_count
        FROM orders o
        JOIN merchants m ON m.id = o.merchant_id
        WHERE (o.status = 'MERCHANT_REJECTED' OR o.merchant_rejected_at IS NOT NULL)
          AND DATE(o.created_at) = CURRENT_DATE()
        GROUP BY m.id, m.name
        ORDER BY rejected_count DESC
        LIMIT 1
      `);

      const totalSummary = await query<any[]>(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN status = 'MERCHANT_REJECTED' OR merchant_rejected_at IS NOT NULL THEN 1 ELSE 0 END) as rejected_orders
        FROM orders
        WHERE DATE(created_at) = CURRENT_DATE()
      `);

      const totalOrders = parseInt(totalSummary[0]?.total_orders || '0', 10);
      const totalRejected = parseInt(totalSummary[0]?.rejected_orders || '0', 10);
      const acceptanceRate =
        totalOrders > 0 ? Math.round(((totalOrders - totalRejected) / totalOrders) * 100) : 100;

      if (!rejections.length || rejections[0].rejected_count === 0) {
        response = {
          question,
          intent: 'MERCHANT_REJECTIONS',
          answer: `Zero merchant rejections recorded today. All partner kitchens accepted orders with a 100% acceptance rate.`,
          metrics: {
            merchant: null,
            rejectedCount: 0,
            acceptanceRate: 100,
          },
        };
      } else {
        const name = rejections[0].name;
        const count = parseInt(rejections[0].rejected_count, 10);

        // Grounded: removed unqueried claim "due to peak kitchen load"
        response = {
          question,
          intent: 'MERCHANT_REJECTIONS',
          answer: `${name} has the highest rejections today with ${count} order(s) rejected. Overall merchant acceptance rate is ${acceptanceRate}%.`,
          metrics: {
            merchant: name,
            rejectedCount: count,
            acceptanceRate,
          },
        };
      }
      await this.logTelemetry(question, response, Date.now() - start, dashboardUserId);
      return response;
    }

    // 3. Top performing driver (Grounded with explicit date filter)
    if (
      q.includes('driver completed') ||
      q.includes('most deliveries') ||
      q.includes('best driver') ||
      q.includes('top driver') ||
      q.includes('top courier') ||
      q.includes('best captain') ||
      q.includes('min a7san driver') ||
      q.includes('a7san captain') ||
      q.includes('أفضل سائق') ||
      q.includes('افضل شوفير')
    ) {
      const topDrivers = await query<any[]>(`
        SELECT d.display_code, d.full_name_private, d.rating, COUNT(o.id) as completed_count
        FROM drivers d
        JOIN orders o ON o.driver_id = d.id AND o.status = 'DELIVERED'
        WHERE DATE(o.created_at) = CURRENT_DATE()
        GROUP BY d.id, d.display_code, d.full_name_private, d.rating
        ORDER BY completed_count DESC, d.rating DESC
        LIMIT 1
      `);

      if (!topDrivers.length || topDrivers[0].completed_count === 0) {
        // Grounded: removed unqueried claim "stationed across Saida Central"
        response = {
          question,
          intent: 'TOP_DRIVER',
          answer: `No completed driver deliveries recorded yet today.`,
          metrics: {
            driverCode: null,
            completedDeliveries: 0,
          },
        };
      } else {
        const d = topDrivers[0];
        const code = d.display_code;
        const name = d.full_name_private;
        const rating = parseFloat(d.rating).toFixed(2);
        const count = parseInt(d.completed_count, 10);

        // Grounded: removed unqueried claim "and zero delivery complaints"
        response = {
          question,
          intent: 'TOP_DRIVER',
          answer: `Driver ${code} (${name}) has completed the most deliveries today (${count} completed) with an average rating of ${rating}⭐.`,
          metrics: {
            driverCode: code,
            driverName: name,
            rating: parseFloat(rating),
            completedDeliveries: count,
          },
        };
      }
      await this.logTelemetry(question, response, Date.now() - start, dashboardUserId);
      return response;
    }

    // 4. Top merchant by sales (Grounded with explicit date filter)
    if (
      q.includes('highest sales') ||
      q.includes('top merchant') ||
      q.includes('merchant sold the most') ||
      q.includes('best performing merchant') ||
      q.includes('aktar mat3am be3') ||
      q.includes('أعلى مبيعات') ||
      q.includes('اكتر مبيعات')
    ) {
      const topMerchants = await query<any[]>(`
        SELECT m.name, COUNT(o.id) AS delivered_orders, COALESCE(SUM(o.grand_total), 0) AS revenue
        FROM merchants m
        JOIN orders o ON o.merchant_id = m.id AND o.status = 'DELIVERED'
        WHERE DATE(o.created_at) = CURRENT_DATE()
        GROUP BY m.id, m.name
        ORDER BY revenue DESC, delivered_orders DESC
        LIMIT 1
      `);

      if (!topMerchants.length) {
        response = {
          question,
          intent: 'TOP_MERCHANT_SALES',
          answer: 'There are no delivered merchant sales recorded today.',
          metrics: { merchant: null, revenue: 0, deliveredOrders: 0 },
        };
      } else {
        const merchant = topMerchants[0];
        const revenue = Number.parseFloat(merchant.revenue || '0');
        const deliveredOrders = Number.parseInt(merchant.delivered_orders || '0', 10);
        response = {
          question,
          intent: 'TOP_MERCHANT_SALES',
          answer: `${merchant.name} is currently the top merchant by delivered sales today with ${deliveredOrders} order(s) and $${revenue.toFixed(2)} in gross revenue.`,
          metrics: { merchant: merchant.name, revenue, deliveredOrders },
        };
      }
      await this.logTelemetry(question, response, Date.now() - start, dashboardUserId);
      return response;
    }

    // 5. Unavailable products demanded by customers (computed from search_sessions with date filter)
    if (
      q.includes('unavailable') ||
      q.includes('searched for') ||
      q.includes('missing products') ||
      q.includes('no result') ||
      q.includes('mech mawjoud') ||
      q.includes('غير متوفر') ||
      q.includes('طلبات ناقصة')
    ) {
      const failedSearches = await query<any[]>(`
        SELECT raw_query, COUNT(*) as search_count
        FROM search_sessions
        WHERE result_count = 0 AND DATE(created_at) = CURRENT_DATE()
        GROUP BY raw_query
        ORDER BY search_count DESC
        LIMIT 5
      `);

      if (!failedSearches.length) {
        response = {
          question,
          intent: 'UNAVAILABLE_PRODUCTS',
          answer: `No unfulfilled product searches recorded today. All customer requests were matched successfully in our active merchant catalog.`,
          metrics: {
            demandedProducts: [],
            missedOpportunitySearches: 0,
          },
        };
      } else {
        const totalMissed = failedSearches.reduce(
          (acc, r) => acc + parseInt(r.search_count, 10),
          0
        );
        const items = failedSearches.map((r) => `"${r.raw_query}" (${r.search_count}x)`);

        response = {
          question,
          intent: 'UNAVAILABLE_PRODUCTS',
          answer: `Customers made ${totalMissed} unfulfilled search(es) today for ${items.join(', ')}.`,
          metrics: {
            demandedProducts: failedSearches.map((r) => r.raw_query),
            missedOpportunitySearches: totalMissed,
          },
        };
      }
      await this.logTelemetry(question, response, Date.now() - start, dashboardUserId);
      return response;
    }

    // 6. Today's business summary (Grounded: removed unqueried claim "Operations are running smoothly")
    if (
      q.includes('summary') ||
      q.includes('overview') ||
      q.includes('business') ||
      q.includes('performance') ||
      q.includes('dashboard') ||
      q.includes('kholaset lyoum') ||
      q.includes('ملخص') ||
      q.includes('تقرير اليوم')
    ) {
      const stats = await analyticsService.getDemoAnalytics();
      const deliveryTimeStr =
        stats.averageDeliveryMinutes != null
          ? `${stats.averageDeliveryMinutes} minutes`
          : 'N/A (pending delivery completion)';

      response = {
        question,
        intent: 'BUSINESS_SUMMARY',
        answer: `📊 **Lion Delivery Business Summary (Today)**:
• **Total Orders**: ${stats.ordersToday} (${stats.completedOrders} delivered, ${stats.activeOrders} active)
• **Gross Revenue**: $${stats.totalRevenue.toFixed(2)} (AOV: $${stats.averageOrderValue.toFixed(2)})
• **Fleet & Network**: ${stats.activeDrivers} active drivers, ${stats.activeMerchants} active merchants (${stats.activeBranches} branches)
• **Customer WhatsApp Conversion**: ${stats.conversionRatePercent}% from ${stats.whatsappConversations} conversations
• **Average Delivery Time**: ${deliveryTimeStr}.`,
        metrics: stats,
      };
      await this.logTelemetry(question, response, Date.now() - start, dashboardUserId);
      return response;
    }

    // 7. Unknown / Unhandled
    response = {
      question,
      intent: 'UNKNOWN_QUERY',
      answer:
        "I can answer grounded operational questions about completed orders, merchant rejections, top drivers, merchant sales, unavailable product demand, or today's business summary.",
      metrics: {
        supportedTopics: [
          'completed_orders',
          'merchant_rejections',
          'top_driver',
          'top_merchant_sales',
          'unavailable_products',
          'business_summary',
        ],
      },
    };
    await this.logTelemetry(question, response, Date.now() - start, dashboardUserId);
    return response;
  }

  private async logTelemetry(
    question: string,
    res: ManagementAIResponse,
    latencyMs: number,
    userId?: number
  ): Promise<void> {
    await aiTelemetryService.recordInteraction({
      dashboardUserId: userId || null,
      aiContext: 'MANAGEMENT_COPILOT',
      provider: 'local_deterministic',
      model: 'controlled_router',
      interactionType: 'ANALYTICS_QUERY',
      rawInput: question,
      rawOutput: res.answer,
      detectedIntent: res.intent,
      latencyMs,
      success: res.intent !== 'UNAUTHORIZED_QUERY',
    });
  }
}

export const managementAIService = new ManagementAIService();
export const managementAiService = managementAIService;
