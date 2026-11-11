const Stripe = require("stripe");
const { query } = require("../db");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// The server decides the price, never the browser.
const PRODUCTS = {
  tshirt: { name: "Practice T-shirt", amount: 2000, currency: "usd" },
  mug: { name: "Practice Mug", amount: 1200, currency: "usd" },
};

function getConfig(req, res) {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
}

async function createCheckout(req, res) {
  try {
    const { productId } = req.body;
    if (!Object.hasOwn(PRODUCTS, productId)) {
      return res.status(400).json({ error: "Unknown product" });
    }
    const product = PRODUCTS[productId];

    const { rows } = await query(
      "INSERT INTO orders (product_id, amount, currency) VALUES ($1, $2, $3) RETURNING id",
      [productId, product.amount, product.currency]
    );
    const orderId = rows[0].id;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: product.amount,
      currency: product.currency,
      automatic_payment_methods: { enabled: true },
      metadata: { orderId: String(orderId) },
    });

    await query("UPDATE orders SET payment_intent_id = $1 WHERE id = $2", [
      paymentIntent.id,
      orderId,
    ]);

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
}

async function getOrderStatus(req, res) {
  try {
    const { rows } = await query(
      "SELECT id, status, amount, currency FROM orders WHERE id = $1",
      [res.locals.orderId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Order not found" });

    res.json(rows[0]);
  } catch (err) {
    console.error("[orders] failed:", err);
    res.status(500).json({ error: "Could not load order" });
  }
}

module.exports = { getConfig, createCheckout, getOrderStatus };
