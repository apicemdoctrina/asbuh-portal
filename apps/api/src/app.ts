import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import sectionsRouter from "./routes/sections.js";
import organizationsRouter from "./routes/organizations/index.js";
import statsRouter from "./routes/stats.js";
import workContactsRouter from "./routes/work-contacts.js";
import auditLogsRouter from "./routes/audit-logs.js";
import knowledgeRouter from "./routes/knowledge.js";
import managementRouter from "./routes/management/index.js";
import tasksRouter from "./routes/tasks/index.js";
import telegramRouter from "./routes/telegram.js";
import notificationsRouter from "./routes/notifications.js";
import messagesRouter from "./routes/messages.js";
import ticketsRouter from "./routes/tickets.js";
import clientGroupsRouter from "./routes/client-groups.js";
import announcementsRouter from "./routes/announcements.js";
import reportingRouter from "./routes/reporting.js";
import paymentsRouter from "./routes/payments/index.js";
import statementsRouter from "./routes/statements/index.js";
import healthRouter from "./routes/health.js";
import clientDashboardRouter from "./routes/client-dashboard.js";
import clientOnboardingRouter from "./routes/client-onboarding.js";
import consentsRouter from "./routes/consents.js";
import supportRouter from "./routes/support.js";
import suggestionsRouter from "./routes/suggestions.js";
import { UPLOADS_DIR } from "./lib/upload.js";

const app = express();

// TODO: configure trust proxy for production reverse proxy
app.set("trust proxy", 1);

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:5173"];

// Security headers. CORP "cross-origin" — картинки из /uploads встраиваются
// фронтом с другого origin в dev (vite :5173 → api :3000).
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Serve uploaded files — ONLY images (avatars, covers, inline illustrations, screenshots).
// Documents/statements/ticket attachments live in the same dir but must go through
// the authorized download endpoints (organizations, statements, tickets, support).
const PUBLIC_IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp)$/i;
app.use("/uploads/tickets", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});
app.use(
  "/uploads",
  (req, res, next) => {
    if (!PUBLIC_IMAGE_RE.test(req.path)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    next();
  },
  express.static(UPLOADS_DIR, {
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }),
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/sections", sectionsRouter);
app.use("/api/organizations", organizationsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/work-contacts", workContactsRouter);
app.use("/api/audit-logs", auditLogsRouter);
app.use("/api/knowledge", knowledgeRouter);
app.use("/api/management", managementRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/telegram", telegramRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/client-groups", clientGroupsRouter);
app.use("/api/announcements", announcementsRouter);
app.use("/api/reporting", reportingRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/statements", statementsRouter);
app.use("/api/admin/health", healthRouter);
app.use("/api/client/dashboard", clientDashboardRouter);
app.use("/api/client/onboarding", clientOnboardingRouter);
app.use("/api/consents", consentsRouter);
app.use("/api/support", supportRouter);
app.use("/api/suggestions", suggestionsRouter);

// Global error handler (Express requires all 4 params for error middleware)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
