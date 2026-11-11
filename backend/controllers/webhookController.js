const Stripe = require("stripe");
const { query } = require("../db");

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
  if (!orderId) return;

  const { rows } = await query("SELECT amount FROM orders WHERE id = $1", [orderId]);
  if (rows.length === 0) return;

  if (paymentIntent.amount_received !== rows[0].amount) {
    console.error(`[webhook] AMOUNT MISMATCH on order ${orderId}`);
    return;
  }

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

  await query("UPDATE orders SET status = 'failed' WHERE id = $1 AND status = 'pending'", [
    orderId,
  ]);
  console.log(`[webhook] order ${orderId} marked as FAILED`);
}

module.exports = { handleWebhook };
