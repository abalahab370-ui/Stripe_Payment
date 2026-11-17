const cors = require("cors") ;

const sameOriginUrls = new Set([
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]);

const allowedOrigin = cors({
  origin: (origin, callback) => {
    if (!origin || origin === allowedOrigin || sameOriginUrls.has(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },} );

module.exports = allowedOrigin ;