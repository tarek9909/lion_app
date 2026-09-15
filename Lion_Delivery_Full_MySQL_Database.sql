-- =====================================================================
-- Lion Delivery
-- Full MySQL Database Schema
-- Target: MySQL 8.0+
-- Backend: Node.js + TypeScript
-- Dashboard: React + Vite + TypeScript
-- Purpose: WhatsApp-first AI-assisted delivery operations platform
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS lion_delivery
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE lion_delivery;

-- =====================================================================
-- 1. IDENTITY, ACCESS CONTROL, SESSIONS
-- =====================================================================

CREATE TABLE roles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(80) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NULL,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB;

CREATE TABLE permissions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(120) NOT NULL,
    module_name VARCHAR(80) NOT NULL,
    name VARCHAR(160) NOT NULL,
    description VARCHAR(500) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_permissions_code (code),
    KEY idx_permissions_module (module_name)
) ENGINE=InnoDB;

CREATE TABLE users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    full_name VARCHAR(180) NOT NULL,
    email VARCHAR(190) NULL,
    username VARCHAR(120) NULL,
    phone VARCHAR(40) NULL,
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    preferred_language VARCHAR(20) NULL,
    last_login_at TIMESTAMP(3) NULL,
    password_changed_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_public_id (public_id),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_username (username),
    KEY idx_users_status (status)
) ENGINE=InnoDB;

CREATE TABLE user_roles (
    user_id BIGINT UNSIGNED NOT NULL,
    role_id BIGINT UNSIGNED NOT NULL,
    assigned_by BIGINT UNSIGNED NULL,
    assigned_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
    role_id BIGINT UNSIGNED NOT NULL,
    permission_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    refresh_token_hash VARCHAR(255) NOT NULL,
    ip_address VARCHAR(64) NULL,
    user_agent VARCHAR(1000) NULL,
    device_name VARCHAR(255) NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    revoked_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_sessions_public_id (public_id),
    KEY idx_user_sessions_user (user_id),
    KEY idx_user_sessions_expires (expires_at),
    CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_merchant_scopes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    merchant_id BIGINT UNSIGNED NULL,
    merchant_branch_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_user_merchant_scopes_user (user_id),
    CONSTRAINT fk_user_merchant_scopes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 2. CUSTOMERS, PREFERENCES, TAGS, ADDRESSES
-- =====================================================================

CREATE TABLE customers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    whatsapp_number VARCHAR(40) NOT NULL,
    display_name VARCHAR(180) NULL,
    preferred_language VARCHAR(20) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    default_address_id BIGINT UNSIGNED NULL,
    first_order_at TIMESTAMP(3) NULL,
    last_order_at TIMESTAMP(3) NULL,
    total_completed_orders INT UNSIGNED NOT NULL DEFAULT 0,
    total_cancelled_orders INT UNSIGNED NOT NULL DEFAULT 0,
    lifetime_spend DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    internal_notes TEXT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_customers_public_id (public_id),
    UNIQUE KEY uq_customers_whatsapp_number (whatsapp_number),
    KEY idx_customers_status (status),
    KEY idx_customers_last_order (last_order_at)
) ENGINE=InnoDB;

