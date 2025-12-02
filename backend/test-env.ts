// backend/test-env.ts
import * as path from 'path';
import { config } from 'dotenv';

const envFile = path.resolve(__dirname, `.env.${process.env.NODE_ENV || 'development'}`);
console.log('Loading env file:', envFile);
config({ path: envFile });

console.log('DB_PASSWORD:', process.env.DB_PASSWORD);
