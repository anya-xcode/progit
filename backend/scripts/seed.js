// Syncs the problem library YAML files into MongoDB (safe to run repeatedly).
// The server also does this on startup.
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import { syncProblemLibrary } from "../src/services/librarySync.js";

try {
  await connectDB(env.mongoUri);
  const { total, created } = await syncProblemLibrary();
  console.log(`Synced ${total} library problems (${created} new).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
