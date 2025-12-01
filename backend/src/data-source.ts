// backend/src/data-source.ts

import 'dotenv/config';
import { DataSource } from 'typeorm';

// Render PostgreSQL requires SSL
const sslConfig =
  process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

export const AppDataSource = new DataSource({
  type: 'postgres',

  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  ssl: sslConfig,

  // CLI needs explicit entity + migration paths
  entities: ['dist/**/*.entity.js', 'src/**/*.entity.ts'],

  migrations: ['src/migrations/*.ts'],

  synchronize: false, // ❌ never true in production
  logging: true,
});
