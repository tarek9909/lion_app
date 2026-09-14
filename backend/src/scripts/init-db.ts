import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { config } from '../config/env.js';
import { seedDemoData } from './seed-demo.js';
import { testDbConnection, query } from '../database/db.js';

export async function initDatabase(): Promise<boolean> {
  console.log('🚀 Starting Lion Delivery database initialization...');
  console.log(`Connecting to MySQL host: ${config.db.host}:${config.db.port} as ${config.db.user}...`);

  // Connect without database selected first
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  try {
    const sqlPath = path.resolve(process.cwd(), '../Lion_Delivery_Full_MySQL_Database.sql');
    const altSqlPath = path.resolve(process.cwd(), 'Lion_Delivery_Full_MySQL_Database.sql');
    const finalSqlPath = fs.existsSync(sqlPath) ? sqlPath : altSqlPath;

    if (!fs.existsSync(finalSqlPath)) {
      throw new Error(`SQL schema file not found at: ${finalSqlPath}`);
    }

    console.log(`📖 Reading schema file: ${finalSqlPath}`);
    const sqlContent = fs.readFileSync(finalSqlPath, 'utf8');

    console.log('⚙️  Executing database creation and schema migration...');
    await connection.query(sqlContent);
    console.log('✅ Schema migration executed successfully.');

    await connection.end();

    // Verify connection through application pool
    console.log('🔍 Testing application database pool connection...');
    const connected = await testDbConnection();
    if (!connected) {
      throw new Error('Application pool failed to connect to initialized database.');
    }

    const tables: any = await query(`SHOW TABLES;`);
    console.log(`✅ Database '${config.db.database}' initialized with ${tables.length} tables/views.`);

    // Seed base demo data
    console.log('🌱 Seeding demo dataset...');
    await seedDemoData();
    console.log('🎉 Database initialization and demo seeding complete!');

    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    try {
      await connection.end();
    } catch {}
    return false;
  }
}

// Direct execution
if (process.argv[1] && process.argv[1].endsWith('init-db.ts')) {
  initDatabase()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
