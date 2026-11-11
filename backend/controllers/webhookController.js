const Stripe = require("stripe");
const { withTransaction } = require("../db");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function handleWebhook(req, res) {
  const signature = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[webhook] signature check FAILED:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentSucceeded(event.data.object);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
      case "payment_intent.canceled":
        await handlePaymentCanceled(event.data.object);
        break;
      default:
        console.log(`[webhook] ignoring ${event.type}`);
    }
  } catch (err) {
    console.error("[webhook] handler crashed:", err);
    return res.status(500).send("Handler error");
  }

  res.json({ received: true });
}

async function handlePaymentSucceeded(paymentIntent) {
  const orderId = Number(paymentIntent.metadata.orderId);
  if (!Number.isSafeInteger(orderId) || orderId < 1) return;

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT product_id, quantity, amount, currency, status, payment_intent_id
         FROM orders
        WHERE id = $1
        FOR UPDATE`,
      [orderId]
    );
    if (rows.length === 0 || rows[0].status !== "pending") return "ignored";

    const order = rows[0];
    if (
      order.payment_intent_id !== paymentIntent.id ||
      paymentIntent.amount_received !== order.amount ||
      paymentIntent.currency !== order.currency.toLowerCase()
    ) {
      console.error(`[webhook] PAYMENT MISMATCH on order ${orderId}`);
      return "mismatch";
    }

    const inventory = await client.query(
      `UPDATE products
          SET stock = stock - $1,
              reserved_stock = reserved_stock - $1
        WHERE id = $2 AND stock >= $1 AND reserved_stock >= $1`,
      [order.quantity, order.product_id]
    );
    if (inventory.rowCount !== 1) {
      throw new Error(`Could not commit reserved inventory for order ${orderId}`);
    }

    await client.query(
      "UPDATE orders SET status = 'paid', paid_at = NOW() WHERE id = $1",
      [orderId]
    );
    return "paid";
  });

  if (result === "paid") {
    console.log(`[webhook] order ${orderId} marked as PAID`);
  } else if (result === "ignored") {
    console.log(`[webhook] order ${orderId} is no longer pending; duplicate ignored`);
  }
}

async function handlePaymentFailed(paymentIntent) {
  console.log(
    `[webhook] payment attempt failed for order ${paymentIntent.metadata.orderId}; reservation retained for retry`
  );
}

async function handlePaymentCanceled(paymentIntent) {
  const orderId = Number(paymentIntent.metadata.orderId);
  if (!Number.isSafeInteger(orderId) || orderId < 1) return;

  const released = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT product_id, quantity, status, payment_intent_id
         FROM orders
        WHERE id = $1
        FOR UPDATE`,
      [orderId]
    );
    if (
      rows.length === 0 ||
      rows[0].status !== "pending" ||
      rows[0].payment_intent_id !== paymentIntent.id
    ) {
      return false;
    }

    const order = rows[0];
    const inventory = await client.query(
      `UPDATE products
          SET reserved_stock = reserved_stock - $1
        WHERE id = $2 AND reserved_stock >= $1`,
      [order.quantity, order.product_id]
    );
    if (inventory.rowCount !== 1) {
      throw new Error(`Could not release reserved inventory for order ${orderId}`);
    }

    await client.query("UPDATE orders SET status = 'failed' WHERE id = $1", [orderId]);
    return true;
  });
  if (released) console.log(`[webhook] order ${orderId} canceled; reservation released`);
}

module.exports = { handleWebhook };
