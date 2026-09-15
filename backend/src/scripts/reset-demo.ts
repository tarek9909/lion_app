import { pool } from '../database/db.js';
import { redis } from '../database/redis.js';
import { seedDemoData } from './seed-demo.js';

export async function resetDemo() {
  console.log('[Demo Reset] Resetting Lion Delivery demo state...');
  const conn = await pool.getConnection();

  try {
    // 1. Clear test idempotency keys, webhooks, and media records if they exist
    try {
      await conn.query(`DELETE FROM integration_webhook_events`);
    } catch {
      // table might be empty or not yet queried
    }
    try {
      await conn.query(`DELETE FROM idempotency_keys`);
    } catch {
      // table might be empty or not yet queried
    }
    try {
    await conn.query(`DELETE FROM message_media`);
    } catch {
      // table might be empty or not yet queried
    }

    // 2. Delete active demo orders created during tests/rehearsal (keep ORD-DEMO-001..004)
    await conn.query(`
      DELETE FROM delivery_messages WHERE delivery_channel_id IN (
        SELECT id FROM delivery_channels WHERE order_id IN (
          SELECT id FROM orders WHERE order_number NOT LIKE 'ORD-DEMO-%'
        )
      )
    `);
    await conn.query(`
      DELETE FROM delivery_channels WHERE order_id IN (
        SELECT id FROM orders WHERE order_number NOT LIKE 'ORD-DEMO-%'
      )
    `);
    await conn.query(`
      DELETE FROM driver_assignments WHERE order_id IN (
        SELECT id FROM orders WHERE order_number NOT LIKE 'ORD-DEMO-%'
      )
    `);
    await conn.query(`
      DELETE FROM driver_offers WHERE order_id IN (
        SELECT id FROM orders WHERE order_number NOT LIKE 'ORD-DEMO-%'
      )
    `);
    await conn.query(`
      DELETE FROM order_items WHERE order_id IN (
        SELECT id FROM orders WHERE order_number NOT LIKE 'ORD-DEMO-%'
      )
    `);
    await conn.query(`
      DELETE FROM order_status_history WHERE order_id IN (
        SELECT id FROM orders WHERE order_number NOT LIKE 'ORD-DEMO-%'
      )
    `);
    await conn.query(`
      DELETE FROM order_reviews WHERE order_id IN (
        SELECT id FROM orders WHERE order_number NOT LIKE 'ORD-DEMO-%'
      )
    `);
    await conn.query(`
      DELETE FROM orders WHERE order_number NOT LIKE 'ORD-DEMO-%'
    `);

    // 3. Clear carts & cart items
    await conn.query(`DELETE FROM cart_item_addons`);
    await conn.query(`DELETE FROM cart_items`);
    await conn.query(`DELETE FROM carts`);

    // 4. Clear conversation messages & state
    await conn.query(`DELETE FROM conversation_state`);
    await conn.query(`DELETE FROM messages`);
    await conn.query(`DELETE FROM conversations`);
    await conn.query(`DELETE FROM driver_locations`);

    // 5. Reset drivers to available
    await conn.query(`
      UPDATE drivers SET availability_status='AVAILABLE', status='ACTIVE', current_order_count=0
    `);

    // 6. Reset merchants & products and deduplicate demo entities (G-055)
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // Deduplicate merchants
    await conn.query(`
      UPDATE merchant_branches mb 
      JOIN merchants m1 ON mb.merchant_id = m1.id 
      JOIN merchants m2 ON m1.name = m2.name AND m2.id < m1.id 
      SET mb.merchant_id = m2.id
    `);
    await conn.query(`
      DELETE m1 FROM merchants m1 
      JOIN merchants m2 ON m1.name = m2.name AND m1.id > m2.id
    `);

    // Deduplicate branches
    await conn.query(`
      UPDATE merchant_products mp 
      JOIN merchant_branches mb1 ON mp.merchant_branch_id = mb1.id 
      JOIN merchant_branches mb2 ON mb1.name = mb2.name AND mb1.merchant_id = mb2.merchant_id AND mb2.id < mb1.id 
      SET mp.merchant_branch_id = mb2.id
    `);
    await conn.query(`
      DELETE mb1 FROM merchant_branches mb1 
      JOIN merchant_branches mb2 ON mb1.name = mb2.name AND mb1.merchant_id = mb2.merchant_id AND mb1.id > mb2.id
    `);

    // Deduplicate products
    await conn.query(`
      UPDATE merchant_products mp 
      JOIN products p1 ON mp.product_id = p1.id 
      JOIN products p2 ON p1.canonical_name = p2.canonical_name AND p2.id < p1.id 
      SET mp.product_id = p2.id
    `);
    await conn.query(`
      UPDATE product_variants pv 
      JOIN products p1 ON pv.product_id = p1.id 
      JOIN products p2 ON p1.canonical_name = p2.canonical_name AND p2.id < p1.id 
      SET pv.product_id = p2.id
    `);
    await conn.query(`
      UPDATE product_aliases pa 
      JOIN products p1 ON pa.product_id = p1.id 
      JOIN products p2 ON p1.canonical_name = p2.canonical_name AND p2.id < p1.id 
      SET pa.product_id = p2.id
    `);
    await conn.query(`
      DELETE p1 FROM products p1 
      JOIN products p2 ON p1.canonical_name = p2.canonical_name AND p1.id > p2.id
    `);

    // Deduplicate merchant products
    await conn.query(`
      DELETE mp1 FROM merchant_products mp1 
      JOIN merchant_products mp2 ON mp1.merchant_branch_id = mp2.merchant_branch_id AND mp1.product_id = mp2.product_id AND mp1.id > mp2.id
    `);

    // Deduplicate customers and addresses
    await conn.query(`
      DELETE FROM customer_addresses 
      WHERE customer_id NOT IN (SELECT id FROM customers WHERE whatsapp_number IN ('96170111222', '96171333444', '96176555666'))
    `);
    await conn.query(`
      DELETE a1 FROM customer_addresses a1 
      JOIN customer_addresses a2 ON a1.customer_id = a2.customer_id AND a1.label = a2.label AND a1.id > a2.id
    `);
    await conn.query(`
      DELETE c1 FROM customers c1 
      JOIN customers c2 ON c1.whatsapp_number = c2.whatsapp_number AND c1.id > c2.id
    `);

    // Deduplicate drivers
    await conn.query(`
      DELETE d1 FROM drivers d1 
      JOIN drivers d2 ON d1.display_code = d2.display_code AND d1.id > d2.id
    `);

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    await conn.query(`UPDATE merchants SET accepts_orders=1, status='ACTIVE'`);
    await conn.query(`UPDATE merchant_branches SET accepts_orders=1, status='ACTIVE'`);
    await conn.query(`UPDATE merchant_products SET is_available=1, status='ACTIVE'`);

    // 7. Clear redis memory/cache
    try {
      await redis.flushAll();
    } catch (redisErr) {
      console.warn('[Demo Reset] Redis flush warning:', redisErr);
    }

    // 8. Re-apply seeds
    await seedDemoData();

    // 9. Post-reset Baseline Invariant Assertions - Exact Counts (G-048, G-055)
    const [merchants]: any = await conn.query(`SELECT COUNT(*) as count FROM merchants WHERE status='ACTIVE'`);
    const [branches]: any = await conn.query(`SELECT COUNT(*) as count FROM merchant_branches WHERE status='ACTIVE'`);
    const [products]: any = await conn.query(`SELECT COUNT(*) as count FROM products WHERE status='ACTIVE'`);
    const [merchantProducts]: any = await conn.query(`SELECT COUNT(*) as count FROM merchant_products WHERE is_available=1`);
    const [availableDrivers]: any = await conn.query(`SELECT COUNT(*) as count FROM drivers WHERE availability_status='AVAILABLE' AND status='ACTIVE'`);
    const [deliveredOrders]: any = await conn.query(`SELECT COUNT(*) as count FROM orders WHERE order_number LIKE 'ORD-DEMO-%' AND status='DELIVERED'`);
    const [activeOrders]: any = await conn.query(`SELECT COUNT(*) as count FROM orders WHERE status NOT IN ('DELIVERED', 'CANCELLED')`);
    const [activeCarts]: any = await conn.query(`SELECT COUNT(*) as count FROM carts WHERE status='ACTIVE'`);
    const [addresses]: any = await conn.query(`SELECT COUNT(*) as count FROM customer_addresses WHERE status='ACTIVE'`);
    const [adminUser]: any = await conn.query(`SELECT id, password_hash FROM users WHERE email='admin@liondelivery.com' LIMIT 1`);

    console.log('[Demo Reset Assertions (Exact)]', {
      merchants: merchants[0].count,
      branches: branches[0].count,
      products: products[0].count,
      merchantProducts: merchantProducts[0].count,
      availableDrivers: availableDrivers[0].count,
      deliveredOrders: deliveredOrders[0].count,
      activeOrders: activeOrders[0].count,
      activeCarts: activeCarts[0].count,
      addresses: addresses[0].count,
      adminExists: adminUser.length > 0,
    });

    if (merchants[0].count !== 4) {
      throw new Error(`Assertion failed: Expected exactly 4 active merchants, got ${merchants[0].count}`);
    }
    if (branches[0].count !== 4) {
      throw new Error(`Assertion failed: Expected exactly 4 active branches, got ${branches[0].count}`);
    }
    if (products[0].count !== 16) {
      throw new Error(`Assertion failed: Expected exactly 16 active products, got ${products[0].count}`);
    }
    if (merchantProducts[0].count !== 18) {
      throw new Error(`Assertion failed: Expected exactly 18 available merchant products, got ${merchantProducts[0].count}`);
    }
    if (availableDrivers[0].count !== 3) {
      throw new Error(`Assertion failed: Expected exactly 3 available drivers, got ${availableDrivers[0].count}`);
    }
    if (deliveredOrders[0].count !== 4) {
      throw new Error(`Assertion failed: Expected exactly 4 baseline delivered orders, got ${deliveredOrders[0].count}`);
    }
    if (activeOrders[0].count !== 0) {
      throw new Error(`Assertion failed: Expected 0 active orders after reset, got ${activeOrders[0].count}`);
    }
    if (activeCarts[0].count !== 0) {
      throw new Error(`Assertion failed: Expected 0 active carts after reset, got ${activeCarts[0].count}`);
    }
    if (addresses[0].count !== 4) {
      throw new Error(`Assertion failed: Expected exactly 4 active customer addresses, got ${addresses[0].count}`);
    }
    if (adminUser.length === 0 || !adminUser[0].password_hash?.includes(':')) {
      throw new Error(`Assertion failed: Admin user missing or password not hashed with PBKDF2 salt`);
    }

    console.log('[Demo Reset] All exact baseline invariant assertions PASSED!');
    console.log('[Demo Reset] Demo state successfully restored to pristine baseline!');
  } catch (error) {
    console.error('[Demo Reset] Error resetting demo state:', error);
    throw error;
  } finally {
    conn.release();
  }
}

if (process.argv[1]?.endsWith('reset-demo.ts') || process.argv[1]?.endsWith('reset-demo.js')) {
  resetDemo()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
