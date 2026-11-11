-- Run once in the Supabase SQL editor
CREATE TABLE IF NOT EXISTS orders (
  id                SERIAL PRIMARY KEY,
  product_id        TEXT NOT NULL,
  amount            INTEGER NOT NULL,                  -- in cents
  currency          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',   -- pending | failed | paid
  payment_intent_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at           TIMESTAMPTZ
);
