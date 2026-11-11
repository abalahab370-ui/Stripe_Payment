CREATE TABLE products (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  amount         INTEGER NOT NULL CHECK (amount > 0),
  currency       TEXT NOT NULL,
  stock          INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  reserved_stock INTEGER NOT NULL DEFAULT 0
                 CHECK (reserved_stock >= 0 AND stock >= reserved_stock)
);

CREATE TABLE orders (
  id                SERIAL PRIMARY KEY,
  product_id        TEXT NOT NULL REFERENCES products(id),
  quantity          INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  amount            INTEGER NOT NULL CHECK (amount > 0),
  currency          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'failed', 'paid')),
  payment_intent_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at           TIMESTAMPTZ
);
