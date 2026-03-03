-- Migration: Hash API Keys
-- Replaces plaintext `key` column with `key_hash` (SHA-256) and `key_hint` (display hint)
-- This is a destructive migration: existing plaintext keys will be lost.
-- Users will need to regenerate their API keys after this migration.

-- Step 1: Add new columns as nullable first
ALTER TABLE "api_keys" ADD COLUMN "key_hash" TEXT;
ALTER TABLE "api_keys" ADD COLUMN "key_hint" TEXT;

-- Step 2: For existing rows, generate a hash placeholder and hint from the old key.
-- NOTE: PostgreSQL's encode(digest(...)) requires pgcrypto extension.
-- We enable it and compute real SHA-256 hashes from the existing plaintext keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE "api_keys"
SET
  "key_hash" = encode(digest("key", 'sha256'), 'hex'),
  "key_hint" = '...' || right("key", 8)
WHERE "key" IS NOT NULL;

-- Step 3: Make the new columns NOT NULL now that all rows have values
ALTER TABLE "api_keys" ALTER COLUMN "key_hash" SET NOT NULL;
ALTER TABLE "api_keys" ALTER COLUMN "key_hint" SET NOT NULL;

-- Step 4: Drop the old plaintext key column and its unique constraint
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_key_key";
ALTER TABLE "api_keys" DROP COLUMN "key";

-- Step 5: Add unique constraint on key_hash
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_key_hash_key" UNIQUE ("key_hash");
