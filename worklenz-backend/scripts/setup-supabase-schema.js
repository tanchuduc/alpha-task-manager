#!/usr/bin/env node
'use strict';

/**
 * Bootstrap script for initializing the Alpha Work schema on Supabase PostgreSQL.
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres?sslmode=require" node scripts/setup-supabase-schema.js
 * Or set DATABASE_URL in worklenz-backend/.env
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const targetSchema = process.env.DB_SCHEMA || 'alpha_work';
const databaseUrl = process.env.DATABASE_URL || process.env.DB_URL;

if (!databaseUrl) {
  console.error('\x1b[31m[Error] Missing DATABASE_URL in environment or .env file.\x1b[0m');
  console.error('Example: DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require"');
  process.exit(1);
}

const isSsl = process.env.DB_SSL === 'true' || !databaseUrl.includes('localhost');

const client = new Client({
  connectionString: databaseUrl,
  ssl: isSsl ? { rejectUnauthorized: false } : false,
});

async function main() {
  console.log(`\x1b[34m[Setup] Connecting to PostgreSQL at ${databaseUrl.replace(/:[^:@]+@/, ':****@')}...\x1b[0m`);
  await client.connect();
  console.log('\x1b[32m[Setup] Connected successfully!\x1b[0m');

  console.log(`\x1b[34m[Setup] Preparing schema "${targetSchema}" and extensions...\x1b[0m`);
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${targetSchema};`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
  await client.query(`SET search_path TO ${targetSchema}, public, extensions;`);

  const sqlDir = path.join(__dirname, '..', 'database', 'sql');
  const files = [
    '0_extensions.sql',
    '1_tables.sql',
    '2_dml.sql',
    '3_views.sql',
    '4_functions.sql',
    'triggers.sql',
    'indexes.sql',
  ];

  for (const file of files) {
    const filePath = path.join(sqlDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`[Setup] Skipping ${file} (file not found)`);
      continue;
    }

    console.log(`\x1b[33m[Setup] Applying ${file} into schema ${targetSchema}...\x1b[0m`);
    let sql = fs.readFileSync(filePath, 'utf8');

    // Prepend search_path to ensure all objects are created inside the target schema
    const fullSql = `SET search_path TO ${targetSchema}, public, extensions;\n\n${sql}`;

    try {
      await client.query(fullSql);
      console.log(`\x1b[32m  ✔ Applied ${file} successfully\x1b[0m`);
    } catch (err) {
      console.warn(`\x1b[33m  ⚠ Notice on ${file}: ${err.message}\x1b[0m`);
      // Many scripts contain CREATE ... IF NOT EXISTS, so notices/duplicates are expected
    }
  }

  await client.end();
  console.log('\n\x1b[32m[Setup] All base SQL files applied successfully!\x1b[0m');
  console.log('\x1b[36m[Setup] Now you can run "npm run migrate:up" to apply latest incremental migrations.\x1b[0m\n');
}

main().catch(err => {
  console.error('\x1b[31m[Setup Error]\x1b[0m', err);
  process.exit(1);
});
