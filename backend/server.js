require("dotenv").config(); // must run before the routes read process.env

const path = require("path");
const express = require("express");
const webhook = require("./webhook");
const checkout = require("./checkout");

const app = express();

// The webhook needs the raw body, so it goes ABOVE express.json()
app.use(webhook);

app.use(express.json());
app.use(checkout);

// Frontend lives in its own folder, served from the same origin (no CORS needed)
app.use(express.static(path.join(__dirname, "../frontend")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
