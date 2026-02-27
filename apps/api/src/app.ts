import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import sectionsRouter from "./routes/sections.js";
import organizationsRouter from "./routes/organizations.js";
import statsRouter from "./routes/stats.js";
import workContactsRouter from "./routes/work-contacts.js";
import auditLogsRouter from "./routes/audit-logs.js";
import knowledgeRouter from "./routes/knowledge.js";
import managementRouter from "./routes/management.js";
import { UPLOADS_DIR } from "./lib/upload.js";

const app = express();

// TODO: configure trust proxy for production reverse proxy
app.set("trust proxy", 1);

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:5173"];

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Serve uploaded files (cover images, inline images)
app.use("/uploads", express.static(UPLOADS_DIR));

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

// Global error handler (Express requires all 4 params for error middleware)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
