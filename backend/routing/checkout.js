const express = require("express");
const {
  createCheckout,
  getConfig,
  getOrderStatus,
} = require("../controllers/checkoutController");
const {
  validateCheckoutRequest,
  validateOrderId,
} = require("../middleware/checkoutValidation");

const router = express.Router();

router.get("/api/config", getConfig);
router.post("/api/checkout", validateCheckoutRequest, createCheckout);
router.get("/api/orders/:id", validateOrderId, getOrderStatus);

module.exports = router;
