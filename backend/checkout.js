const express = require("express");
const Stripe = require("stripe");
const { query } = require("./db"); // your db file (exports query(text, params))

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// The server decides the price, never the browser
const PRODUCTS = {
  tshirt: { name: "Practice T-shirt", amount: 2000, currency: "usd" }, // amounts are in cents
  mug: { name: "Practice Mug", amount: 1200, currency: "usd" },
};

// Publishable key is safe to expose, the secret key never leaves the server
router.get("/api/config", (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// Start a payment: the browser sends only a product id
router.post("/api/checkout", async (req, res) => {
  try {
    const { productId } = req.body;
    if (!Object.hasOwn(PRODUCTS, productId)) {
      return res.status(400).json({ error: "Unknown product" });
    }
    const product = PRODUCTS[productId];

    // 1. Our order, status 'pending'
    const { rows } = await query(
      "INSERT INTO orders (product_id, amount, currency) VALUES ($1, $2, $3) RETURNING id",
      [productId, product.amount, product.currency]
    );
    const orderId = rows[0].id;

    // 2. Stripe's payment, for the same amount
    const paymentIntent = await stripe.paymentIntents.create({
      amount: product.amount,
      currency: product.currency,
      automatic_payment_methods: { enabled: true },
      metadata: { orderId: String(orderId) }, // the link back to our order
    });

    // 3. Remember which payment belongs to which order
    await query("UPDATE orders SET payment_intent_id = $1 WHERE id = $2", [
      paymentIntent.id,
      orderId,
    ]);

    // 4. Send the browser only what it needs
    res.json({
      orderId,
      clientSecret: paymentIntent.client_secret,
      productName: product.name,
      amount: product.amount,
      currency: product.currency,
    });
  } catch (err) {
    console.error("[checkout] failed:", err);
    res.status(500).json({ error: "Checkout failed" });
  }
});

// Order status, polled by the success page (read-only)
router.get("/api/orders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad order id" });

    const { rows } = await query(
      "SELECT id, status, amount, currency FROM orders WHERE id = $1",
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Order not found" });

    res.json(rows[0]);
  } catch (err) {
    console.error("[orders] failed:", err);
    res.status(500).json({ error: "Could not load order" });
  }
});

module.exports = router;
