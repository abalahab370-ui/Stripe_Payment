const express = require("express");
const Stripe = require("stripe");
const { query } = require("./db"); // your db file (exports query(text, params))

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Only the webhook may mark an order as paid, never the browser.
// express.raw keeps the body as untouched bytes: the signature is computed over them.
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  // STEP 1: the signature Stripe put in the headers
  const signature = req.headers["stripe-signature"];

  // STEP 2: is it really from Stripe?
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

  // STEP 3: what happened?
  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentSucceeded(event.data.object);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
      default:
        console.log(`[webhook] ignoring ${event.type}`);
    }
  } catch (err) {
    console.error("[webhook] handler crashed:", err);
    return res.status(500).send("Handler error"); // tells Stripe to retry later
  }

  // STEP 4: tell Stripe we received it
  res.json({ received: true });
});

async function handlePaymentSucceeded(paymentIntent) {
  const orderId = Number(paymentIntent.metadata.orderId); // the link we attached at checkout
  if (!orderId) return; // not one of our orders (for example `stripe trigger`)

  const { rows } = await query("SELECT amount FROM orders WHERE id = $1", [orderId]);
  if (rows.length === 0) return;

  // Stripe's amount must equal ours
  if (paymentIntent.amount_received !== rows[0].amount) {
    console.error(`[webhook] AMOUNT MISMATCH on order ${orderId}`);
    return;
  }

  // WHERE status != 'paid' makes a duplicated webhook harmless
  const result = await query(
    `UPDATE orders
        SET status = 'paid', paid_at = NOW(),
            payment_intent_id = COALESCE(payment_intent_id, $1)
      WHERE id = $2 AND status != 'paid'`,
    [paymentIntent.id, orderId]
  );

  console.log(
    result.rowCount > 0
      ? `[webhook] order ${orderId} marked as PAID`
      : `[webhook] order ${orderId} already paid, duplicate ignored`
  );
}

async function handlePaymentFailed(paymentIntent) {
  const orderId = Number(paymentIntent.metadata.orderId);
  if (!orderId) return;

  // Only pending orders: a late "failed" event can never overwrite a paid order
  await query("UPDATE orders SET status = 'failed' WHERE id = $1 AND status = 'pending'", [
    orderId,
  ]);
  console.log(`[webhook] order ${orderId} marked as FAILED`);
}

module.exports = router;
