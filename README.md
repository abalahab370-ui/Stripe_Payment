# Stripe Payments

A minimal Stripe payment flow with an Express backend, a plain HTML frontend and PostgreSQL (Supabase) for orders. It contains only what a payment needs.

## How it works

1. The browser asks the server to buy a product (`POST /api/checkout`).
2. The server locks the product row, reserves one unit, creates a pending order, then creates a Stripe PaymentIntent and returns only the `clientSecret`.
3. The browser shows Stripe's card form. The card goes straight to Stripe and never touches this server.
4. Stripe calls `POST /webhook` with the result. Successful payment converts reserved stock into sold stock; cancellation releases the reservation.

Rules the code follows:

- The server decides the price, never the browser.
- The secret key never leaves the server.
- Only the webhook marks an order as paid, never the success page.
- The webhook verifies the signature, answers quickly and is safe to run twice.
- Product prices and inventory come from PostgreSQL; row locks and database constraints prevent overselling.

## Project structure

```
backend/
  server.js                   Express setup, mounts the routes
  db.js                       PostgreSQL connection and transaction helper
  routing/
    checkout.js               Checkout and order-status route declarations
    webhook.js                Webhook route declaration and raw-body middleware
  controllers/
    checkoutController.js     Checkout, config and order-status handlers
    webhookController.js      Stripe webhook handling and order updates
frontend/
  index.html    Card form
  success.html  Shows the order status (polls the server)
schema.sql      Product catalog, inventory and orders tables
.env.example    Environment variable names
```

## Setup

Requirements: Node 18 or newer, a Stripe account in test mode, a Supabase project.

1. Install dependencies:

   ```
   npm install
   ```

2. Run `schema.sql` in the Supabase SQL editor. It creates example T-shirt and mug rows with stock 10 each; change the example prices and quantities or add your own products there. When migrating a database with existing orders, reconcile product stock before enabling checkout.

3. Copy `.env.example` to `.env` and fill in the values:

   | Variable | Where to find it |
   | --- | --- |
   | `STRIPE_SECRET_KEY` | Stripe Dashboard, Developers, API keys (sk_test_...) |
   | `STRIPE_PUBLISHABLE_KEY` | Same page (pk_test_...) |
   | `STRIPE_WEBHOOK_SECRET` | Printed by `stripe listen` (whsec_...) |
   | `DATABASE_URL` | PostgreSQL/Supabase connection string (`sslmode=require` for Supabase) |
   | `PORT` | Any free port, default 3000 |

## Run locally

Use two terminals.

Terminal 1, forward Stripe events to your machine and copy the printed `whsec_...` secret into `.env`:

```
stripe listen --forward-to localhost:3000/webhook
```

Terminal 2, start the server (restart it after editing `.env`):

```
npm start
```

Open `http://localhost:3000/`, choose an in-stock product and pay with a test card. To preselect a product, add its database id to the URL, for example `/?product=mug`.

| Test card | Result |
| --- | --- |
| 4242 4242 4242 4242 | Succeeds |
| 4000 0000 0000 0002 | Declined |
| 4000 0025 0000 3155 | Asks for a 3D Secure check |

Use any future expiry date and any CVC.

Expected result: the page redirects to `success.html`, which shows pending for a moment, then the server logs `order 1 marked as PAID` and the page shows the payment as received.

## API

| Route | Description |
| --- | --- |
| `GET /api/config` | Returns the publishable key |
| `GET /api/products` | Returns the database product catalog and available stock |
| `POST /api/checkout` | Body: `{ "productId": "<database product id>" }`. Reserves one item, creates the order and PaymentIntent, returns `clientSecret` |
| `GET /api/orders/:id` | Returns the order status |
| `POST /webhook` | Called by Stripe only |

Inventory reservations remain held while a PaymentIntent can still be retried. A canceled PaymentIntent releases its reservation; failed payment attempts do not release stock because Stripe allows the customer to retry that intent.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `No signatures found matching the expected signature` | Wrong `STRIPE_WEBHOOK_SECRET`, or the server was not restarted after editing `.env` |
| Message about a raw body or parsed object | `express.json()` was placed above the webhook route in `server.js` |
| Nothing logged after paying | `stripe listen` is not running or forwards to the wrong port |
| Order stays pending | Check the server log for a signature error, `AMOUNT MISMATCH` or a missing `orderId` |

## Going live

Test mode and live mode have separate keys and separate webhook secrets. For production, create a webhook endpoint in the Stripe Dashboard that points to `https://your-domain/webhook`, listening to `payment_intent.succeeded` and `payment_intent.payment_failed`, and use its secret as `STRIPE_WEBHOOK_SECRET`.
