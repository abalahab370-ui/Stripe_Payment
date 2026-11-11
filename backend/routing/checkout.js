const express = require("express");
const {
  createCheckout,
  getConfig,
  getProducts,
  getOrderStatus,
} = require("../controllers/checkoutController");

const router = express.Router();

router.get("/api/config", getConfig);
router.get("/api/products", getProducts);
router.post("/api/checkout", createCheckout);
router.get("/api/orders/:id", getOrderStatus);

module.exports = router;
