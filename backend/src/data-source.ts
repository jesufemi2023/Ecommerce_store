import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import * as path from 'path';

// Load environment variables
const envFile = `.env.${process.env.NODE_ENV || 'development'}`;

console.log('Loading env file:', envFile); // <- debug line
config({ path: path.resolve(__dirname, '..', envFile) });

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
  entities:
    process.env.NODE_ENV === 'production'
      ? ['dist/**/*.entity.js']
      : ['src/**/*.entity.ts'],
  migrations:
    process.env.NODE_ENV === 'production'
      ? ['dist/migrations/*.js']
      : ['src/migrations/*.ts'],
  synchronize: false,
  logging: true,
});
