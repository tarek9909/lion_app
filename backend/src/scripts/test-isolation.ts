import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function identifier(value: string) {
  return String.fromCharCode(96) + value + String.fromCharCode(96);
}

export function isolatedRedisUrl() {
  const configured = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  try {
    const url = new URL(configured);
    url.pathname = '/15';
    return url.toString();
  } catch {
    return configured;
  }
}

export async function createIsolatedDatabase() {
  const databaseName = 'lion_delivery_test_' + process.pid + '_' + Date.now();
  if (!/^lion_delivery_test_[0-9]+_[0-9]+$/.test(databaseName)) {
    throw new Error('Refusing to create an unexpected test database name');
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD === '__NO_PASSWORD__' ? '' : process.env.DB_PASSWORD === '' ? undefined : process.env.DB_PASSWORD ?? 'mysql',
    multipleStatements: true,
  });
  try {
    await connection.query(
      'CREATE DATABASE ' + identifier(databaseName) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    );
    const schemaPath = path.resolve(process.cwd(), '../Lion_Delivery_Full_MySQL_Database.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8').replace(/\blion_delivery\b/g, databaseName);
    await connection.query(schema);
  } catch (error) {
    await connection.query('DROP DATABASE IF EXISTS ' + identifier(databaseName)).catch(() => undefined);
    throw error;
  } finally {
    await connection.end();
  }
  return databaseName;
}

export async function dropIsolatedDatabase(databaseName: string) {
  if (!/^lion_delivery_test_[0-9]+_[0-9]+$/.test(databaseName)) {
    throw new Error('Refusing to drop an unexpected test database name');
  }
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD === '__NO_PASSWORD__' ? '' : process.env.DB_PASSWORD === '' ? undefined : process.env.DB_PASSWORD ?? 'mysql',
  });
  try {
    await connection.query('DROP DATABASE IF EXISTS ' + identifier(databaseName));
  } finally {
    await connection.end();
  }
}
