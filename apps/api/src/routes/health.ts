import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  getHealthStatus,
  reportSmtpFailure,
  reportSmtpOk,
  reportTelegramFailure,
  reportTelegramOk,
} from "../lib/health-alerts.js";

const router = Router();

router.get("/", authenticate, requireRole("admin"), (_req, res) => {
  res.json(getHealthStatus());
});

/**
 * Trigger a fake channel failure to verify the alert cascade.
 * Body: { channel: "smtp" | "telegram", ok?: boolean }
 *   ok=true  → simulate recovery (reportXxxOk)
 *   ok=false → simulate failure (reportXxxFailure)  [default]
 */
router.post("/test-alert", authenticate, requireRole("admin"), async (req, res) => {
  const { channel, ok } = req.body ?? {};
  if (channel !== "smtp" && channel !== "telegram") {
    return res.status(400).json({ error: "channel must be 'smtp' or 'telegram'" });
  }
  const simulateRecovery = ok === true;
  const fakeErr = new Error("Simulated failure (test-alert endpoint)");
  try {
    if (channel === "smtp") {
      if (simulateRecovery) await reportSmtpOk();
      else await reportSmtpFailure(fakeErr);
    } else {
      if (simulateRecovery) await reportTelegramOk();
      else await reportTelegramFailure(fakeErr);
    }
    res.json({ status: "dispatched", channel, mode: simulateRecovery ? "ok" : "failure" });
  } catch (err) {
    console.error("[health/test-alert] error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
