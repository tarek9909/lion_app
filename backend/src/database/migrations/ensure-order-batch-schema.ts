import { execute, query } from '../db.js';

type Row = { count?: number; COLUMN_NAME?: string; INDEX_NAME?: string; CONSTRAINT_NAME?: string };

async function exists(sql: string, params: any[]): Promise<boolean> {
  const rows = await query<Row[]>(sql, params);
  return Number(rows[0]?.count || 0) > 0;
}

async function tableExists(tableName: string): Promise<boolean> {
  return exists(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName],
  );
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  return exists(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
}

async function indexExists(tableName: string, indexName: string): Promise<boolean> {
  return exists(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName],
  );
}

async function foreignKeyExists(tableName: string, constraintName: string): Promise<boolean> {
  return exists(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [tableName, constraintName],
  );
}

async function addColumnIfMissing(tableName: string, columnName: string, definition: string): Promise<void> {
  if (!(await columnExists(tableName, columnName))) {
    await execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

async function addIndexIfMissing(tableName: string, indexName: string, definition: string): Promise<void> {
  if (!(await indexExists(tableName, indexName))) {
    await execute(`ALTER TABLE \`${tableName}\` ADD ${definition}`);
  }
}

async function addForeignKeyIfMissing(tableName: string, constraintName: string, definition: string): Promise<void> {
  if (!(await foreignKeyExists(tableName, constraintName))) {
    await execute(`ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${constraintName}\` ${definition}`);
  }
}

/**
 * Adds the address-draft and multi-merchant order-batch schema used by the
 * cart and order services. MariaDB 10.4 does not support ADD COLUMN IF NOT
 * EXISTS, so every alteration is guarded by an INFORMATION_SCHEMA check.
 */
export async function ensureOrderBatchSchema(): Promise<void> {
  if (!(await tableExists('conversation_address_drafts'))) {
    await execute(`
      CREATE TABLE conversation_address_drafts (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        conversation_id BIGINT UNSIGNED NOT NULL,
        inbound_message_id BIGINT UNSIGNED NULL,
        raw_address TEXT NULL,
        safe_summary VARCHAR(500) NULL,
        area_name VARCHAR(160) NULL,
        validation_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        delivery_zone_id BIGINT UNSIGNED NULL,
        save_consent VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        expires_at TIMESTAMP(3) NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_conversation_address_drafts_public_id (public_id),
        KEY idx_conversation_address_drafts_conversation (conversation_id, created_at),
        CONSTRAINT fk_conversation_address_drafts_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        CONSTRAINT fk_conversation_address_drafts_message FOREIGN KEY (inbound_message_id) REFERENCES messages(id) ON DELETE SET NULL,
        CONSTRAINT fk_conversation_address_drafts_zone FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
  }

  if (!(await tableExists('order_batches'))) {
    await execute(`
      CREATE TABLE order_batches (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        customer_id BIGINT UNSIGNED NOT NULL,
        conversation_id BIGINT UNSIGNED NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'REVIEW',
        payment_policy VARCHAR(40) NOT NULL DEFAULT 'SEPARATE_CASH',
        shared_address_id BIGINT UNSIGNED NULL,
        idempotency_key VARCHAR(255) NOT NULL,
        summary_revision INT UNSIGNED NOT NULL DEFAULT 1,
        confirmed_at TIMESTAMP(3) NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_order_batches_public_id (public_id),
        UNIQUE KEY uq_order_batches_idempotency (idempotency_key),
        KEY idx_order_batches_customer (customer_id, status),
        CONSTRAINT fk_order_batches_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        CONSTRAINT fk_order_batches_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
        CONSTRAINT fk_order_batches_address FOREIGN KEY (shared_address_id) REFERENCES customer_addresses(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
  }

  if (!(await tableExists('order_batch_children'))) {
    await execute(`
      CREATE TABLE order_batch_children (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        order_batch_id BIGINT UNSIGNED NOT NULL,
        cart_id BIGINT UNSIGNED NOT NULL,
        merchant_id BIGINT UNSIGNED NOT NULL,
        merchant_branch_id BIGINT UNSIGNED NOT NULL,
        customer_address_id BIGINT UNSIGNED NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'REVIEW',
        confirmation_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        quoted_subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        quoted_delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        quoted_tax_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        quoted_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        quoted_eta_minutes INT UNSIGNED NULL,
        idempotency_key VARCHAR(255) NOT NULL,
        order_id BIGINT UNSIGNED NULL,
        failure_reason VARCHAR(1000) NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_order_batch_children_public_id (public_id),
        UNIQUE KEY uq_order_batch_children_batch_branch (order_batch_id, merchant_branch_id),
        UNIQUE KEY uq_order_batch_children_cart (cart_id),
        UNIQUE KEY uq_order_batch_children_idempotency (idempotency_key),
        UNIQUE KEY uq_order_batch_children_order (order_id),
        KEY idx_order_batch_children_batch (order_batch_id, status),
        CONSTRAINT fk_order_batch_children_batch FOREIGN KEY (order_batch_id) REFERENCES order_batches(id) ON DELETE CASCADE,
        CONSTRAINT fk_order_batch_children_cart FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE RESTRICT,
        CONSTRAINT fk_order_batch_children_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT,
        CONSTRAINT fk_order_batch_children_branch FOREIGN KEY (merchant_branch_id) REFERENCES merchant_branches(id) ON DELETE RESTRICT,
        CONSTRAINT fk_order_batch_children_address FOREIGN KEY (customer_address_id) REFERENCES customer_addresses(id) ON DELETE SET NULL,
        CONSTRAINT fk_order_batch_children_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
  }

  await addColumnIfMissing('carts', 'order_batch_id', 'BIGINT UNSIGNED NULL');
  await addIndexIfMissing('carts', 'idx_carts_order_batch', 'KEY `idx_carts_order_batch` (`order_batch_id`)');
  await addForeignKeyIfMissing(
    'carts',
    'fk_carts_order_batch',
    'FOREIGN KEY (`order_batch_id`) REFERENCES `order_batches` (`id`) ON DELETE SET NULL',
  );

  await addColumnIfMissing('orders', 'order_batch_id', 'BIGINT UNSIGNED NULL');
  await addIndexIfMissing('orders', 'idx_orders_order_batch', 'KEY `idx_orders_order_batch` (`order_batch_id`)');
  await addForeignKeyIfMissing(
    'orders',
    'fk_orders_order_batch',
    'FOREIGN KEY (`order_batch_id`) REFERENCES `order_batches` (`id`) ON DELETE SET NULL',
  );
}
