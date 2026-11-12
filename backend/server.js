require("dotenv").config(); // must run before the routes read process.env

const requiredEnv = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "DATABASE_URL",
];
const missingEnv = requiredEnv.filter((name) => !process.env[name]?.trim());
if (missingEnv.length > 0) {
  console.error(`[startup] Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const path = require("path");
const express = require("express");
const cors = require("cors");
const webhookRoutes = require("./routing/webhook");
const checkoutRoutes = require("./routing/checkout");

const app = express();
const allowedOrigin = process.env.CORS_ORIGIN;
const sameOriginUrls = new Set([
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin === allowedOrigin || sameOriginUrls.has(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
}));

// The webhook needs the raw body, so it goes ABOVE express.json()
app.use(webhookRoutes);

app.use(express.json());
app.use(checkoutRoutes);

// Frontend lives in its own folder, served from the same origin (no CORS needed)
app.use(express.static(path.join(__dirname, "../frontend")));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
