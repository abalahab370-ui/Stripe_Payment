function validateCheckoutRequest(req, res, next) {
  const { productId } = req.body || {};
  if (typeof productId !== "string" || productId.length === 0) {
    return res.status(400).json({ error: "Unknown product" });
  }
  next();
}

function validateOrderId(req, res, next) {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId)) {
    return res.status(400).json({ error: "Bad order id" });
  }
  res.locals.orderId = orderId;
  next();
}

module.exports = { validateCheckoutRequest, validateOrderId };
