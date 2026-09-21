import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import { enabledLanguages } from "./config/languages.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requireAccessKey } from "./middleware/requireAccessKey.js";
import codeRoutes from "./routes/codeRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import githubRoutes from "./routes/githubRoutes.js";
import problemRoutes from "./routes/problemRoutes.js";
import solutionRoutes from "./routes/solutionRoutes.js";
import submissionRoutes from "./routes/submissionRoutes.js";

export function createApp() {
  const app = express();

  // Same-origin in production; the dev server proxies /api, so CORS only
  // matters when the frontend runs on a different host.
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", requireAccessKey);

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      accessKeyRequired: Boolean(env.accessKey),
      languages: enabledLanguages(),
    });
  });

  app.use("/api/problems", problemRoutes);
  app.use("/api/solutions", solutionRoutes);
  app.use("/api/code", codeRoutes);
  app.use("/api/submissions", submissionRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/github", githubRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
