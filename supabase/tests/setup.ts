/**
 * Test setup for the `db` jest project. Runs once per test file, before
 * imports resolve, so we can populate process.env from .env.test.
 */

import { config as loadDotenv } from 'dotenv';
import path from 'path';

loadDotenv({ path: path.resolve(__dirname, '..', '..', '.env.test') });

if (!process.env.SUPABASE_TEST_URL) {
  throw new Error(
    '.env.test is missing SUPABASE_TEST_URL. Run `npx supabase start` and copy the values it prints into .env.test.'
  );
}

