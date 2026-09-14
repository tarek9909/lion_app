import { pool } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword } from '../modules/auth/auth.service.js';

export async function seedDemoData() {
  console.log('[Seed] Starting Lion Delivery demo dataset seeding...');
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Delivery Zone
    await conn.query(`
      INSERT INTO delivery_zones (public_id, name, code, description, zone_type, center_latitude, center_longitude, radius_km, base_delivery_fee, status)
      VALUES ('11111111-1111-4111-8111-111111111111', 'Saida Central', 'SAIDA_CENTRAL', 'Saida urban area coverage', 'AREA', 33.5631, 35.3725, 8.5, 1.50, 'ACTIVE')
      ON DUPLICATE KEY UPDATE name=VALUES(name), base_delivery_fee=VALUES(base_delivery_fee);
    `);

    const [zones]: any = await conn.query(`SELECT id FROM delivery_zones WHERE code='SAIDA_CENTRAL' LIMIT 1`);
    const zoneId = zones[0].id;

    // 2. Admin User (G-006: Real PBKDF2 Password Hash)
    const adminHash = hashPassword('admin123');
    await conn.query(`
      INSERT INTO users (public_id, full_name, email, username, password_hash, status)
      VALUES ('22222222-2222-4222-8222-222222222222', 'Lion Admin', 'admin@liondelivery.com', 'admin', ?, 'ACTIVE')
      ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), full_name='Lion Admin', status='ACTIVE';
    `, [adminHash]);

    // Ensure DRIVER and CUSTOMER roles exist (G-040, G-058)
    await conn.query(`
      INSERT INTO roles (code, name, description, is_system, is_active)
      VALUES 
        ('DRIVER', 'Delivery Driver', 'Driver mobile application access', 1, 1),
        ('CUSTOMER', 'Customer', 'Customer web/mobile access', 1, 1)
      ON DUPLICATE KEY UPDATE name=VALUES(name);
    `);

    const [adminUser]: any = await conn.query(`SELECT id FROM users WHERE email='admin@liondelivery.com' LIMIT 1`);
    const [superRole]: any = await conn.query(`SELECT id FROM roles WHERE code='SUPERADMIN' LIMIT 1`);
    if (adminUser.length && superRole.length) {
      await conn.query(`
        INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)
      `, [adminUser[0].id, superRole[0].id]);
    }

    // Seed Driver 1 and Driver 2 Users (G-040)
    const driverHash = hashPassword('driver123');
    const [driverRole]: any = await conn.query(`SELECT id FROM roles WHERE code='DRIVER' LIMIT 1`);
    
    await conn.query(`
      INSERT INTO users (public_id, full_name, email, username, phone, password_hash, status)
      VALUES 
        ('33333333-3333-4333-8333-333333333331', 'Ahmad Saleh Driver', 'driver1@liondelivery.com', 'driver1', '96176111222', ?, 'ACTIVE'),
        ('33333333-3333-4333-8333-333333333332', 'Ziad Kabbani Driver', 'driver2@liondelivery.com', 'driver2', '96176333444', ?, 'ACTIVE')
      ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), phone=VALUES(phone), status='ACTIVE';
    `, [driverHash, driverHash]);

    if (driverRole.length) {
      const [dUsers]: any = await conn.query(`SELECT id FROM users WHERE email IN ('driver1@liondelivery.com', 'driver2@liondelivery.com')`);
      for (const du of dUsers) {
        await conn.query(`INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)`, [du.id, driverRole[0].id]);
      }
    }

    // Seed Customer 1 and Customer 2 Users (G-040)
    const customerHash = hashPassword('customer123');
    const [custRole]: any = await conn.query(`SELECT id FROM roles WHERE code='CUSTOMER' LIMIT 1`);

    await conn.query(`
      INSERT INTO users (public_id, full_name, email, username, phone, password_hash, status)
      VALUES 
        ('44444444-4444-4444-8444-444444444441', 'Demo Customer User', 'customer1@liondelivery.com', 'customer1', '96170123456', ?, 'ACTIVE'),
        ('44444444-4444-4444-8444-444444444442', 'Sarah Mansour User', 'customer2@liondelivery.com', 'customer2', '96171987654', ?, 'ACTIVE')
      ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), phone=VALUES(phone), status='ACTIVE';
    `, [customerHash, customerHash]);

    if (custRole.length) {
      const [cUsers]: any = await conn.query(`SELECT id FROM users WHERE email IN ('customer1@liondelivery.com', 'customer2@liondelivery.com')`);
      for (const cu of cUsers) {
        await conn.query(`INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)`, [cu.id, custRole[0].id]);
      }
    }

    // 3. Merchants & Branches
    const merchantsData = [
      {
        name: 'Chicken House',
        type: 'RESTAURANT',
        rating: 4.80,
        prep: 20,
        commission: 0.10,
        branch: 'Chicken House Saida',
        address: 'Riad Solh Street, Saida',
        lat: 33.5620,
        lng: 35.3710,
      },
      {
        name: 'Burger Spot',
        type: 'RESTAURANT',
        rating: 4.50,
        prep: 18,
        commission: 0.10,
        branch: 'Burger Spot Saida',
        address: 'Corniche El Baher, Saida',
        lat: 33.5645,
        lng: 35.3730,
      },
      {
        name: 'Beirut Sweets & Cafe',
        type: 'CAFE',
        rating: 4.90,
        prep: 15,
        commission: 0.12,
        branch: 'Beirut Sweets Saida',
        address: 'Nejmeh Square, Saida',
        lat: 33.5610,
        lng: 35.3740,
      },
      {
        name: 'Metro Supermarket',
        type: 'SUPERMARKET',
        rating: 4.65,
        prep: 15,
        commission: 0.08,
        branch: 'Metro Supermarket Saida Branch',
        address: 'Eastern Boulevard, Saida',
        lat: 33.5590,
        lng: 35.3780,
      },
    ];

    const merchantMap: Record<string, { merchantId: number; branchId: number }> = {};

    for (const m of merchantsData) {
      let [mRow]: any = await conn.query(`SELECT id FROM merchants WHERE name=? LIMIT 1`, [m.name]);
      let mId: number;
      if (mRow.length > 0) {
        mId = mRow[0].id;
        await conn.query(`
          UPDATE merchants SET merchant_type=?, rating=?, commission_value=?, default_preparation_minutes=?, status='ACTIVE', accepts_orders=1
          WHERE id=?
        `, [m.type, m.rating, m.commission, m.prep, mId]);
      } else {
        const [res]: any = await conn.query(`
          INSERT INTO merchants (public_id, name, merchant_type, rating, commission_value, default_preparation_minutes, status, accepts_orders)
          VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 1)
        `, [uuidv4(), m.name, m.type, m.rating, m.commission, m.prep]);
        mId = res.insertId;
      }

      let [bRow]: any = await conn.query(`SELECT id FROM merchant_branches WHERE merchant_id=? AND name=? LIMIT 1`, [mId, m.branch]);
      let bId: number;
      if (bRow.length > 0) {
        bId = bRow[0].id;
        await conn.query(`
          UPDATE merchant_branches SET address=?, latitude=?, longitude=?, status='ACTIVE', accepts_orders=1, preparation_minutes=?
          WHERE id=?
        `, [m.address, m.lat, m.lng, m.prep, bId]);
      } else {
        const [res]: any = await conn.query(`
          INSERT INTO merchant_branches (public_id, merchant_id, name, address, latitude, longitude, status, accepts_orders, preparation_minutes)
          VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?)
        `, [uuidv4(), mId, m.branch, m.address, m.lat, m.lng, m.prep]);
        bId = res.insertId;
      }

      await conn.query(`
        INSERT IGNORE INTO merchant_branch_delivery_zones (merchant_branch_id, delivery_zone_id, delivery_fee_override, estimated_minutes)
        VALUES (?, ?, 1.50, ?)
      `, [bId, zoneId, m.prep + 15]);

      // Seed Operating Hours: open every day 08:00 - 23:59 (G-023)
      for (let day = 0; day <= 6; day++) {
        await conn.query(`
          INSERT INTO merchant_operating_hours (merchant_branch_id, day_of_week, open_time, close_time, is_closed)
          VALUES (?, ?, '08:00:00', '23:59:59', 0)
          ON DUPLICATE KEY UPDATE open_time='08:00:00', close_time='23:59:59', is_closed=0;
        `, [bId, day]);
      }

      merchantMap[m.name] = { merchantId: mId, branchId: bId };
    }

    // 4. Categories
    const categories = [
      { name_en: 'Meals & Sandwiches', name_ar: 'وجبات وسندويشات', slug: 'meals' },
      { name_en: 'Burgers', name_ar: 'برغر', slug: 'burgers' },
      { name_en: 'Desserts & Sweets', name_ar: 'حلويات', slug: 'sweets' },
      { name_en: 'Beverages', name_ar: 'مشروبات', slug: 'beverages' },
      { name_en: 'Groceries', name_ar: 'سوبرماركت', slug: 'groceries' },
    ];

    const categoryMap: Record<string, number> = {};
    for (const cat of categories) {
      await conn.query(`
        INSERT INTO categories (public_id, name_en, name_ar, slug, status)
        VALUES (?, ?, ?, ?, 'ACTIVE')
        ON DUPLICATE KEY UPDATE name_ar=VALUES(name_ar);
      `, [uuidv4(), cat.name_en, cat.name_ar, cat.slug]);
      const [cRow]: any = await conn.query(`SELECT id FROM categories WHERE slug=? LIMIT 1`, [cat.slug]);
      categoryMap[cat.slug] = cRow[0].id;
    }

    // 5. Products, Aliases & Merchant Products
    interface SeedProduct {
      merchant: string;
      canonical: string;
      name_en: string;
      name_ar: string;
      categorySlug: string;
      price: number;
      description: string;
      aliases: string[];
    }

    const productsData: SeedProduct[] = [
      // Chicken House
      {
        merchant: 'Chicken House',
        canonical: 'Crispy Chicken Meal',
        name_en: 'Crispy Chicken Meal',
        name_ar: 'وجبة كرسبي دجاج',
        categorySlug: 'meals',
        price: 10.50,
        description: '4 pieces of golden crispy chicken strips with fries, coleslaw, garlic dip and bun',
        aliases: ['crispy', 'crispy chicken', 'كرسبي', 'كريسبي', 'crispy meal', 'crispy djej', 'djej crispy', 'وجبة كرسبي', 'crispy chicken meal'],
      },
      {
        merchant: 'Chicken House',
        canonical: 'Chicken Burger',
        name_en: 'Chicken Burger Sandwich',
        name_ar: 'سندويش برغر دجاج',
        categorySlug: 'burgers',
        price: 6.50,
        description: 'Tender chicken patty, lettuce, mayo and pickles',
        aliases: ['chicken burger', 'برغر دجاج', 'برجر دجاج', 'chiken burger', 'burger djej'],
      },
      {
        merchant: 'Chicken House',
        canonical: 'French Fries',
        name_en: 'Large French Fries',
        name_ar: 'بطاطا مقلية كبيرة',
        categorySlug: 'meals',
        price: 2.50,
        description: 'Crispy salted golden french fries',
        aliases: ['fries', 'french fries', 'بطاطا', 'بطاطس', 'batata', 'potatoes'],
      },
      {
        merchant: 'Chicken House',
        canonical: 'Coke Zero',
        name_en: 'Coca-Cola Zero Can',
        name_ar: 'كوكا كولا زيرو',
        categorySlug: 'beverages',
        price: 1.50,
        description: 'Zero calorie refreshing cola',
        aliases: ['coke zero', 'كولا زيرو', 'cola zero', 'diet coke', 'كوكا زيرو'],
      },
      {
        merchant: 'Chicken House',
        canonical: 'Regular Coca-Cola',
        name_en: 'Coca-Cola Regular Can',
        name_ar: 'كوكا كولا عادية',
        categorySlug: 'beverages',
        price: 1.50,
        description: 'Classic Coca-Cola can',
        aliases: ['coke', 'cola', 'كولا', 'كوكا كولا', 'coca cola'],
      },

      // Burger Spot
      {
        merchant: 'Burger Spot',
        canonical: 'Double Crispy Meal',
        name_en: 'Double Crispy Chicken Meal',
        name_ar: 'وجبة دبل كرسبي',
        categorySlug: 'meals',
        price: 12.00,
        description: 'Double portion crispy chicken tenders with cheddar sauce and seasoned fries',
        aliases: ['double crispy', 'double crispy meal', 'كرسبي دبل', 'دبل كرسبي', 'crispy chicken'],
      },
      {
        merchant: 'Burger Spot',
        canonical: 'Gourmet Beef Burger',
        name_en: 'Gourmet Beef Burger',
        name_ar: 'برغر لحم جورميه',
        categorySlug: 'burgers',
        price: 8.50,
        description: '150g Angus beef patty, caramelized onions and melted cheddar',
        aliases: ['beef burger', 'برغر لحمة', 'برجر لحم', 'burger la7me'],
      },
      {
        merchant: 'Burger Spot',
        canonical: 'Coke Zero',
        name_en: 'Coca-Cola Zero Can',
        name_ar: 'كوكا كولا زيرو',
        categorySlug: 'beverages',
        price: 1.50,
        description: 'Zero calorie cold cola',
        aliases: ['coke zero', 'كولا زيرو', 'cola zero'],
      },
      {
        merchant: 'Burger Spot',
        canonical: 'French Fries',
        name_en: 'Seasoned French Fries',
        name_ar: 'بطاطا مقلية بالبهارات',
        categorySlug: 'meals',
        price: 2.00,
        description: 'House seasoned crispy fries',
        aliases: ['fries', 'french fries', 'بطاطا', 'batata'],
      },

      // Beirut Sweets & Cafe
      {
        merchant: 'Beirut Sweets & Cafe',
        canonical: 'Nutella Crepe',
        name_en: 'Nutella Crepe with Strawberries',
        name_ar: 'كريب نوتيلا مع فريز',
        categorySlug: 'sweets',
        price: 4.50,
        description: 'Warm French crepe generously filled with Nutella and fresh berries',
        aliases: ['crepe', 'كريب', 'نوتيلا', 'nutella', 'كريب نوتيلا', 'shi 7elo', 'شي حلو'],
      },
      {
        merchant: 'Beirut Sweets & Cafe',
        canonical: 'Chocolate Cake Slice',
        name_en: 'Fudge Chocolate Cake Slice',
        name_ar: 'قطعة كيك شوكولا فادج',
        categorySlug: 'sweets',
        price: 2.50,
        description: 'Rich dark chocolate fudge cake slice',
        aliases: ['chocolate', 'chocolate cake', 'شوكولا', 'كيك شوكولا', 'كاتو', 'shi 7elo', 'شي حلو', 'sweet', 'gateau'],
      },
      {
        merchant: 'Beirut Sweets & Cafe',
        canonical: 'Ice Cream Trio',
        name_en: 'Ice Cream 3 Scoops',
        name_ar: 'بوظة ٣ طابات',
        categorySlug: 'sweets',
        price: 2.80,
        description: 'Choice of chocolate, vanilla and strawberry artisanal ice cream',
        aliases: ['ice cream', 'بوظة', 'ايس كريم', 'bouza', 'boza'],
      },

      // Metro Supermarket
      {
        merchant: 'Metro Supermarket',
        canonical: 'Coke Zero Can 330ml',
        name_en: 'Coca-Cola Zero Can 330ml',
        name_ar: 'كوكا كولا زيرو علبة ٣٣٠ مل',
        categorySlug: 'groceries',
        price: 0.75,
        description: 'Chilled 330ml can of Coke Zero',
        aliases: ['coke zero', 'كولا زيرو', 'cola zero', 'علبة كولا'],
      },
      {
        merchant: 'Metro Supermarket',
        canonical: 'Fresh Milk 1L',
        name_en: 'Candia Fresh Milk Full Cream 1L',
        name_ar: 'حليب كانديا كامل الدسم ١ ليتر',
        categorySlug: 'groceries',
        price: 1.50,
        description: 'Pasteurized 1 liter fresh whole milk carton',
        aliases: ['milk', 'حليب', '7alib', 'carton milk', 'قنينة حليب'],
      },
      {
        merchant: 'Metro Supermarket',
        canonical: 'White Sliced Bread',
        name_en: 'Wooden Bakery White Sliced Toast Bread',
        name_ar: 'خبز توست ابيض مقطع',
        categorySlug: 'groceries',
        price: 1.00,
        description: 'Fresh sliced white bread loaf',
        aliases: ['bread', 'خبز', 'khebez', 'toast', 'pain de mie', 'خبز توست'],
      },
      {
        merchant: 'Metro Supermarket',
        canonical: 'Lays Salt Chips',
        name_en: 'Lays Salted Potato Chips 85g',
        name_ar: 'شيبس ليز بالملح ٨٥ غرام',
        categorySlug: 'groceries',
        price: 1.25,
        description: 'Crispy salted potato chips pouch',
        aliases: ['lays', 'lays salt', 'بطاطا ليز', 'chips', 'ليز بالملح', 'شيبس'],
      },
      {
        merchant: 'Metro Supermarket',
        canonical: 'Mineral Water 1.5L',
        name_en: 'Sohat Natural Mineral Water 1.5L',
        name_ar: 'مياه صحة معدنية ١.٥ ليتر',
        categorySlug: 'groceries',
        price: 0.50,
        description: 'Natural mineral drinking water bottle',
        aliases: ['water', 'mayy', 'مياه', 'may', 'sohat', 'قنينة مي'],
      },
      {
        merchant: 'Metro Supermarket',
        canonical: 'Nutella Jar 400g',
        name_en: 'Nutella Hazelnut Spread Jar 400g',
        name_ar: 'مرطبان شوكولا نوتيلا ٤٠٠ غرام',
        categorySlug: 'groceries',
        price: 3.50,
        description: 'Original Ferrero Nutella hazelnut cocoa spread jar',
        aliases: ['nutella', 'نوتيلا', 'chocolate jar', 'مرطبان نوتيلا'],
      },
    ];

    for (const p of productsData) {
      const catId = categoryMap[p.categorySlug] || null;
      let [pRow]: any = await conn.query(`SELECT id FROM products WHERE canonical_name=? LIMIT 1`, [p.canonical]);
      let prodId: number;
      if (pRow.length > 0) {
        prodId = pRow[0].id;
        await conn.query(`
          UPDATE products SET name_en=?, name_ar=?, description=?, category_id=?, status='ACTIVE'
          WHERE id=?
        `, [p.name_en, p.name_ar, p.description, catId, prodId]);
      } else {
        const [res]: any = await conn.query(`
          INSERT INTO products (public_id, canonical_name, name_en, name_ar, description, category_id, status)
          VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
        `, [uuidv4(), p.canonical, p.name_en, p.name_ar, p.description, catId]);
        prodId = res.insertId;
      }

      // Aliases
      for (const alias of p.aliases) {
        await conn.query(`
          INSERT IGNORE INTO product_aliases (product_id, alias, alias_type, weight)
          VALUES (?, ?, 'SEARCH', 1.0)
        `, [prodId, alias.toLowerCase().trim()]);
      }

      // Link to merchant branch
      const mInfo = merchantMap[p.merchant];
      if (mInfo) {
        const [existingMp]: any = await conn.query(`
          SELECT id FROM merchant_products WHERE merchant_branch_id=? AND product_id=? LIMIT 1
        `, [mInfo.branchId, prodId]);

        if (existingMp.length > 0) {
          await conn.query(`
            UPDATE merchant_products SET base_price=?, is_available=1, status='ACTIVE', merchant_product_name=?
            WHERE id=?
          `, [p.price, p.name_en, existingMp[0].id]);
        } else {
          await conn.query(`
            INSERT INTO merchant_products (public_id, merchant_branch_id, product_id, merchant_product_name, base_price, is_available, status)
            VALUES (?, ?, ?, ?, ?, 1, 'ACTIVE')
          `, [uuidv4(), mInfo.branchId, prodId, p.name_en, p.price]);
        }
      }
    }

    // 6. Product Variants & Merchant Product Variants (G-029)
    const variantsData = [
      {
        productCanonical: 'Crispy Chicken Meal',
        variants: [
          { name: 'Regular Crispy Meal', size: 'Regular', delta: 0.00, order: 1 },
          { name: 'Large Crispy Meal', size: 'Large', delta: 2.50, order: 2 },
        ],
      },
      {
        productCanonical: 'Coke Zero',
        variants: [
          { name: 'Can 330ml', size: 'Regular', delta: 0.00, order: 1 },
          { name: 'Bottle 500ml', size: 'Large', delta: 0.50, order: 2 },
        ],
      },
    ];

    for (const vd of variantsData) {
      const [prodRows]: any = await conn.query(`SELECT id FROM products WHERE canonical_name=? LIMIT 1`, [vd.productCanonical]);
      if (prodRows.length > 0) {
        const pId = prodRows[0].id;
        for (const v of vd.variants) {
          let [vRow]: any = await conn.query(`SELECT id FROM product_variants WHERE product_id=? AND size_label=? LIMIT 1`, [pId, v.size]);
          let variantId: number;
          if (vRow.length > 0) {
            variantId = vRow[0].id;
            await conn.query(`UPDATE product_variants SET name=?, sort_order=?, status='ACTIVE' WHERE id=?`, [v.name, v.order, variantId]);
          } else {
            const [res]: any = await conn.query(`
              INSERT INTO product_variants (public_id, product_id, name, size_label, sort_order, status)
              VALUES (?, ?, ?, ?, ?, 'ACTIVE')
            `, [uuidv4(), pId, v.name, v.size, v.order]);
            variantId = res.insertId;
          }

          // Link to all merchant_products of this product
          const [mpRows]: any = await conn.query(`SELECT id, base_price FROM merchant_products WHERE product_id=?`, [pId]);
          for (const mp of mpRows) {
            const [existingMpv]: any = await conn.query(
              `SELECT id FROM merchant_product_variants WHERE merchant_product_id=? AND product_variant_id=? LIMIT 1`,
              [mp.id, variantId]
            );
            if (existingMpv.length > 0) {
              await conn.query(`UPDATE merchant_product_variants SET price_delta=?, is_available=1 WHERE id=?`, [v.delta, existingMpv[0].id]);
            } else {
              await conn.query(`
                INSERT INTO merchant_product_variants (merchant_product_id, product_variant_id, price_delta, fixed_price, is_available)
                VALUES (?, ?, ?, ?, 1)
              `, [mp.id, variantId, v.delta, parseFloat(mp.base_price) + v.delta]);
            }
          }
        }
      }
    }

    // 7. Demo Customers & Multiple Saved Addresses (G-015)
    const customersData = [
      {
        name: 'Demo Customer',
        phone: '96170123456',
        language: 'ar',
        addresses: [
          {
            label: 'Home',
            formatted: 'Al-Bahr Building, 3rd Floor, Saida',
            area: 'Saida Coastal Area',
            building: 'Al-Bahr Bldg',
            floor: '3',
            apartment: '3B',
            landmark: 'Opposite Sea Castle',
            notes: 'Blue gate, press top buzzer. Leave package if buzzer unresponsive.',
            lat: 33.5635,
            lng: 35.3720,
            isDefault: 1,
          },
          {
            label: 'Work',
            formatted: 'Saida Medical Center, 2nd Floor, Riad Solh Street',
            area: 'Saida Central',
            building: 'Medical Center Tower',
            floor: '2',
            apartment: 'Clinic 204',
            landmark: 'Next to Al-Omari Mosque',
            notes: 'Reception desk on 2nd floor, ask for Dr. Demo.',
            lat: 33.5622,
            lng: 35.3715,
            isDefault: 0,
          },
        ],
      },
      {
        name: 'Sarah Mansour',
        phone: '96171987654',
        language: 'en',
        addresses: [
          {
            label: 'Work',
            formatted: 'Saida Boulevard Tower, 1st Floor',
            area: 'Saida City Center',
            building: 'Boulevard Center',
            floor: '1',
            apartment: 'Office 102',
            landmark: 'Above Bank of Beirut',
            notes: 'Front desk reception.',
            lat: 33.5615,
            lng: 35.3745,
            isDefault: 1,
          },
          {
            label: 'Home',
            formatted: 'Jezzine Street, Villa 12, Saida',
            area: 'Saida East',
            building: 'Villa Mansour',
            floor: 'GF',
            apartment: 'Villa',
            landmark: 'Behind Government Hospital',
            notes: 'Ring main gate intercom.',
            lat: 33.5580,
            lng: 35.3810,
            isDefault: 0,
          },
        ],
      },
    ];

    for (const cust of customersData) {
      await conn.query(`
        INSERT INTO customers (public_id, whatsapp_number, display_name, preferred_language, status)
        VALUES (?, ?, ?, ?, 'ACTIVE')
        ON DUPLICATE KEY UPDATE display_name=VALUES(display_name);
      `, [uuidv4(), cust.phone, cust.name, cust.language]);

      const [cRow]: any = await conn.query(`SELECT id FROM customers WHERE whatsapp_number=? LIMIT 1`, [cust.phone]);
      const customerId = cRow[0].id;

      for (const addr of cust.addresses) {
        const [existingAddr]: any = await conn.query(
          `SELECT id FROM customer_addresses WHERE customer_id=? AND label=? LIMIT 1`,
          [customerId, addr.label]
        );
        let addressId: number;
        if (existingAddr.length > 0) {
          addressId = existingAddr[0].id;
          await conn.query(`
            UPDATE customer_addresses 
            SET formatted_address=?, area_name=?, building=?, floor=?, apartment=?, landmark=?, delivery_notes=?, latitude=?, longitude=?, is_default=?, status='ACTIVE'
            WHERE id=?
          `, [
            addr.formatted, addr.area, addr.building, addr.floor, addr.apartment,
            addr.landmark, addr.notes, addr.lat, addr.lng, addr.isDefault, addressId
          ]);
        } else {
          const [res]: any = await conn.query(`
            INSERT INTO customer_addresses (public_id, customer_id, label, formatted_address, area_name, building, floor, apartment, landmark, delivery_notes, latitude, longitude, is_default, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
          `, [
            uuidv4(), customerId, addr.label, addr.formatted, addr.area, addr.building,
            addr.floor, addr.apartment, addr.landmark, addr.notes, addr.lat, addr.lng, addr.isDefault
          ]);
          addressId = res.insertId;
        }

        if (addr.isDefault) {
          await conn.query(`UPDATE customers SET default_address_id=? WHERE id=?`, [addressId, customerId]);
        }
      }
    }

    // 8. Drivers
    const driversData = [
      {
        code: 'D-101',
        phone: '96176111222',
        name: 'Ahmad Saleh',
        vehicle: 'Motorcycle Honda 150',
        rating: 4.90,
        latitude: 33.5638,
        longitude: 35.3718,
      },
      {
        code: 'D-102',
        phone: '96176333444',
        name: 'Ziad Kabbani',
        vehicle: 'Motorcycle Yamaha 125',
        rating: 4.75,
        latitude: 33.5609,
        longitude: 35.3742,
      },
      {
        code: 'D-103',
        phone: '96176555666',
        name: 'Omar Najjar',
        vehicle: 'Renault Clio (Car)',
        rating: 4.85,
        latitude: 33.5652,
        longitude: 35.3698,
      },
    ];

    for (const d of driversData) {
      await conn.query(`
        INSERT INTO drivers (public_id, display_code, whatsapp_number, full_name_private, phone_private, status, availability_status, vehicle_type, rating)
        VALUES (?, ?, ?, ?, ?, 'ACTIVE', 'AVAILABLE', ?, ?)
        ON DUPLICATE KEY UPDATE availability_status='AVAILABLE', status='ACTIVE';
      `, [uuidv4(), d.code, d.phone, d.name, d.phone, d.vehicle, d.rating]);

      const [dRow]: any = await conn.query(`SELECT id FROM drivers WHERE display_code=? LIMIT 1`, [d.code]);
      await conn.query(`
        INSERT IGNORE INTO driver_delivery_zones (driver_id, delivery_zone_id, is_active)
        VALUES (?, ?, 1)
      `, [dRow[0].id, zoneId]);
      await conn.query(`DELETE FROM driver_locations WHERE driver_id = ?`, [dRow[0].id]);
      await conn.query(`
        INSERT INTO driver_locations (driver_id, latitude, longitude, accuracy_meters, speed_kmh)
        VALUES (?, ?, ?, 25, 0)
      `, [dRow[0].id, d.latitude, d.longitude]);
    }

    // 9. Historical Orders with complete order_items, status history, and delivery channels (G-013)
    const [custRow]: any = await conn.query(`SELECT id, default_address_id FROM customers WHERE whatsapp_number='96170123456' LIMIT 1`);
    const demoCustId = custRow[0].id;
    const demoAddrId = custRow[0].default_address_id;
    const chInfo = merchantMap['Chicken House'];
    const [dRow]: any = await conn.query(`SELECT id FROM drivers WHERE display_code='D-101' LIMIT 1`);
    const driverId = dRow[0].id;

    const [crispyMp]: any = await conn.query(`
      SELECT mp.id, mp.base_price, p.id as product_id, p.canonical_name 
      FROM merchant_products mp 
      JOIN products p ON p.id = mp.product_id 
      WHERE p.canonical_name = 'Crispy Chicken Meal' AND mp.merchant_branch_id = ? LIMIT 1
    `, [chInfo.branchId]);

    const [cokeMp]: any = await conn.query(`
      SELECT mp.id, mp.base_price, p.id as product_id, p.canonical_name 
      FROM merchant_products mp 
      JOIN products p ON p.id = mp.product_id 
      WHERE p.canonical_name = 'Coke Zero' AND mp.merchant_branch_id = ? LIMIT 1
    `, [chInfo.branchId]);

    for (let i = 1; i <= 4; i++) {
      const orderNum = `ORD-DEMO-00${i}`;
      const subtotal = 12.00;
      const deliveryFee = 1.50;
      const grandTotal = 13.50;
      const orderPublicId = `00000000-0000-4000-a000-00000000000${i}`;

      const [existingOrd]: any = await conn.query(`SELECT id FROM orders WHERE order_number=? LIMIT 1`, [orderNum]);
      let oId: number;
      if (existingOrd.length > 0) {
        oId = existingOrd[0].id;
        await conn.query(`
          UPDATE orders SET status='DELIVERED', driver_id=?, subtotal=?, delivery_fee=?, grand_total=?, payment_status='PAID' WHERE id=?
        `, [driverId, subtotal, deliveryFee, grandTotal, oId]);
      } else {
        const [res]: any = await conn.query(`
          INSERT INTO orders (public_id, order_number, customer_id, merchant_id, merchant_branch_id, customer_address_id, driver_id, status, subtotal, delivery_fee, grand_total, payment_status, confirmed_at, merchant_accepted_at, picked_up_at, delivered_at, completed_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'DELIVERED', ?, ?, ?, 'PAID', NOW() - INTERVAL ${i * 2} HOUR, NOW() - INTERVAL ${i * 2} HOUR, NOW() - INTERVAL ${i * 2 - 1} HOUR, NOW() - INTERVAL ${i} HOUR, NOW() - INTERVAL ${i} HOUR, NOW() - INTERVAL ${i * 2} HOUR)
        `, [orderPublicId, orderNum, demoCustId, chInfo.merchantId, chInfo.branchId, demoAddrId, driverId, subtotal, deliveryFee, grandTotal]);
        oId = res.insertId;
      }

      // Order items
      await conn.query(`DELETE FROM order_items WHERE order_id=?`, [oId]);
      if (crispyMp.length > 0) {
        await conn.query(`
          INSERT INTO order_items (order_id, merchant_product_id, product_id, product_name_snapshot, quantity, unit_price, line_total, item_status)
          VALUES (?, ?, ?, 'Crispy Chicken Meal', 1, 10.50, 10.50, 'DELIVERED')
        `, [oId, crispyMp[0].id, crispyMp[0].product_id]);
      }
      if (cokeMp.length > 0) {
        await conn.query(`
          INSERT INTO order_items (order_id, merchant_product_id, product_id, product_name_snapshot, quantity, unit_price, line_total, item_status)
          VALUES (?, ?, ?, 'Coke Zero', 1, 1.50, 1.50, 'DELIVERED')
        `, [oId, cokeMp[0].id, cokeMp[0].product_id]);
      }

      // Order status history
      await conn.query(`DELETE FROM order_status_history WHERE order_id=?`, [oId]);
      await conn.query(`
        INSERT INTO order_status_history (order_id, previous_status, new_status, actor_type, note, created_at)
        VALUES 
        (?, NULL, 'CONFIRMED', 'CUSTOMER', 'Order confirmed via WhatsApp', NOW() - INTERVAL ${i * 2} HOUR),
        (?, 'CONFIRMED', 'PREPARING', 'MERCHANT', 'Merchant accepted', NOW() - INTERVAL ${i * 2} HOUR),
        (?, 'PREPARING', 'DRIVER_ASSIGNED', 'DRIVER', 'Driver assigned', NOW() - INTERVAL ${i * 2} HOUR),
        (?, 'DRIVER_ASSIGNED', 'PICKED_UP', 'DRIVER', 'Driver picked up', NOW() - INTERVAL ${i * 2 - 1} HOUR),
        (?, 'PICKED_UP', 'DELIVERED', 'DRIVER', 'Delivered to customer', NOW() - INTERVAL ${i} HOUR)
      `, [oId, oId, oId, oId, oId]);

      // Delivery channel
      await conn.query(`DELETE FROM delivery_channels WHERE order_id=?`, [oId]);
      await conn.query(`
        INSERT INTO delivery_channels (public_id, order_id, customer_id, driver_id, status)
        VALUES (?, ?, ?, ?, 'CLOSED')
      `, [uuidv4(), oId, demoCustId, driverId]);

      // Order review
      await conn.query(`
        INSERT INTO order_reviews (order_id, customer_id, overall_rating, comment)
        VALUES (?, ?, 5, 'Great delivery, food was fresh and hot!')
        ON DUPLICATE KEY UPDATE overall_rating=5;
      `, [oId, demoCustId]);
    }

    // Daily analytics row for today
    await conn.query(`
      INSERT INTO analytics_daily_orders (metric_date, total_orders, completed_orders, cancelled_orders, gross_order_value, average_order_value, average_delivery_minutes)
      VALUES (CURRENT_DATE(), 6, 4, 1, 98.50, 16.40, 24.5)
      ON DUPLICATE KEY UPDATE total_orders=VALUES(total_orders), completed_orders=VALUES(completed_orders), gross_order_value=VALUES(gross_order_value);
    `);

    await conn.commit();
    console.log('[Seed] Demo dataset seeded successfully!');
  } catch (error) {
    await conn.rollback();
    console.error('[Seed] Failed to seed demo data:', error);
    throw error;
  } finally {
    conn.release();
  }
}

// Run directly if invoked from command line
if (process.argv[1]?.endsWith('seed-demo.ts') || process.argv[1]?.endsWith('seed-demo.js')) {
  seedDemoData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
