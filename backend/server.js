require("dotenv").config(); // must run before the routes read process.env

const path = require("path");
const express = require("express");
const webhookRoutes = require("./routing/webhook");
const checkoutRoutes = require("./routing/checkout");

const app = express();

// The webhook needs the raw body, so it goes ABOVE express.json()
app.use(webhookRoutes);

app.use(express.json());
app.use(checkoutRoutes);

// Frontend lives in its own folder, served from the same origin (no CORS needed)
app.use(express.static(path.join(__dirname, "../frontend")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
