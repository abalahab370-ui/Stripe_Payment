require("dotenv").config(); // must run before the routes read process.env

const path = require("path");
const express = require("express");
const cors = require("cors");
const webhookRoutes = require("./routing/webhook");
const checkoutRoutes = require("./routing/checkout");

const app = express();
const allowedOrigin = process.env.CORS_ORIGIN || "http://127.0.0.1:5501";

app.use(cors({
  origin: (origin, callback) => callback(null, origin === allowedOrigin),
}));

// The webhook needs the raw body, so it goes ABOVE express.json()
app.use(webhookRoutes);

app.use(express.json());
app.use(checkoutRoutes);

// Frontend lives in its own folder, served from the same origin (no CORS needed)
app.use(express.static(path.join(__dirname, "../frontend")));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
