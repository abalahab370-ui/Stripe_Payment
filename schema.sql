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
                    CHECK (status IN ('pending', 'failed', 'paid' , 'expired')),
  payment_intent_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT DATEADD('minute', 15, NOW()),
  paid_at           TIMESTAMPTZ
);

--pg cron  has been added in supabase in order to run a specific function that releases expired orders ( we can call it to using endpoints when user wants to buy item but then in every checkout u got to do cleaning and calling this function which has trade of but we gonna do it since our project is not active , the pg cron will consume our supabase resources! 

