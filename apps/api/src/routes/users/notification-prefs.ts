import { Router } from "express";
import { authenticate } from "../../middleware/auth.js";
import {
  NOTIFICATION_TYPES,
  GROUP_LABELS,
  getFullPreferences,
  updatePreferences,
} from "../../lib/notification-prefs.js";

const router = Router();

// GET /api/users/me/notification-preferences — return current user's prefs + metadata
router.get("/me/notification-preferences", authenticate, async (req, res) => {
  try {
    const prefs = await getFullPreferences(req.user!.userId);
    res.json({
      preferences: prefs,
      types: NOTIFICATION_TYPES,
      groupLabels: GROUP_LABELS,
    });
  } catch (err) {
    console.error("Get notification prefs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/users/me/notification-preferences — partial update { type: boolean }
router.put("/me/notification-preferences", authenticate, async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({ error: "Expected object of { type: boolean }" });
      return;
    }
    const updated = await updatePreferences(req.user!.userId, body as Record<string, boolean>);
    res.json({ preferences: updated });
  } catch (err) {
    console.error("Update notification prefs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
