// Vercel serverless entry point: the same Express app, one connection per
// warm instance. Local development still uses backend/src/server.js.
import { createApp } from "../backend/src/app.js";
import { connectDB } from "../backend/src/config/db.js";
import { env } from "../backend/src/config/env.js";

const app = createApp();
let connection = null;

export default async function handler(req, res) {
  try {
    connection ??= connectDB(env.mongoUri);
    await connection;
  } catch (error) {
    connection = null;
    res.status(503).json({ message: `Database unavailable: ${error.message}` });
    return;
  }
  return app(req, res);
}
