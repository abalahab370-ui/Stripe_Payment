const Stripe = require("stripe");
const { query, withTransaction } = require("../config/dbConnection");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function getConfig(req, res) {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
}

async function getProducts(req, res) {
  try {
    const { rows } = await query(
      `SELECT id, name, amount, currency, stock - reserved_stock AS available_stock
         FROM products
        ORDER BY name`
    );
    res.json({ products: rows });
  } catch (err) {
    console.error("[products] failed:", err);
    res.status(500).json({ error: "Could not load products" });
  }
}

async function createCheckout(req, res) {
  let orderId;
  let paymentIntent;
  try {
    const { productId } = req.body || {};
    if (typeof productId !== "string" || productId.length === 0) {
      return res.status(400).json({ error: "A product id is required" });
    }

    const reservation = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, name, amount, currency, stock, reserved_stock
           FROM products
          WHERE id = $1
          FOR UPDATE`,
        [productId]
      );
      if (rows.length === 0) return { unavailable: "not_found" };

      const product = rows[0];
      if (product.stock <= product.reserved_stock) {
        return { unavailable: "out_of_stock" };
      }

      const update = await client.query(
        `UPDATE products
            SET reserved_stock = reserved_stock + 1
          WHERE id = $1 AND stock >= reserved_stock + 1
          RETURNING id`,
        [productId]
      );
      if (update.rowCount !== 1) return { unavailable: "out_of_stock" };

      const order = await client.query(
        `INSERT INTO orders (product_id, amount, currency, quantity)
         VALUES ($1, $2, $3, 1)
         RETURNING id`,
        [product.id, product.amount, product.currency]
      );
      orderId = order.rows[0].id;
      return { product, orderId };
    });

    if (reservation.unavailable === "not_found") {
      return res.status(404).json({ error: "Product not found" });
    }
    if (reservation.unavailable === "out_of_stock") {
      return res.status(409).json({ error: "Product is out of stock" });
    }

    orderId = reservation.orderId;
    const { product } = reservation;
    paymentIntent = await stripe.paymentIntents.create({
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
    if (orderId) {
      if (paymentIntent) {
        try {
          await stripe.paymentIntents.cancel(paymentIntent.id);
        } catch (cancelError) {
          console.error(`[checkout] failed to cancel payment ${paymentIntent.id}:`, cancelError);
        }
      }
      try {
        await releaseOrderReservation(orderId);
      } catch (cleanupError) {
        console.error(`[checkout] failed to release order ${orderId}:`, cleanupError);
      }
    }
    console.error("[checkout] failed:", err);
    res.status(500).json({ error: "Checkout failed" });
  }
}

async function releaseOrderReservation(orderId) {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT product_id, quantity, status
         FROM orders
        WHERE id = $1
        FOR UPDATE`,
      [orderId]
    );
    if (rows.length === 0 || rows[0].status !== "pending") return;

    const order = rows[0];
    const result = await client.query(
      `UPDATE products
          SET reserved_stock = reserved_stock - $1
        WHERE id = $2 AND reserved_stock >= $1`,
      [order.quantity, order.product_id]
    );
    if (result.rowCount !== 1) {
      throw new Error(`Could not release inventory for order ${orderId}`);
    }
    await client.query("UPDATE orders SET status = 'failed' WHERE id = $1", [orderId]);
  });
}

async function getOrderStatus(req, res) {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isSafeInteger(orderId) || orderId < 1) {
      return res.status(400).json({ error: "Bad order id" });
    }

    const { rows } = await query(
      "SELECT id, status, amount, currency FROM orders WHERE id = $1",
      [orderId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Order not found" });

    res.json(rows[0]);
  } catch (err) {
    console.error("[orders] failed:", err);
    res.status(500).json({ error: "Could not load order" });
  }
}

module.exports = { getConfig, getProducts, createCheckout, getOrderStatus };
