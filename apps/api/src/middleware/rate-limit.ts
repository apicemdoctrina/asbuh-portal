import rateLimit from "express-rate-limit";

// TODO: if behind reverse proxy, ensure app.set("trust proxy", ...) is configured
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: "Too many attempts, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});