CREATE TABLE customer_preferences (
    customer_id BIGINT UNSIGNED NOT NULL,
    preferred_language VARCHAR(20) NULL,
    default_search_preference VARCHAR(40) NULL,
    dietary_preferences JSON NULL,
    excluded_ingredients JSON NULL,
    favorite_cuisines JSON NULL,
    allow_promotions TINYINT(1) NOT NULL DEFAULT 1,
    allow_driver_call TINYINT(1) NOT NULL DEFAULT 1,
    allow_call_recording TINYINT(1) NOT NULL DEFAULT 0,
    allow_ai_training TINYINT(1) NOT NULL DEFAULT 0,
    ai_training_consent_at TIMESTAMP(3) NULL,
    ai_training_consent_source VARCHAR(80) NULL,
    delivery_landmarks JSON NULL,
    special_instructions JSON NULL,
    memory_items_json JSON NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (customer_id),
    CONSTRAINT fk_customer_preferences_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE customer_addresses (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    label VARCHAR(80) NOT NULL,
    formatted_address VARCHAR(500) NULL,
    area_name VARCHAR(160) NULL,
    street_name VARCHAR(160) NULL,
    building VARCHAR(160) NULL,
    floor VARCHAR(60) NULL,
    apartment VARCHAR(60) NULL,
    landmark VARCHAR(255) NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    delivery_notes TEXT NULL,
    entrance_photo_url VARCHAR(1200) NULL,
    voice_note_url VARCHAR(1200) NULL,
    voice_transcript TEXT NULL,
    contact_name VARCHAR(180) NULL,
    contact_phone VARCHAR(40) NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_customer_addresses_public_id (public_id),
    KEY idx_customer_addresses_customer (customer_id),
    KEY idx_customer_addresses_location (latitude, longitude),
    CONSTRAINT fk_customer_addresses_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE customer_tags (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(80) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(255) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_customer_tags_code (code)
) ENGINE=InnoDB;

CREATE TABLE customer_tag_assignments (
    customer_id BIGINT UNSIGNED NOT NULL,
    tag_id BIGINT UNSIGNED NOT NULL,
    assigned_by BIGINT UNSIGNED NULL,
    assigned_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (customer_id, tag_id),
    CONSTRAINT fk_customer_tag_assignments_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_tag_assignments_tag FOREIGN KEY (tag_id) REFERENCES customer_tags(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_tag_assignments_user FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE customer_favorites (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id BIGINT UNSIGNED NOT NULL,
    favorite_type VARCHAR(30) NOT NULL,
    merchant_id BIGINT UNSIGNED NULL,
    product_id BIGINT UNSIGNED NULL,
    customer_address_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_customer_favorites_customer (customer_id),
    CONSTRAINT fk_customer_favorites_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_favorites_address FOREIGN KEY (customer_address_id) REFERENCES customer_addresses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 3. DELIVERY ZONES, MERCHANTS, BRANCHES, HOURS
-- =====================================================================

CREATE TABLE delivery_zones (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    name VARCHAR(160) NOT NULL,
    code VARCHAR(80) NOT NULL,
    description VARCHAR(500) NULL,
    zone_type VARCHAR(30) NOT NULL DEFAULT 'AREA',
    boundary_json JSON NULL,
    center_latitude DECIMAL(10,7) NULL,
    center_longitude DECIMAL(10,7) NULL,
    radius_km DECIMAL(8,2) NULL,
    base_delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    minimum_order DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_delivery_zones_public_id (public_id),
    UNIQUE KEY uq_delivery_zones_code (code),
    KEY idx_delivery_zones_status (status)
) ENGINE=InnoDB;

CREATE TABLE merchants (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    name VARCHAR(180) NOT NULL,
    legal_name VARCHAR(220) NULL,
    merchant_type VARCHAR(40) NOT NULL,
    description TEXT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    rating DECIMAL(3,2) NULL,
    commission_type VARCHAR(30) NOT NULL DEFAULT 'PERCENTAGE',
    commission_value DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
    default_preparation_minutes INT UNSIGNED NULL,
    accepts_orders TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_merchants_public_id (public_id),
    KEY idx_merchants_type (merchant_type),
    KEY idx_merchants_status (status),
    KEY idx_merchants_rating (rating)
) ENGINE=InnoDB;

CREATE TABLE merchant_branches (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    merchant_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(180) NOT NULL,
    phone VARCHAR(40) NULL,
    whatsapp_number VARCHAR(40) NULL,
    email VARCHAR(190) NULL,
    address VARCHAR(500) NULL,
    area_name VARCHAR(160) NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    accepts_orders TINYINT(1) NOT NULL DEFAULT 1,
    preparation_minutes INT UNSIGNED NULL,
    current_load_level VARCHAR(30) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_merchant_branches_public_id (public_id),
    KEY idx_merchant_branches_merchant (merchant_id),
    KEY idx_merchant_branches_status (status),
    KEY idx_merchant_branches_location (latitude, longitude),
    CONSTRAINT fk_merchant_branches_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE merchant_contacts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id BIGINT UNSIGNED NOT NULL,
    merchant_branch_id BIGINT UNSIGNED NULL,
    contact_name VARCHAR(180) NOT NULL,
    role_title VARCHAR(120) NULL,
    phone VARCHAR(40) NULL,
    whatsapp_number VARCHAR(40) NULL,
    email VARCHAR(190) NULL,
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_merchant_contacts_merchant (merchant_id),
    CONSTRAINT fk_merchant_contacts_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
    CONSTRAINT fk_merchant_contacts_branch FOREIGN KEY (merchant_branch_id) REFERENCES merchant_branches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE merchant_operating_hours (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_branch_id BIGINT UNSIGNED NOT NULL,
    day_of_week TINYINT UNSIGNED NOT NULL,
    open_time TIME NULL,
    close_time TIME NULL,
    is_closed TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_merchant_hours_branch_day (merchant_branch_id, day_of_week),
    CONSTRAINT fk_merchant_hours_branch FOREIGN KEY (merchant_branch_id) REFERENCES merchant_branches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE merchant_special_hours (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_branch_id BIGINT UNSIGNED NOT NULL,
    special_date DATE NOT NULL,
    open_time TIME NULL,
    close_time TIME NULL,
    is_closed TINYINT(1) NOT NULL DEFAULT 0,
    note VARCHAR(255) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_merchant_special_hours (merchant_branch_id, special_date),
    CONSTRAINT fk_merchant_special_hours_branch FOREIGN KEY (merchant_branch_id) REFERENCES merchant_branches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE merchant_branch_delivery_zones (
    merchant_branch_id BIGINT UNSIGNED NOT NULL,
    delivery_zone_id BIGINT UNSIGNED NOT NULL,
    delivery_fee_override DECIMAL(12,2) NULL,
    minimum_order_override DECIMAL(12,2) NULL,
    estimated_minutes INT UNSIGNED NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (merchant_branch_id, delivery_zone_id),
    CONSTRAINT fk_branch_zones_branch FOREIGN KEY (merchant_branch_id) REFERENCES merchant_branches(id) ON DELETE CASCADE,
    CONSTRAINT fk_branch_zones_zone FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE merchant_status_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_id BIGINT UNSIGNED NOT NULL,
    merchant_branch_id BIGINT UNSIGNED NULL,
    previous_status VARCHAR(30) NULL,
    new_status VARCHAR(30) NOT NULL,
    reason VARCHAR(500) NULL,
    changed_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_merchant_status_history_merchant (merchant_id, created_at),
    CONSTRAINT fk_merchant_status_history_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
    CONSTRAINT fk_merchant_status_history_branch FOREIGN KEY (merchant_branch_id) REFERENCES merchant_branches(id) ON DELETE CASCADE,
    CONSTRAINT fk_merchant_status_history_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- delayed FKs now that merchants / branches exist
ALTER TABLE user_merchant_scopes
    ADD CONSTRAINT fk_user_merchant_scopes_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_user_merchant_scopes_branch
        FOREIGN KEY (merchant_branch_id) REFERENCES merchant_branches(id) ON DELETE CASCADE;

-- =====================================================================
-- 4. CATALOG, PRODUCTS, VARIANTS, ADD-ONS, PRICING, AVAILABILITY
-- =====================================================================

CREATE TABLE categories (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    parent_id BIGINT UNSIGNED NULL,
    name_en VARCHAR(180) NOT NULL,
    name_ar VARCHAR(180) NULL,
    slug VARCHAR(190) NOT NULL,
    description VARCHAR(500) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_categories_public_id (public_id),
    UNIQUE KEY uq_categories_slug (slug),
    KEY idx_categories_parent (parent_id),
    CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE products (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    category_id BIGINT UNSIGNED NULL,
    canonical_name VARCHAR(220) NOT NULL,
    name_en VARCHAR(220) NULL,
    name_ar VARCHAR(220) NULL,
    description TEXT NULL,
    brand VARCHAR(160) NULL,
    product_type VARCHAR(40) NOT NULL DEFAULT 'STANDARD',
    default_unit VARCHAR(40) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_products_public_id (public_id),
    KEY idx_products_category (category_id),
    KEY idx_products_brand (brand),
    KEY idx_products_status (status),
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE product_aliases (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id BIGINT UNSIGNED NOT NULL,
    alias VARCHAR(255) NOT NULL,
    language_code VARCHAR(20) NULL,
    alias_type VARCHAR(30) NOT NULL DEFAULT 'SEARCH',
    weight DECIMAL(6,3) NOT NULL DEFAULT 1.000,
    source VARCHAR(50) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_product_aliases_product (product_id),
    KEY idx_product_aliases_alias (alias),
    CONSTRAINT fk_product_aliases_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE product_images (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id BIGINT UNSIGNED NOT NULL,
    url VARCHAR(1200) NOT NULL,
    alt_text VARCHAR(255) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_product_images_product (product_id),
    CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE product_variants (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(180) NOT NULL,
    sku VARCHAR(120) NULL,
    size_label VARCHAR(100) NULL,
    unit_value DECIMAL(10,3) NULL,
    unit_name VARCHAR(40) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_product_variants_public_id (public_id),
    UNIQUE KEY uq_product_variants_sku (sku),
    KEY idx_product_variants_product (product_id),
    CONSTRAINT fk_product_variants_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE product_addons (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    name_en VARCHAR(180) NOT NULL,
    name_ar VARCHAR(180) NULL,
    addon_group VARCHAR(120) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_product_addons_public_id (public_id)
) ENGINE=InnoDB;

CREATE TABLE product_allowed_addons (
    product_id BIGINT UNSIGNED NOT NULL,
    addon_id BIGINT UNSIGNED NOT NULL,
    is_required TINYINT(1) NOT NULL DEFAULT 0,
    min_quantity INT UNSIGNED NOT NULL DEFAULT 0,
    max_quantity INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (product_id, addon_id),
    CONSTRAINT fk_product_allowed_addons_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_allowed_addons_addon FOREIGN KEY (addon_id) REFERENCES product_addons(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE merchant_products (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    merchant_branch_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    merchant_product_name VARCHAR(220) NOT NULL,
    merchant_sku VARCHAR(120) NULL,
    description TEXT NULL,
    base_price DECIMAL(12,2) NOT NULL,
    discount_price DECIMAL(12,2) NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    is_available TINYINT(1) NOT NULL DEFAULT 1,
    is_featured TINYINT(1) NOT NULL DEFAULT 0,
    preparation_minutes INT UNSIGNED NULL,
    stock_quantity DECIMAL(12,3) NULL,
    stock_unit VARCHAR(40) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_merchant_products_public_id (public_id),
    UNIQUE KEY uq_merchant_products_branch_sku (merchant_branch_id, merchant_sku),
    KEY idx_merchant_products_branch (merchant_branch_id),
    KEY idx_merchant_products_product (product_id),
    KEY idx_merchant_products_available (merchant_branch_id, is_available, status),
    CONSTRAINT fk_merchant_products_branch FOREIGN KEY (merchant_branch_id) REFERENCES merchant_branches(id) ON DELETE CASCADE,
    CONSTRAINT fk_merchant_products_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE merchant_product_variants (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_product_id BIGINT UNSIGNED NOT NULL,
    product_variant_id BIGINT UNSIGNED NOT NULL,
    price_delta DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    fixed_price DECIMAL(12,2) NULL,
    is_available TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_merchant_product_variants (merchant_product_id, product_variant_id),
    CONSTRAINT fk_merchant_product_variants_mp FOREIGN KEY (merchant_product_id) REFERENCES merchant_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_merchant_product_variants_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE merchant_product_addons (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_product_id BIGINT UNSIGNED NOT NULL,
    addon_id BIGINT UNSIGNED NOT NULL,
    price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    is_available TINYINT(1) NOT NULL DEFAULT 1,
    max_quantity INT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_merchant_product_addons (merchant_product_id, addon_id),
    CONSTRAINT fk_merchant_product_addons_mp FOREIGN KEY (merchant_product_id) REFERENCES merchant_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_merchant_product_addons_addon FOREIGN KEY (addon_id) REFERENCES product_addons(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE merchant_product_price_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_product_id BIGINT UNSIGNED NOT NULL,
    previous_price DECIMAL(12,2) NULL,
    new_price DECIMAL(12,2) NOT NULL,
    previous_discount_price DECIMAL(12,2) NULL,
    new_discount_price DECIMAL(12,2) NULL,
    changed_by BIGINT UNSIGNED NULL,
    reason VARCHAR(500) NULL,
    effective_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_mp_price_history_product (merchant_product_id, effective_at),
    CONSTRAINT fk_mp_price_history_product FOREIGN KEY (merchant_product_id) REFERENCES merchant_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_mp_price_history_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE merchant_product_availability_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_product_id BIGINT UNSIGNED NOT NULL,
    previous_available TINYINT(1) NULL,
    new_available TINYINT(1) NOT NULL,
    reason VARCHAR(500) NULL,
    changed_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_mp_availability_history_product (merchant_product_id, created_at),
    CONSTRAINT fk_mp_availability_history_product FOREIGN KEY (merchant_product_id) REFERENCES merchant_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_mp_availability_history_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE product_embeddings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id BIGINT UNSIGNED NOT NULL,
    merchant_product_id BIGINT UNSIGNED NULL,
    model_name VARCHAR(120) NOT NULL,
    embedding JSON NOT NULL,
    content_hash CHAR(64) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_product_embeddings (product_id, merchant_product_id, model_name),
    CONSTRAINT fk_product_embeddings_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_embeddings_mp FOREIGN KEY (merchant_product_id) REFERENCES merchant_products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE customer_favorites
    ADD CONSTRAINT fk_customer_favorites_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_customer_favorites_product
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- =====================================================================
-- 5. PROMOTIONS, VOUCHERS, LOYALTY
-- =====================================================================

CREATE TABLE promotions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    code VARCHAR(80) NULL,
    name VARCHAR(180) NOT NULL,
    description TEXT NULL,
    promotion_type VARCHAR(40) NOT NULL,
    discount_value DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    max_discount_amount DECIMAL(12,2) NULL,
    minimum_order_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    starts_at TIMESTAMP(3) NULL,
    ends_at TIMESTAMP(3) NULL,
    max_total_uses INT UNSIGNED NULL,
    max_uses_per_customer INT UNSIGNED NULL,
    first_order_only TINYINT(1) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_promotions_public_id (public_id),
    UNIQUE KEY uq_promotions_code (code),
    KEY idx_promotions_status_dates (status, starts_at, ends_at),
    CONSTRAINT fk_promotions_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE promotion_merchants (
    promotion_id BIGINT UNSIGNED NOT NULL,
    merchant_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (promotion_id, merchant_id),
    CONSTRAINT fk_promotion_merchants_promo FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
    CONSTRAINT fk_promotion_merchants_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE promotion_branches (
    promotion_id BIGINT UNSIGNED NOT NULL,
    merchant_branch_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (promotion_id, merchant_branch_id),
    CONSTRAINT fk_promotion_branches_promo FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
    CONSTRAINT fk_promotion_branches_branch FOREIGN KEY (merchant_branch_id) REFERENCES merchant_branches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE promotion_products (
    promotion_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (promotion_id, product_id),
    CONSTRAINT fk_promotion_products_promo FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
    CONSTRAINT fk_promotion_products_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE promotion_categories (
    promotion_id BIGINT UNSIGNED NOT NULL,
    category_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (promotion_id, category_id),
    CONSTRAINT fk_promotion_categories_promo FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
    CONSTRAINT fk_promotion_categories_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE promotion_customers (
    promotion_id BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (promotion_id, customer_id),
    CONSTRAINT fk_promotion_customers_promo FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
    CONSTRAINT fk_promotion_customers_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE promotion_delivery_zones (
    promotion_id BIGINT UNSIGNED NOT NULL,
    delivery_zone_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (promotion_id, delivery_zone_id),
    CONSTRAINT fk_promotion_zones_promo FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
    CONSTRAINT fk_promotion_zones_zone FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE loyalty_accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id BIGINT UNSIGNED NOT NULL,
    points_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    lifetime_points_earned DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    lifetime_points_redeemed DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    tier_code VARCHAR(40) NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_loyalty_accounts_customer (customer_id),
    CONSTRAINT fk_loyalty_accounts_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE loyalty_transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    loyalty_account_id BIGINT UNSIGNED NOT NULL,
    transaction_type VARCHAR(30) NOT NULL,
    points DECIMAL(14,2) NOT NULL,
    reference_type VARCHAR(40) NULL,
    reference_id BIGINT UNSIGNED NULL,
    note VARCHAR(500) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_loyalty_transactions_account (loyalty_account_id, created_at),
    CONSTRAINT fk_loyalty_transactions_account FOREIGN KEY (loyalty_account_id) REFERENCES loyalty_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 6. CONVERSATIONS, WHATSAPP, MEDIA, AI, SEARCH HISTORY
-- =====================================================================

CREATE TABLE conversations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    channel VARCHAR(30) NOT NULL DEFAULT 'WHATSAPP',
    conversation_type VARCHAR(40) NOT NULL DEFAULT 'CUSTOMER_ORDER',
    customer_id BIGINT UNSIGNED NULL,
    order_id BIGINT UNSIGNED NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    ai_mode VARCHAR(30) NOT NULL DEFAULT 'AI',
    assigned_support_user_id BIGINT UNSIGNED NULL,
    opened_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    closed_at TIMESTAMP(3) NULL,
    last_message_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_conversations_public_id (public_id),
    KEY idx_conversations_customer (customer_id, status),
    KEY idx_conversations_status (status, last_message_at),
    CONSTRAINT fk_conversations_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_conversations_support_user FOREIGN KEY (assigned_support_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE conversation_participants (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    conversation_id BIGINT UNSIGNED NOT NULL,
    participant_type VARCHAR(30) NOT NULL,
    customer_id BIGINT UNSIGNED NULL,
    user_id BIGINT UNSIGNED NULL,
    merchant_branch_id BIGINT UNSIGNED NULL,
    driver_id BIGINT UNSIGNED NULL,
    joined_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    left_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    KEY idx_conversation_participants_conversation (conversation_id),
    CONSTRAINT fk_conversation_participants_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_conversation_participants_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_conversation_participants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_conversation_participants_branch FOREIGN KEY (merchant_branch_id) REFERENCES merchant_branches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    conversation_id BIGINT UNSIGNED NOT NULL,
    provider VARCHAR(40) NULL,
    provider_message_id VARCHAR(255) NULL,
    direction VARCHAR(20) NOT NULL,
    sender_type VARCHAR(30) NOT NULL,
    sender_reference VARCHAR(120) NULL,
    message_type VARCHAR(30) NOT NULL,
    text_body LONGTEXT NULL,
    reply_to_message_id BIGINT UNSIGNED NULL,
    language_code VARCHAR(20) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
    received_at TIMESTAMP(3) NULL,
    sent_at TIMESTAMP(3) NULL,
    delivered_at TIMESTAMP(3) NULL,
    read_at TIMESTAMP(3) NULL,
    processed_at TIMESTAMP(3) NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_messages_public_id (public_id),
    UNIQUE KEY uq_messages_provider_message (provider, provider_message_id),
    KEY idx_messages_conversation (conversation_id, created_at),
    KEY idx_messages_status (status),
    CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_reply_to FOREIGN KEY (reply_to_message_id) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE message_media (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    message_id BIGINT UNSIGNED NOT NULL,
    media_type VARCHAR(30) NOT NULL,
    provider_media_id VARCHAR(255) NULL,
    original_url VARCHAR(1200) NULL,
    storage_url VARCHAR(1200) NULL,
    mime_type VARCHAR(120) NULL,
    file_name VARCHAR(255) NULL,
    file_size_bytes BIGINT UNSIGNED NULL,
    duration_seconds DECIMAL(12,3) NULL,
    width_px INT UNSIGNED NULL,
    height_px INT UNSIGNED NULL,
    transcript LONGTEXT NULL,
    analysis_json JSON NULL,
    retention_until TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_message_media_message (message_id),
    CONSTRAINT fk_message_media_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE conversation_state (
    conversation_id BIGINT UNSIGNED NOT NULL,
    current_state VARCHAR(60) NOT NULL DEFAULT 'IDLE',
    active_cart_id BIGINT UNSIGNED NULL,
    active_search_session_id BIGINT UNSIGNED NULL,
    last_presented_options JSON NULL,
    pending_question VARCHAR(120) NULL,
    state_json JSON NULL,
    version_no INT UNSIGNED NOT NULL DEFAULT 1,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (conversation_id),
    CONSTRAINT fk_conversation_state_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE ai_interactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    conversation_id BIGINT UNSIGNED NULL,
    dashboard_user_id BIGINT UNSIGNED NULL,
    ai_context VARCHAR(30) NOT NULL,
    model_name VARCHAR(120) NOT NULL,
    interaction_type VARCHAR(50) NOT NULL,
    input_summary TEXT NULL,
    output_summary TEXT NULL,
    structured_output JSON NULL,
    tool_calls_json JSON NULL,
    input_tokens BIGINT UNSIGNED NULL,
    output_tokens BIGINT UNSIGNED NULL,
    cached_input_tokens BIGINT UNSIGNED NULL,
    media_seconds DECIMAL(12,3) NULL,
    estimated_cost_usd DECIMAL(14,6) NULL,
    latency_ms INT UNSIGNED NULL,
    success TINYINT(1) NOT NULL DEFAULT 1,
    error_code VARCHAR(100) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_interactions_public_id (public_id),
    KEY idx_ai_interactions_conversation (conversation_id, created_at),
    KEY idx_ai_interactions_context (ai_context, created_at),
    CONSTRAINT fk_ai_interactions_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
    CONSTRAINT fk_ai_interactions_user FOREIGN KEY (dashboard_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE training_curation_queue (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    conversation_id BIGINT UNSIGNED NULL,
    customer_id BIGINT UNSIGNED NULL,
    turn_index INT UNSIGNED NOT NULL DEFAULT 1,
    correlation_id VARCHAR(100) NULL,
    inbound_message_id BIGINT UNSIGNED NULL,
    assistant_message_id BIGINT UNSIGNED NULL,
    dataset_version VARCHAR(40) NULL,
    sender_language VARCHAR(20) NOT NULL DEFAULT 'en',
    sanitized_user_message TEXT NOT NULL,
    sanitized_model_response TEXT NOT NULL,
    detected_intent VARCHAR(60) NOT NULL DEFAULT 'UNKNOWN',
    tool_calls_json JSON NULL,
    quality_score INT NOT NULL DEFAULT 0,
    conversion_status VARCHAR(40) NOT NULL DEFAULT 'NOT_CONVERTED',
    review_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    reviewed_by BIGINT UNSIGNED NULL,
    reviewed_at TIMESTAMP(3) NULL,
    review_notes VARCHAR(500) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_training_curation_public_id (public_id),
    UNIQUE KEY uq_training_curation_turn (conversation_id, turn_index, correlation_id),
    KEY idx_training_curation_status (review_status, quality_score),
    KEY idx_training_curation_conv (conversation_id),
    CONSTRAINT fk_training_curation_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
    CONSTRAINT fk_training_curation_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_training_curation_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE search_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    customer_id BIGINT UNSIGNED NULL,
    conversation_id BIGINT UNSIGNED NULL,
    search_type VARCHAR(40) NOT NULL DEFAULT 'PRODUCT',
    raw_query LONGTEXT NULL,
    normalized_query LONGTEXT NULL,
    requested_budget DECIMAL(12,2) NULL,
    preference VARCHAR(40) NULL,
    delivery_zone_id BIGINT UNSIGNED NULL,
    result_count INT UNSIGNED NOT NULL DEFAULT 0,
    selected_result_id BIGINT UNSIGNED NULL,
    converted_to_order TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_search_sessions_public_id (public_id),
    KEY idx_search_sessions_customer (customer_id, created_at),
    KEY idx_search_sessions_created (created_at),
    CONSTRAINT fk_search_sessions_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_search_sessions_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
    CONSTRAINT fk_search_sessions_zone FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE search_session_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    search_session_id BIGINT UNSIGNED NOT NULL,
    requested_text VARCHAR(500) NOT NULL,
    normalized_text VARCHAR(500) NULL,
    quantity DECIMAL(10,3) NOT NULL DEFAULT 1.000,
    brand VARCHAR(160) NULL,
    size_text VARCHAR(120) NULL,
    max_price DECIMAL(12,2) NULL,
    constraints_json JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_search_session_items_session (search_session_id),
    CONSTRAINT fk_search_session_items_session FOREIGN KEY (search_session_id) REFERENCES search_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE search_results (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    search_session_id BIGINT UNSIGNED NOT NULL,
    merchant_product_id BIGINT UNSIGNED NOT NULL,
    rank_position INT UNSIGNED NOT NULL,
    text_score DECIMAL(10,6) NULL,
    semantic_score DECIMAL(10,6) NULL,
    total_score DECIMAL(10,6) NULL,
    displayed_price DECIMAL(12,2) NOT NULL,
    delivery_fee DECIMAL(12,2) NULL,
    eta_minutes INT UNSIGNED NULL,
    is_selected TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_search_results_session_rank (search_session_id, rank_position),
    CONSTRAINT fk_search_results_session FOREIGN KEY (search_session_id) REFERENCES search_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_search_results_mp FOREIGN KEY (merchant_product_id) REFERENCES merchant_products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 7. CARTS
-- =====================================================================

CREATE TABLE carts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    conversation_id BIGINT UNSIGNED NULL,
    merchant_branch_id BIGINT UNSIGNED NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    discount_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    estimated_delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    estimated_service_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    estimated_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    expires_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_carts_public_id (public_id),
    KEY idx_carts_customer_status (customer_id, status),
    CONSTRAINT fk_carts_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_carts_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
    CONSTRAINT fk_carts_branch FOREIGN KEY (merchant_branch_id) REFERENCES merchant_branches(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE cart_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    cart_id BIGINT UNSIGNED NOT NULL,
    merchant_product_id BIGINT UNSIGNED NOT NULL,
    merchant_product_variant_id BIGINT UNSIGNED NULL,
    quantity DECIMAL(10,3) NOT NULL DEFAULT 1.000,
    unit_price DECIMAL(12,2) NOT NULL,
    line_discount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    line_total DECIMAL(12,2) NOT NULL,
    customer_notes VARCHAR(1000) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_cart_items_cart (cart_id),
    CONSTRAINT fk_cart_items_cart FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
    CONSTRAINT fk_cart_items_mp FOREIGN KEY (merchant_product_id) REFERENCES merchant_products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cart_items_variant FOREIGN KEY (merchant_product_variant_id) REFERENCES merchant_product_variants(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE cart_item_addons (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    cart_item_id BIGINT UNSIGNED NOT NULL,
    merchant_product_addon_id BIGINT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    line_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (id),
    KEY idx_cart_item_addons_item (cart_item_id),
    CONSTRAINT fk_cart_item_addons_item FOREIGN KEY (cart_item_id) REFERENCES cart_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_cart_item_addons_addon FOREIGN KEY (merchant_product_addon_id) REFERENCES merchant_product_addons(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

ALTER TABLE conversation_state
    ADD CONSTRAINT fk_conversation_state_cart
        FOREIGN KEY (active_cart_id) REFERENCES carts(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_conversation_state_search
        FOREIGN KEY (active_search_session_id) REFERENCES search_sessions(id) ON DELETE SET NULL;

-- =====================================================================
-- 8. PAYMENT METHODS, ORDERS, ITEMS, TIMELINE, SUBSTITUTIONS, REVIEWS
-- =====================================================================

CREATE TABLE payment_methods (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(120) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    configuration_json JSON NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_payment_methods_code (code)
) ENGINE=InnoDB;

CREATE TABLE orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    order_number VARCHAR(50) NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    conversation_id BIGINT UNSIGNED NULL,
    cart_id BIGINT UNSIGNED NULL,
    merchant_id BIGINT UNSIGNED NOT NULL,
    merchant_branch_id BIGINT UNSIGNED NOT NULL,
    delivery_zone_id BIGINT UNSIGNED NULL,
    customer_address_id BIGINT UNSIGNED NOT NULL,
    driver_id BIGINT UNSIGNED NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'CONFIRMED',
    payment_method_code VARCHAR(40) NOT NULL DEFAULT 'CASH',
    payment_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    discount_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    service_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    tax_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    grand_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    merchant_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    company_commission DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    driver_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    customer_notes TEXT NULL,
    merchant_notes TEXT NULL,
    cancellation_reason VARCHAR(500) NULL,
    estimated_delivery_at TIMESTAMP(3) NULL,
    confirmed_at TIMESTAMP(3) NULL,
    merchant_accepted_at TIMESTAMP(3) NULL,
    merchant_rejected_at TIMESTAMP(3) NULL,
    ready_at TIMESTAMP(3) NULL,
    driver_assigned_at TIMESTAMP(3) NULL,
    picked_up_at TIMESTAMP(3) NULL,
    delivered_at TIMESTAMP(3) NULL,
    cancelled_at TIMESTAMP(3) NULL,
    completed_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_orders_public_id (public_id),
    UNIQUE KEY uq_orders_order_number (order_number),
    KEY idx_orders_customer (customer_id, created_at),
    KEY idx_orders_status (status, created_at),
    KEY idx_orders_branch (merchant_branch_id, created_at),
    KEY idx_orders_driver (driver_id, created_at),
    KEY idx_orders_delivery_zone (delivery_zone_id),
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_orders_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
    CONSTRAINT fk_orders_cart FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE SET NULL,
    CONSTRAINT fk_orders_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT,
    CONSTRAINT fk_orders_branch FOREIGN KEY (merchant_branch_id) REFERENCES merchant_branches(id) ON DELETE RESTRICT,
    CONSTRAINT fk_orders_zone FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones(id) ON DELETE SET NULL,
    CONSTRAINT fk_orders_address FOREIGN KEY (customer_address_id) REFERENCES customer_addresses(id) ON DELETE RESTRICT,
    CONSTRAINT fk_orders_payment_method FOREIGN KEY (payment_method_code) REFERENCES payment_methods(code) ON DELETE RESTRICT
) ENGINE=InnoDB;

ALTER TABLE conversations
    ADD CONSTRAINT fk_conversations_order
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

CREATE TABLE order_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    merchant_product_id BIGINT UNSIGNED NULL,
    product_id BIGINT UNSIGNED NULL,
    product_variant_id BIGINT UNSIGNED NULL,
    product_name_snapshot VARCHAR(255) NOT NULL,
    variant_name_snapshot VARCHAR(180) NULL,
    brand_snapshot VARCHAR(160) NULL,
    quantity DECIMAL(10,3) NOT NULL DEFAULT 1.000,
    unit_price DECIMAL(12,2) NOT NULL,
    line_discount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    line_total DECIMAL(12,2) NOT NULL,
    customer_notes VARCHAR(1000) NULL,
    item_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_order_items_order (order_id),
    KEY idx_order_items_product (product_id),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_items_mp FOREIGN KEY (merchant_product_id) REFERENCES merchant_products(id) ON DELETE SET NULL,
    CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    CONSTRAINT fk_order_items_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE order_item_addons (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_item_id BIGINT UNSIGNED NOT NULL,
    addon_id BIGINT UNSIGNED NULL,
    addon_name_snapshot VARCHAR(180) NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    line_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (id),
    KEY idx_order_item_addons_item (order_item_id),
    CONSTRAINT fk_order_item_addons_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_item_addons_addon FOREIGN KEY (addon_id) REFERENCES product_addons(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE order_status_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    previous_status VARCHAR(40) NULL,
    new_status VARCHAR(40) NOT NULL,
    actor_type VARCHAR(30) NOT NULL,
    actor_user_id BIGINT UNSIGNED NULL,
    note VARCHAR(1000) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_order_status_history_order (order_id, created_at),
    KEY idx_order_status_history_status (new_status, created_at),
    CONSTRAINT fk_order_status_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_status_history_user FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE order_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload_json JSON NULL,
    occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_order_events_public_id (public_id),
    KEY idx_order_events_order (order_id, occurred_at),
    KEY idx_order_events_type (event_type, occurred_at),
    CONSTRAINT fk_order_events_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE order_notes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    note_type VARCHAR(30) NOT NULL DEFAULT 'INTERNAL',
    note_text TEXT NOT NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_order_notes_order (order_id, created_at),
    CONSTRAINT fk_order_notes_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_notes_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE order_item_substitutions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    order_item_id BIGINT UNSIGNED NOT NULL,
    replacement_merchant_product_id BIGINT UNSIGNED NULL,
    proposed_name VARCHAR(255) NOT NULL,
    proposed_price DECIMAL(12,2) NULL,
    reason VARCHAR(500) NULL,
    customer_decision VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    decided_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_order_substitutions_order (order_id, customer_decision),
    CONSTRAINT fk_order_substitutions_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_substitutions_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_substitutions_replacement FOREIGN KEY (replacement_merchant_product_id) REFERENCES merchant_products(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE order_alternative_offers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    original_order_id BIGINT UNSIGNED NOT NULL,
    alternative_merchant_branch_id BIGINT UNSIGNED NOT NULL,
    quoted_total DECIMAL(12,2) NOT NULL,
    quoted_delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    eta_minutes INT UNSIGNED NULL,
    items_json JSON NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OFFERED',
    customer_decision_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_order_alternative_offers_order (original_order_id, status),
    CONSTRAINT fk_order_alt_original_order FOREIGN KEY (original_order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_alt_branch FOREIGN KEY (alternative_merchant_branch_id) REFERENCES merchant_branches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE order_cancellations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    requested_by_type VARCHAR(30) NOT NULL,
    requested_by_user_id BIGINT UNSIGNED NULL,
    reason_code VARCHAR(80) NULL,
    reason_text VARCHAR(1000) NULL,
    fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
    approved_by BIGINT UNSIGNED NULL,
    requested_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    resolved_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    KEY idx_order_cancellations_order (order_id, status),
    CONSTRAINT fk_order_cancellations_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_cancellations_requested_user FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_order_cancellations_approved_user FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE order_reviews (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    overall_rating TINYINT UNSIGNED NULL,
    merchant_rating TINYINT UNSIGNED NULL,
    driver_rating TINYINT UNSIGNED NULL,
    comment TEXT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_order_reviews_order (order_id),
    KEY idx_order_reviews_customer (customer_id, created_at),
    CONSTRAINT fk_order_reviews_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_reviews_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE promotion_redemptions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    promotion_id BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NULL,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    redeemed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_promotion_redemptions_promo (promotion_id, redeemed_at),
    KEY idx_promotion_redemptions_customer (customer_id, redeemed_at),
    CONSTRAINT fk_promotion_redemptions_promo FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_promotion_redemptions_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_promotion_redemptions_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB;

ALTER TABLE customers
    ADD CONSTRAINT fk_customers_default_address
        FOREIGN KEY (default_address_id) REFERENCES customer_addresses(id) ON DELETE SET NULL;

-- =====================================================================
-- 9. DRIVERS, AVAILABILITY, LOCATION, OFFERS, ASSIGNMENTS
-- =====================================================================

CREATE TABLE drivers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    whatsapp_number VARCHAR(40) NOT NULL,
    display_code VARCHAR(60) NOT NULL,
    full_name_private VARCHAR(180) NULL,
    phone_private VARCHAR(40) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    availability_status VARCHAR(30) NOT NULL DEFAULT 'OFFLINE',
    vehicle_type VARCHAR(50) NULL,
    vehicle_plate VARCHAR(50) NULL,
    rating DECIMAL(3,2) NULL,
    acceptance_rate DECIMAL(6,3) NULL,
    current_order_count INT UNSIGNED NOT NULL DEFAULT 0,
    allow_call_recording TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_drivers_public_id (public_id),
    UNIQUE KEY uq_drivers_whatsapp (whatsapp_number),
    UNIQUE KEY uq_drivers_display_code (display_code),
    KEY idx_drivers_status_availability (status, availability_status)
) ENGINE=InnoDB;

ALTER TABLE orders
    ADD CONSTRAINT fk_orders_driver
        FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL;

ALTER TABLE conversation_participants
    ADD CONSTRAINT fk_conversation_participants_driver
        FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;

CREATE TABLE driver_documents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    driver_id BIGINT UNSIGNED NOT NULL,
    document_type VARCHAR(60) NOT NULL,
    document_number VARCHAR(120) NULL,
    file_url VARCHAR(1200) NULL,
    issued_at DATE NULL,
    expires_at DATE NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'VALID',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_driver_documents_driver (driver_id),
    KEY idx_driver_documents_expiry (expires_at),
    CONSTRAINT fk_driver_documents_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE driver_delivery_zones (
    driver_id BIGINT UNSIGNED NOT NULL,
    delivery_zone_id BIGINT UNSIGNED NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (driver_id, delivery_zone_id),
    CONSTRAINT fk_driver_zones_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
    CONSTRAINT fk_driver_zones_zone FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE driver_availability (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    driver_id BIGINT UNSIGNED NOT NULL,
    status VARCHAR(30) NOT NULL,
    started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ended_at TIMESTAMP(3) NULL,
    source VARCHAR(40) NULL,
    PRIMARY KEY (id),
    KEY idx_driver_availability_driver (driver_id, started_at),
    CONSTRAINT fk_driver_availability_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE driver_status_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    driver_id BIGINT UNSIGNED NOT NULL,
    previous_status VARCHAR(30) NULL,
    new_status VARCHAR(30) NOT NULL,
    reason VARCHAR(500) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_driver_status_history_driver (driver_id, created_at),
    CONSTRAINT fk_driver_status_history_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE driver_locations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    driver_id BIGINT UNSIGNED NOT NULL,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    accuracy_meters DECIMAL(10,2) NULL,
    heading_degrees DECIMAL(8,2) NULL,
    speed_kmh DECIMAL(8,2) NULL,
    recorded_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_driver_locations_driver_time (driver_id, recorded_at),
    KEY idx_driver_locations_latlng (latitude, longitude),
    CONSTRAINT fk_driver_locations_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE driver_offers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    driver_id BIGINT UNSIGNED NOT NULL,
    attempt_no INT UNSIGNED NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OFFERED',
    offered_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expires_at TIMESTAMP(3) NULL,
    responded_at TIMESTAMP(3) NULL,
    rejection_reason VARCHAR(500) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_driver_offers_public_id (public_id),
    UNIQUE KEY uq_driver_offers_order_attempt (order_id, attempt_no),
    KEY idx_driver_offers_driver_status (driver_id, status, offered_at),
    CONSTRAINT fk_driver_offers_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_driver_offers_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE driver_assignments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    driver_id BIGINT UNSIGNED NOT NULL,
    driver_offer_id BIGINT UNSIGNED NULL,
    assignment_no INT UNSIGNED NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ASSIGNED',
    assigned_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    accepted_at TIMESTAMP(3) NULL,
    released_at TIMESTAMP(3) NULL,
    release_reason VARCHAR(500) NULL,
    completed_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_driver_assignments_public_id (public_id),
    UNIQUE KEY uq_driver_assignments_order_no (order_id, assignment_no),
    KEY idx_driver_assignments_driver (driver_id, status, assigned_at),
    CONSTRAINT fk_driver_assignments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_driver_assignments_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_driver_assignments_offer FOREIGN KEY (driver_offer_id) REFERENCES driver_offers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE driver_performance_daily (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    driver_id BIGINT UNSIGNED NOT NULL,
    metric_date DATE NOT NULL,
    offered_orders INT UNSIGNED NOT NULL DEFAULT 0,
    accepted_orders INT UNSIGNED NOT NULL DEFAULT 0,
    rejected_orders INT UNSIGNED NOT NULL DEFAULT 0,
    completed_orders INT UNSIGNED NOT NULL DEFAULT 0,
    failed_orders INT UNSIGNED NOT NULL DEFAULT 0,
    online_minutes INT UNSIGNED NOT NULL DEFAULT 0,
    average_pickup_minutes DECIMAL(10,2) NULL,
    average_delivery_minutes DECIMAL(10,2) NULL,
    cash_collected DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    earnings DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    rating_average DECIMAL(3,2) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_driver_performance_daily (driver_id, metric_date),
    CONSTRAINT fk_driver_performance_daily_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 10. PRIVATE DELIVERY COMMUNICATION, CALLS, RECORDINGS
-- =====================================================================

CREATE TABLE delivery_channels (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    driver_id BIGINT UNSIGNED NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    opened_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expires_at TIMESTAMP(3) NULL,
    closed_at TIMESTAMP(3) NULL,
    closed_reason VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_delivery_channels_public_id (public_id),
    UNIQUE KEY uq_delivery_channels_order (order_id),
    KEY idx_delivery_channels_driver (driver_id, status),
    CONSTRAINT fk_delivery_channels_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_delivery_channels_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_delivery_channels_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE delivery_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    delivery_channel_id BIGINT UNSIGNED NOT NULL,
    sender_role VARCHAR(20) NOT NULL,
    source_provider_message_id VARCHAR(255) NULL,
    target_provider_message_id VARCHAR(255) NULL,
    message_type VARCHAR(30) NOT NULL,
    text_body LONGTEXT NULL,
    media_url VARCHAR(1200) NULL,
    transcript LONGTEXT NULL,
    relay_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    sent_at TIMESTAMP(3) NULL,
    delivered_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_delivery_messages_public_id (public_id),
    KEY idx_delivery_messages_channel (delivery_channel_id, created_at),
    CONSTRAINT fk_delivery_messages_channel FOREIGN KEY (delivery_channel_id) REFERENCES delivery_channels(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE delivery_calls (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    delivery_channel_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    caller_role VARCHAR(20) NOT NULL,
    provider VARCHAR(40) NOT NULL DEFAULT 'LIVEKIT',
    provider_room_name VARCHAR(255) NULL,
    provider_call_id VARCHAR(255) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
    recording_requested TINYINT(1) NOT NULL DEFAULT 0,
    recording_consent_customer TINYINT(1) NOT NULL DEFAULT 0,
    recording_consent_driver TINYINT(1) NOT NULL DEFAULT 0,
    requested_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    connected_at TIMESTAMP(3) NULL,
    ended_at TIMESTAMP(3) NULL,
    duration_seconds INT UNSIGNED NULL,
    end_reason VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_delivery_calls_public_id (public_id),
    KEY idx_delivery_calls_order (order_id, requested_at),
    CONSTRAINT fk_delivery_calls_channel FOREIGN KEY (delivery_channel_id) REFERENCES delivery_channels(id) ON DELETE CASCADE,
    CONSTRAINT fk_delivery_calls_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE call_recordings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    delivery_call_id BIGINT UNSIGNED NOT NULL,
    provider_recording_id VARCHAR(255) NULL,
    storage_url VARCHAR(1200) NULL,
    format VARCHAR(30) NULL,
    duration_seconds INT UNSIGNED NULL,
    file_size_bytes BIGINT UNSIGNED NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PROCESSING',
    retention_until TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_call_recordings_call (delivery_call_id),
    CONSTRAINT fk_call_recordings_call FOREIGN KEY (delivery_call_id) REFERENCES delivery_calls(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE call_transcripts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    delivery_call_id BIGINT UNSIGNED NOT NULL,
    transcript LONGTEXT NOT NULL,
    language_code VARCHAR(20) NULL,
    segments_json JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_call_transcripts_call (delivery_call_id),
    CONSTRAINT fk_call_transcripts_call FOREIGN KEY (delivery_call_id) REFERENCES delivery_calls(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 11. CUSTOMER SUPPORT, COMPLAINTS, HUMAN TAKEOVER
-- =====================================================================

CREATE TABLE support_cases (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    case_number VARCHAR(50) NOT NULL,
    customer_id BIGINT UNSIGNED NULL,
    order_id BIGINT UNSIGNED NULL,
    merchant_id BIGINT UNSIGNED NULL,
    driver_id BIGINT UNSIGNED NULL,
    conversation_id BIGINT UNSIGNED NULL,
    case_type VARCHAR(60) NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    subject VARCHAR(255) NULL,
    description TEXT NULL,
    assigned_user_id BIGINT UNSIGNED NULL,
    resolution_summary TEXT NULL,
    opened_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    resolved_at TIMESTAMP(3) NULL,
    closed_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_support_cases_public_id (public_id),
    UNIQUE KEY uq_support_cases_case_number (case_number),
    KEY idx_support_cases_status (status, priority, opened_at),
    KEY idx_support_cases_customer (customer_id, opened_at),
    CONSTRAINT fk_support_cases_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_support_cases_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    CONSTRAINT fk_support_cases_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE SET NULL,
    CONSTRAINT fk_support_cases_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
    CONSTRAINT fk_support_cases_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
    CONSTRAINT fk_support_cases_assigned_user FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE support_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    support_case_id BIGINT UNSIGNED NOT NULL,
    sender_type VARCHAR(30) NOT NULL,
    sender_user_id BIGINT UNSIGNED NULL,
    message_text LONGTEXT NULL,
    media_url VARCHAR(1200) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_support_messages_case (support_case_id, created_at),
    CONSTRAINT fk_support_messages_case FOREIGN KEY (support_case_id) REFERENCES support_cases(id) ON DELETE CASCADE,
    CONSTRAINT fk_support_messages_user FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE support_notes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    support_case_id BIGINT UNSIGNED NOT NULL,
    note_text TEXT NOT NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_support_notes_case (support_case_id, created_at),
    CONSTRAINT fk_support_notes_case FOREIGN KEY (support_case_id) REFERENCES support_cases(id) ON DELETE CASCADE,
    CONSTRAINT fk_support_notes_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE support_actions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    support_case_id BIGINT UNSIGNED NOT NULL,
    action_type VARCHAR(60) NOT NULL,
    action_payload JSON NULL,
    performed_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_support_actions_case (support_case_id, created_at),
    CONSTRAINT fk_support_actions_case FOREIGN KEY (support_case_id) REFERENCES support_cases(id) ON DELETE CASCADE,
    CONSTRAINT fk_support_actions_user FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE complaints (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    support_case_id BIGINT UNSIGNED NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NULL,
    complaint_type VARCHAR(60) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    resolved_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_complaints_public_id (public_id),
    KEY idx_complaints_status (status, created_at),
    CONSTRAINT fk_complaints_case FOREIGN KEY (support_case_id) REFERENCES support_cases(id) ON DELETE SET NULL,
    CONSTRAINT fk_complaints_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_complaints_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =====================================================================
-- 12. FINANCE, LEDGER, PAYMENTS, REFUNDS, SETTLEMENTS
-- =====================================================================

CREATE TABLE financial_accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    account_type VARCHAR(40) NOT NULL,
    owner_type VARCHAR(30) NOT NULL,
    merchant_id BIGINT UNSIGNED NULL,
    driver_id BIGINT UNSIGNED NULL,
    name VARCHAR(180) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_financial_accounts_public_id (public_id),
    KEY idx_financial_accounts_owner (owner_type, merchant_id, driver_id),
    CONSTRAINT fk_financial_accounts_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
    CONSTRAINT fk_financial_accounts_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE financial_transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    order_id BIGINT UNSIGNED NULL,
    reference_type VARCHAR(50) NULL,
    reference_id BIGINT UNSIGNED NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    amount DECIMAL(14,2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'POSTED',
    description VARCHAR(500) NULL,
    occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_financial_transactions_public_id (public_id),
    KEY idx_financial_transactions_order (order_id, occurred_at),
    KEY idx_financial_transactions_type (transaction_type, occurred_at),
    CONSTRAINT fk_financial_transactions_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    CONSTRAINT fk_financial_transactions_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE financial_entries (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    financial_transaction_id BIGINT UNSIGNED NOT NULL,
    financial_account_id BIGINT UNSIGNED NOT NULL,
    entry_type VARCHAR(10) NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_financial_entries_transaction (financial_transaction_id),
    KEY idx_financial_entries_account (financial_account_id, created_at),
    CONSTRAINT fk_financial_entries_transaction FOREIGN KEY (financial_transaction_id) REFERENCES financial_transactions(id) ON DELETE CASCADE,
    CONSTRAINT fk_financial_entries_account FOREIGN KEY (financial_account_id) REFERENCES financial_accounts(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE order_financials (
    order_id BIGINT UNSIGNED NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    discount_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    delivery_fee DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    service_fee DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    tax_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    grand_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    merchant_gross DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    company_commission DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    driver_earning DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    company_net_before_costs DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    snapshot_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (order_id),
    CONSTRAINT fk_order_financials_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payment_transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    payment_method_code VARCHAR(40) NOT NULL,
    transaction_type VARCHAR(30) NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    provider VARCHAR(80) NULL,
    provider_reference VARCHAR(255) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    processed_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_payment_transactions_public_id (public_id),
    KEY idx_payment_transactions_order (order_id, created_at),
    CONSTRAINT fk_payment_transactions_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_payment_transactions_method FOREIGN KEY (payment_method_code) REFERENCES payment_methods(code) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE refunds (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    refund_number VARCHAR(50) NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    support_case_id BIGINT UNSIGNED NULL,
    refund_type VARCHAR(30) NOT NULL,
    reason_code VARCHAR(80) NULL,
    reason_text VARCHAR(1000) NULL,
    amount DECIMAL(14,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    refund_method VARCHAR(40) NOT NULL DEFAULT 'ORIGINAL_OR_CASH',
    status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
    requested_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    requested_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    approved_at TIMESTAMP(3) NULL,
    completed_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_refunds_public_id (public_id),
    UNIQUE KEY uq_refunds_number (refund_number),
    KEY idx_refunds_order (order_id, status),
    CONSTRAINT fk_refunds_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
    CONSTRAINT fk_refunds_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_refunds_case FOREIGN KEY (support_case_id) REFERENCES support_cases(id) ON DELETE SET NULL,
    CONSTRAINT fk_refunds_requested_by FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_refunds_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE refund_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    refund_id BIGINT UNSIGNED NOT NULL,
    order_item_id BIGINT UNSIGNED NULL,
    quantity DECIMAL(10,3) NULL,
    amount DECIMAL(14,2) NOT NULL,
    reason VARCHAR(500) NULL,
    PRIMARY KEY (id),
    KEY idx_refund_items_refund (refund_id),
    CONSTRAINT fk_refund_items_refund FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE CASCADE,
    CONSTRAINT fk_refund_items_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE merchant_balances (
    merchant_id BIGINT UNSIGNED NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    available_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    pending_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    last_calculated_at TIMESTAMP(3) NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (merchant_id, currency),
    CONSTRAINT fk_merchant_balances_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE driver_balances (
    driver_id BIGINT UNSIGNED NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    earnings_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    cash_liability DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    net_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    last_calculated_at TIMESTAMP(3) NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (driver_id, currency),
    CONSTRAINT fk_driver_balances_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE merchant_settlements (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    settlement_number VARCHAR(50) NOT NULL,
    merchant_id BIGINT UNSIGNED NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    gross_sales DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    commission_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    refunds_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    adjustments_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    net_payable DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    approved_by BIGINT UNSIGNED NULL,
    approved_at TIMESTAMP(3) NULL,
    paid_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_merchant_settlements_public_id (public_id),
    UNIQUE KEY uq_merchant_settlements_number (settlement_number),
    KEY idx_merchant_settlements_merchant (merchant_id, period_start, period_end),
    CONSTRAINT fk_merchant_settlements_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE RESTRICT,
    CONSTRAINT fk_merchant_settlements_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE merchant_settlement_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    merchant_settlement_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NULL,
    financial_transaction_id BIGINT UNSIGNED NULL,
    item_type VARCHAR(40) NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    description VARCHAR(500) NULL,
    PRIMARY KEY (id),
    KEY idx_merchant_settlement_items_settlement (merchant_settlement_id),
    CONSTRAINT fk_merchant_settlement_items_settlement FOREIGN KEY (merchant_settlement_id) REFERENCES merchant_settlements(id) ON DELETE CASCADE,
    CONSTRAINT fk_merchant_settlement_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    CONSTRAINT fk_merchant_settlement_items_financial FOREIGN KEY (financial_transaction_id) REFERENCES financial_transactions(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE driver_settlements (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    settlement_number VARCHAR(50) NOT NULL,
    driver_id BIGINT UNSIGNED NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    earnings_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    cash_collected DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    bonuses_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    deductions_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    net_settlement DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    approved_by BIGINT UNSIGNED NULL,
    approved_at TIMESTAMP(3) NULL,
    settled_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_driver_settlements_public_id (public_id),
    UNIQUE KEY uq_driver_settlements_number (settlement_number),
    KEY idx_driver_settlements_driver (driver_id, period_start, period_end),
    CONSTRAINT fk_driver_settlements_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_driver_settlements_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE driver_settlement_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    driver_settlement_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NULL,
    financial_transaction_id BIGINT UNSIGNED NULL,
    item_type VARCHAR(40) NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    description VARCHAR(500) NULL,
    PRIMARY KEY (id),
    KEY idx_driver_settlement_items_settlement (driver_settlement_id),
    CONSTRAINT fk_driver_settlement_items_settlement FOREIGN KEY (driver_settlement_id) REFERENCES driver_settlements(id) ON DELETE CASCADE,
    CONSTRAINT fk_driver_settlement_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    CONSTRAINT fk_driver_settlement_items_financial FOREIGN KEY (financial_transaction_id) REFERENCES financial_transactions(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE cash_reconciliations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    reconciliation_number VARCHAR(50) NOT NULL,
    driver_id BIGINT UNSIGNED NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    expected_cash DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    received_cash DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    difference_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    opened_by BIGINT UNSIGNED NULL,
    closed_by BIGINT UNSIGNED NULL,
    opened_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    closed_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cash_reconciliations_public_id (public_id),
    UNIQUE KEY uq_cash_reconciliations_number (reconciliation_number),
    KEY idx_cash_reconciliations_driver (driver_id, status),
    CONSTRAINT fk_cash_reconciliations_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cash_reconciliations_opened_by FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_cash_reconciliations_closed_by FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE cash_reconciliation_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    cash_reconciliation_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NULL,
    amount DECIMAL(14,2) NOT NULL,
    item_type VARCHAR(40) NOT NULL,
    note VARCHAR(500) NULL,
    PRIMARY KEY (id),
    KEY idx_cash_reconciliation_items_reconciliation (cash_reconciliation_id),
    CONSTRAINT fk_cash_reconciliation_items_recon FOREIGN KEY (cash_reconciliation_id) REFERENCES cash_reconciliations(id) ON DELETE CASCADE,
    CONSTRAINT fk_cash_reconciliation_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =====================================================================
-- 13. NOTIFICATIONS, ALERTS, AUTOMATIONS
-- =====================================================================

CREATE TABLE notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    recipient_type VARCHAR(30) NOT NULL,
    customer_id BIGINT UNSIGNED NULL,
    driver_id BIGINT UNSIGNED NULL,
    user_id BIGINT UNSIGNED NULL,
    merchant_branch_id BIGINT UNSIGNED NULL,
    channel VARCHAR(30) NOT NULL,
    notification_type VARCHAR(80) NOT NULL,
    title VARCHAR(255) NULL,
    body LONGTEXT NULL,
    payload_json JSON NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    scheduled_at TIMESTAMP(3) NULL,
    sent_at TIMESTAMP(3) NULL,
    delivered_at TIMESTAMP(3) NULL,
    failed_at TIMESTAMP(3) NULL,
    failure_reason VARCHAR(1000) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_notifications_public_id (public_id),
    KEY idx_notifications_status (status, scheduled_at),
    CONSTRAINT fk_notifications_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_branch FOREIGN KEY (merchant_branch_id) REFERENCES merchant_branches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE operational_alerts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    alert_type VARCHAR(80) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'WARNING',
    entity_type VARCHAR(40) NULL,
    entity_id BIGINT UNSIGNED NULL,
    order_id BIGINT UNSIGNED NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    acknowledged_by BIGINT UNSIGNED NULL,
    acknowledged_at TIMESTAMP(3) NULL,
    resolved_by BIGINT UNSIGNED NULL,
    resolved_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_operational_alerts_public_id (public_id),
    KEY idx_operational_alerts_status (status, severity, created_at),
    CONSTRAINT fk_operational_alerts_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_operational_alerts_ack_user FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_operational_alerts_resolved_user FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE automation_rules (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    name VARCHAR(180) NOT NULL,
    trigger_event VARCHAR(100) NOT NULL,
    conditions_json JSON NULL,
    actions_json JSON NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_automation_rules_public_id (public_id),
    CONSTRAINT fk_automation_rules_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE automation_runs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    automation_rule_id BIGINT UNSIGNED NOT NULL,
    trigger_event_id VARCHAR(255) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'RUNNING',
    input_json JSON NULL,
    output_json JSON NULL,
    error_text TEXT NULL,
    started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    finished_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    KEY idx_automation_runs_rule (automation_rule_id, started_at),
    CONSTRAINT fk_automation_runs_rule FOREIGN KEY (automation_rule_id) REFERENCES automation_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 14. ANALYTICS AGGREGATES, REPORTS
-- =====================================================================

CREATE TABLE analytics_daily_orders (
    metric_date DATE NOT NULL,
    total_orders INT UNSIGNED NOT NULL DEFAULT 0,
    completed_orders INT UNSIGNED NOT NULL DEFAULT 0,
    cancelled_orders INT UNSIGNED NOT NULL DEFAULT 0,
    failed_orders INT UNSIGNED NOT NULL DEFAULT 0,
    active_peak INT UNSIGNED NOT NULL DEFAULT 0,
    gross_order_value DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    average_order_value DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    average_items_per_order DECIMAL(10,2) NULL,
    average_preparation_minutes DECIMAL(10,2) NULL,
    average_delivery_minutes DECIMAL(10,2) NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (metric_date)
) ENGINE=InnoDB;

CREATE TABLE analytics_daily_customers (
    metric_date DATE NOT NULL,
    total_active_customers INT UNSIGNED NOT NULL DEFAULT 0,
    new_customers INT UNSIGNED NOT NULL DEFAULT 0,
    returning_customers INT UNSIGNED NOT NULL DEFAULT 0,
    ordering_customers INT UNSIGNED NOT NULL DEFAULT 0,
    repeat_orders INT UNSIGNED NOT NULL DEFAULT 0,
    average_customer_spend DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (metric_date)
) ENGINE=InnoDB;

CREATE TABLE analytics_daily_merchants (
    merchant_id BIGINT UNSIGNED NOT NULL,
    metric_date DATE NOT NULL,
    orders_received INT UNSIGNED NOT NULL DEFAULT 0,
    orders_accepted INT UNSIGNED NOT NULL DEFAULT 0,
    orders_rejected INT UNSIGNED NOT NULL DEFAULT 0,
    completed_orders INT UNSIGNED NOT NULL DEFAULT 0,
    gross_sales DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    average_basket DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    average_preparation_minutes DECIMAL(10,2) NULL,
    unavailable_product_count INT UNSIGNED NOT NULL DEFAULT 0,
    complaint_count INT UNSIGNED NOT NULL DEFAULT 0,
    rating_average DECIMAL(3,2) NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (merchant_id, metric_date),
    CONSTRAINT fk_analytics_daily_merchants_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE analytics_daily_drivers (
    driver_id BIGINT UNSIGNED NOT NULL,
    metric_date DATE NOT NULL,
    offers_received INT UNSIGNED NOT NULL DEFAULT 0,
    offers_accepted INT UNSIGNED NOT NULL DEFAULT 0,
    offers_rejected INT UNSIGNED NOT NULL DEFAULT 0,
    completed_deliveries INT UNSIGNED NOT NULL DEFAULT 0,
    failed_deliveries INT UNSIGNED NOT NULL DEFAULT 0,
    average_pickup_minutes DECIMAL(10,2) NULL,
    average_delivery_minutes DECIMAL(10,2) NULL,
    cash_collected DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    earnings DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    rating_average DECIMAL(3,2) NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (driver_id, metric_date),
    CONSTRAINT fk_analytics_daily_drivers_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE analytics_daily_products (
    product_id BIGINT UNSIGNED NOT NULL,
    metric_date DATE NOT NULL,
    search_count INT UNSIGNED NOT NULL DEFAULT 0,
    selected_count INT UNSIGNED NOT NULL DEFAULT 0,
    ordered_quantity DECIMAL(14,3) NOT NULL DEFAULT 0.000,
    unavailable_count INT UNSIGNED NOT NULL DEFAULT 0,
    no_result_related_count INT UNSIGNED NOT NULL DEFAULT 0,
    gross_sales DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (product_id, metric_date),
    CONSTRAINT fk_analytics_daily_products_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE analytics_daily_ai (
    metric_date DATE NOT NULL,
    customer_ai_interactions INT UNSIGNED NOT NULL DEFAULT 0,
    dashboard_ai_interactions INT UNSIGNED NOT NULL DEFAULT 0,
    successful_interactions INT UNSIGNED NOT NULL DEFAULT 0,
    clarification_count INT UNSIGNED NOT NULL DEFAULT 0,
    failed_search_count INT UNSIGNED NOT NULL DEFAULT 0,
    human_handoff_count INT UNSIGNED NOT NULL DEFAULT 0,
    input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
    output_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
    ai_cost_usd DECIMAL(14,6) NOT NULL DEFAULT 0.000000,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (metric_date)
) ENGINE=InnoDB;

CREATE TABLE analytics_daily_whatsapp (
    metric_date DATE NOT NULL,
    conversations_started INT UNSIGNED NOT NULL DEFAULT 0,
    inbound_messages INT UNSIGNED NOT NULL DEFAULT 0,
    outbound_messages INT UNSIGNED NOT NULL DEFAULT 0,
    text_messages INT UNSIGNED NOT NULL DEFAULT 0,
    image_messages INT UNSIGNED NOT NULL DEFAULT 0,
    audio_messages INT UNSIGNED NOT NULL DEFAULT 0,
    video_messages INT UNSIGNED NOT NULL DEFAULT 0,
    average_messages_per_conversation DECIMAL(10,2) NULL,
    converted_orders INT UNSIGNED NOT NULL DEFAULT 0,
    abandoned_conversations INT UNSIGNED NOT NULL DEFAULT 0,
    communication_cost_usd DECIMAL(14,6) NOT NULL DEFAULT 0.000000,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (metric_date)
) ENGINE=InnoDB;

CREATE TABLE analytics_daily_finance (
    metric_date DATE NOT NULL,
    gross_merchandise_value DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    delivery_revenue DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    commission_revenue DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    service_fee_revenue DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    discounts DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    refunds DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    merchant_payable DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    driver_payable DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    ai_cost DECIMAL(16,6) NOT NULL DEFAULT 0.000000,
    whatsapp_cost DECIMAL(16,6) NOT NULL DEFAULT 0.000000,
    call_cost DECIMAL(16,6) NOT NULL DEFAULT 0.000000,
    gross_profit DECIMAL(16,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (metric_date)
) ENGINE=InnoDB;

CREATE TABLE report_exports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    report_type VARCHAR(80) NOT NULL,
    requested_by BIGINT UNSIGNED NOT NULL,
    filters_json JSON NULL,
    file_format VARCHAR(20) NOT NULL,
    storage_url VARCHAR(1200) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
    error_text TEXT NULL,
    requested_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    completed_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_report_exports_public_id (public_id),
    KEY idx_report_exports_user (requested_by, requested_at),
    CONSTRAINT fk_report_exports_user FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 15. INTEGRATION EVENTS, IDEMPOTENCY, OUTBOX, JOB FAILURES
-- =====================================================================

CREATE TABLE integration_webhook_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    provider VARCHAR(50) NOT NULL,
    provider_event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(120) NULL,
    payload_json JSON NOT NULL,
    signature_verified TINYINT(1) NOT NULL DEFAULT 0,
    processing_status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
    retry_count INT UNSIGNED NOT NULL DEFAULT 0,
    received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    processed_at TIMESTAMP(3) NULL,
    last_error TEXT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_integration_webhook_event (provider, provider_event_id),
    KEY idx_integration_webhook_status (processing_status, received_at)
) ENGINE=InnoDB;

CREATE TABLE idempotency_keys (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    idempotency_key VARCHAR(255) NOT NULL,
    scope VARCHAR(80) NOT NULL,
    request_hash CHAR(64) NULL,
    response_status INT NULL,
    response_json JSON NULL,
    expires_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_idempotency_scope_key (scope, idempotency_key),
    KEY idx_idempotency_expires (expires_at)
) ENGINE=InnoDB;

CREATE TABLE outbox_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    aggregate_type VARCHAR(60) NOT NULL,
    aggregate_id BIGINT UNSIGNED NOT NULL,
    event_type VARCHAR(120) NOT NULL,
    payload_json JSON NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    available_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    processed_at TIMESTAMP(3) NULL,
    retry_count INT UNSIGNED NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_outbox_events_public_id (public_id),
    KEY idx_outbox_events_status (status, available_at)
) ENGINE=InnoDB;

CREATE TABLE failed_jobs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    queue_name VARCHAR(120) NOT NULL,
    job_name VARCHAR(120) NOT NULL,
    job_reference VARCHAR(255) NULL,
    payload_json JSON NULL,
    error_text LONGTEXT NOT NULL,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    failed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    resolved_at TIMESTAMP(3) NULL,
    PRIMARY KEY (id),
    KEY idx_failed_jobs_queue (queue_name, failed_at)
) ENGINE=InnoDB;

-- =====================================================================
-- 16. SETTINGS, COST CONFIGURATION, AUDIT
-- =====================================================================

CREATE TABLE system_settings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    setting_key VARCHAR(160) NOT NULL,
    setting_value JSON NULL,
    setting_group VARCHAR(80) NOT NULL DEFAULT 'GENERAL',
    is_secret TINYINT(1) NOT NULL DEFAULT 0,
    description VARCHAR(500) NULL,
    updated_by BIGINT UNSIGNED NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_system_settings_key (setting_key),
    CONSTRAINT fk_system_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE provider_cost_rates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    provider VARCHAR(60) NOT NULL,
    service_type VARCHAR(80) NOT NULL,
    region_code VARCHAR(80) NULL,
    unit_name VARCHAR(60) NOT NULL,
    unit_cost_usd DECIMAL(18,8) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_provider_cost_rates_lookup (provider, service_type, region_code, effective_from)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    actor_user_id BIGINT UNSIGNED NULL,
    actor_type VARCHAR(30) NOT NULL DEFAULT 'USER',
    action VARCHAR(120) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id BIGINT UNSIGNED NULL,
    entity_public_id VARCHAR(80) NULL,
    before_json JSON NULL,
    after_json JSON NULL,
    metadata_json JSON NULL,
    ip_address VARCHAR(64) NULL,
    user_agent VARCHAR(1000) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_audit_logs_entity (entity_type, entity_id, created_at),
    KEY idx_audit_logs_actor (actor_user_id, created_at),
    KEY idx_audit_logs_action (action, created_at),
    CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =====================================================================
-- 17. FULLTEXT AND HIGH-VALUE INDEXES
-- =====================================================================

ALTER TABLE products
    ADD FULLTEXT KEY ft_products_text (canonical_name, name_en, name_ar, description);

ALTER TABLE product_aliases
    ADD FULLTEXT KEY ft_product_aliases_alias (alias);

CREATE INDEX idx_orders_created_status ON orders (created_at, status);
CREATE INDEX idx_orders_completed_at ON orders (completed_at);
CREATE INDEX idx_orders_merchant_status ON orders (merchant_id, status, created_at);
CREATE INDEX idx_orders_customer_status ON orders (customer_id, status, created_at);
CREATE INDEX idx_merchant_products_price ON merchant_products (merchant_branch_id, base_price, discount_price);
CREATE INDEX idx_search_results_selected ON search_results (search_session_id, is_selected);
CREATE INDEX idx_delivery_messages_relay_status ON delivery_messages (relay_status, created_at);
CREATE INDEX idx_support_cases_assigned ON support_cases (assigned_user_id, status, priority);
CREATE INDEX idx_financial_transactions_reference ON financial_transactions (reference_type, reference_id);
CREATE INDEX idx_notifications_recipient_customer ON notifications (customer_id, status, created_at);
CREATE INDEX idx_notifications_recipient_driver ON notifications (driver_id, status, created_at);

-- =====================================================================
-- 18. VIEWS FOR OPERATIONS AND FINANCE
-- =====================================================================

CREATE OR REPLACE VIEW v_active_orders AS
SELECT
    o.id,
    o.public_id,
    o.order_number,
    o.status,
    o.customer_id,
    o.merchant_id,
    o.merchant_branch_id,
    o.driver_id,
    o.grand_total,
    o.currency,
    o.created_at,
    o.merchant_accepted_at,
    o.driver_assigned_at,
    o.picked_up_at,
    o.estimated_delivery_at
FROM orders o
WHERE o.status NOT IN ('DELIVERED', 'CANCELLED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

CREATE OR REPLACE VIEW v_order_profitability AS
SELECT
    o.id AS order_id,
    o.order_number,
    o.completed_at,
    f.grand_total,
    f.merchant_gross,
    f.company_commission,
    f.driver_earning,
    f.company_net_before_costs,
    o.currency
FROM orders o
JOIN order_financials f ON f.order_id = o.id;

CREATE OR REPLACE VIEW v_customer_order_summary AS
SELECT
    c.id AS customer_id,
    c.public_id AS customer_public_id,
    c.whatsapp_number,
    COUNT(o.id) AS total_orders,
    SUM(CASE WHEN o.status = 'DELIVERED' THEN 1 ELSE 0 END) AS delivered_orders,
    SUM(CASE WHEN o.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_orders,
    COALESCE(SUM(CASE WHEN o.status = 'DELIVERED' THEN o.grand_total ELSE 0 END), 0) AS delivered_value,
    MAX(o.created_at) AS last_order_at
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.public_id, c.whatsapp_number;

CREATE OR REPLACE VIEW v_merchant_performance AS
SELECT
    m.id AS merchant_id,
    m.name,
    COUNT(o.id) AS orders_received,
    SUM(CASE WHEN o.merchant_accepted_at IS NOT NULL THEN 1 ELSE 0 END) AS accepted_orders,
    SUM(CASE WHEN o.merchant_rejected_at IS NOT NULL THEN 1 ELSE 0 END) AS rejected_orders,
    SUM(CASE WHEN o.status = 'DELIVERED' THEN 1 ELSE 0 END) AS delivered_orders,
    COALESCE(SUM(CASE WHEN o.status = 'DELIVERED' THEN o.grand_total ELSE 0 END), 0) AS delivered_gmv
FROM merchants m
LEFT JOIN orders o ON o.merchant_id = m.id
GROUP BY m.id, m.name;

CREATE OR REPLACE VIEW v_driver_performance AS
SELECT
    d.id AS driver_id,
    d.display_code,
    COUNT(da.id) AS assignments,
    SUM(CASE WHEN da.status IN ('ACCEPTED','COMPLETED') THEN 1 ELSE 0 END) AS accepted_assignments,
    SUM(CASE WHEN da.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_assignments,
    d.rating,
    d.acceptance_rate
FROM drivers d
LEFT JOIN driver_assignments da ON da.driver_id = d.id
GROUP BY d.id, d.display_code, d.rating, d.acceptance_rate;

-- =====================================================================
-- 19. SEED DATA: PAYMENT METHODS, ROLES, PERMISSIONS
-- =====================================================================

INSERT INTO payment_methods (code, name, is_active) VALUES
('CASH', 'Cash', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active);

INSERT INTO roles (code, name, description, is_system) VALUES
('SUPERADMIN', 'Superadmin', 'Full platform access', 1),
('OWNER', 'Owner / General Manager', 'Business-wide management access', 1),
('OPERATIONS_MANAGER', 'Operations Manager', 'Orders, merchants, drivers and operations', 1),
('DISPATCHER', 'Dispatcher', 'Driver assignment and live delivery operations', 1),
('CUSTOMER_SUPPORT', 'Customer Support', 'Customer conversations and support cases', 1),
('FINANCE', 'Finance', 'Finance, refunds and settlements', 1),
('MERCHANT_MANAGER', 'Merchant Manager', 'Merchant onboarding and catalog management', 1),
('ANALYST', 'Analyst', 'Read-only analytics and reports', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

INSERT INTO permissions (code, module_name, name) VALUES
('dashboard.view', 'dashboard', 'View dashboard'),
('live_operations.view', 'live_operations', 'View live operations'),
('orders.view', 'orders', 'View orders'),
('orders.manage', 'orders', 'Manage orders'),
('orders.cancel', 'orders', 'Cancel orders'),
('orders.override_status', 'orders', 'Override order status'),
('customers.view', 'customers', 'View customers'),
('customers.manage', 'customers', 'Manage customers'),
('addresses.view', 'customers', 'View customer addresses'),
('merchants.view', 'merchants', 'View merchants'),
('merchants.manage', 'merchants', 'Manage merchants'),
('catalog.view', 'catalog', 'View catalog'),
('catalog.manage', 'catalog', 'Manage catalog'),
('pricing.manage', 'catalog', 'Manage pricing'),
('drivers.view', 'drivers', 'View drivers'),
('drivers.manage', 'drivers', 'Manage drivers'),
('drivers.assign', 'dispatch', 'Assign drivers'),
('dispatch.view', 'dispatch', 'View dispatch'),
('dispatch.manage', 'dispatch', 'Manage dispatch'),
('conversations.view', 'conversations', 'View conversations'),
('conversations.takeover', 'conversations', 'Take over conversations'),
('calls.view', 'communications', 'View call history'),
('calls.listen', 'communications', 'Listen to call recordings'),
('support.view', 'support', 'View support cases'),
('support.manage', 'support', 'Manage support cases'),
('complaints.manage', 'support', 'Manage complaints'),
('promotions.view', 'promotions', 'View promotions'),
('promotions.manage', 'promotions', 'Manage promotions'),
('finance.view', 'finance', 'View finance'),
('finance.manage', 'finance', 'Manage finance'),
('finance.refund', 'finance', 'Approve refunds'),
('settlements.view', 'settlements', 'View settlements'),
('settlements.manage', 'settlements', 'Manage settlements'),
('analytics.view', 'analytics', 'View analytics'),
('reports.view', 'reports', 'View reports'),
('reports.export', 'reports', 'Export reports'),
('management_ai.use', 'management_ai', 'Use management AI assistant'),
('users.view', 'users', 'View users'),
('users.manage', 'users', 'Manage users'),
('roles.view', 'roles', 'View roles and permissions'),
('roles.manage', 'roles', 'Manage roles and permissions'),
('settings.view', 'settings', 'View settings'),
('settings.manage', 'settings', 'Manage settings'),
('audit.view', 'audit', 'View audit history')
ON DUPLICATE KEY UPDATE
    module_name = VALUES(module_name),
    name = VALUES(name);

-- Superadmin receives all permissions.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPERADMIN';

-- Owner: broad business access excluding role/security administration by default.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'dashboard.view','live_operations.view',
    'orders.view','orders.manage','orders.cancel',
    'customers.view','addresses.view',
    'merchants.view','catalog.view','drivers.view','dispatch.view',
    'conversations.view','calls.view',
    'support.view','complaints.manage',
    'promotions.view',
    'finance.view','settlements.view',
    'analytics.view','reports.view','reports.export',
    'management_ai.use','audit.view'
)
WHERE r.code = 'OWNER';

-- Operations Manager
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'dashboard.view','live_operations.view',
    'orders.view','orders.manage','orders.cancel',
    'customers.view','addresses.view',
    'merchants.view','drivers.view','drivers.assign',
    'dispatch.view','dispatch.manage',
    'conversations.view','support.view','support.manage',
    'complaints.manage','analytics.view'
)
WHERE r.code = 'OPERATIONS_MANAGER';

-- Dispatcher
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'dashboard.view','live_operations.view',
    'orders.view','drivers.view','drivers.assign',
    'dispatch.view','dispatch.manage',
    'conversations.view'
)
WHERE r.code = 'DISPATCHER';

-- Support
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'dashboard.view','orders.view','customers.view','addresses.view',
    'conversations.view','conversations.takeover',
    'calls.view','support.view','support.manage','complaints.manage'
)
WHERE r.code = 'CUSTOMER_SUPPORT';

-- Finance
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'dashboard.view','orders.view',
    'finance.view','finance.manage','finance.refund',
    'settlements.view','settlements.manage',
    'analytics.view','reports.view','reports.export'
)
WHERE r.code = 'FINANCE';

-- Merchant Manager
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'dashboard.view','orders.view',
    'merchants.view','merchants.manage',
    'catalog.view','catalog.manage','pricing.manage',
    'analytics.view','reports.view'
)
WHERE r.code = 'MERCHANT_MANAGER';

-- Analyst
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'dashboard.view','orders.view','customers.view','merchants.view',
    'catalog.view','drivers.view','dispatch.view',
    'finance.view','analytics.view','reports.view','reports.export',
    'management_ai.use'
)
WHERE r.code = 'ANALYST';

-- Basic system settings
INSERT INTO system_settings (setting_key, setting_value, setting_group, description) VALUES
('order.default_currency', JSON_OBJECT('value','USD'), 'ORDERS', 'Default order currency'),
('order.driver_chat_expiry_minutes', JSON_OBJECT('value',30), 'COMMUNICATIONS', 'Minutes private delivery chat remains open after delivery'),
('order.driver_offer_timeout_seconds', JSON_OBJECT('value',60), 'DISPATCH', 'Time a driver has to accept a delivery offer'),
('merchant.default_response_timeout_seconds', JSON_OBJECT('value',180), 'MERCHANTS', 'Time before merchant non-response alert'),
('support.auto_handoff_enabled', JSON_OBJECT('value',true), 'SUPPORT', 'Allow AI to escalate conversations to human support'),
('calls.recording_default_enabled', JSON_OBJECT('value',false), 'COMMUNICATIONS', 'Call recording default; must still follow consent and policy'),
('analytics.timezone', JSON_OBJECT('value','Asia/Beirut'), 'ANALYTICS', 'Business reporting timezone')
ON DUPLICATE KEY UPDATE
    setting_value = VALUES(setting_value),
    setting_group = VALUES(setting_group),
    description = VALUES(description);

-- =====================================================================
-- 18. CONVERSATION DRAFTS AND MULTI-MERCHANT ORDER BATCHES
-- =====================================================================

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

ALTER TABLE carts ADD COLUMN order_batch_id BIGINT UNSIGNED NULL, ADD KEY idx_carts_order_batch (order_batch_id),
    ADD CONSTRAINT fk_carts_order_batch FOREIGN KEY (order_batch_id) REFERENCES order_batches(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN order_batch_id BIGINT UNSIGNED NULL, ADD KEY idx_orders_order_batch (order_batch_id),
    ADD CONSTRAINT fk_orders_order_batch FOREIGN KEY (order_batch_id) REFERENCES order_batches(id) ON DELETE SET NULL;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- END OF LION DELIVERY FULL DATABASE SCHEMA
-- =====================================================================
