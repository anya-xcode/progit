import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { getExecutionInfo } from "./services/execution/index.js";
import { recoverInterruptedSyncs } from "./services/github/syncService.js";
import { syncProblemLibrary } from "./services/librarySync.js";

async function start() {
  await connectDB(env.mongoUri);

  try {
    const { total, created, ready, removed } = await syncProblemLibrary();
    console.log(
      `Problem library synced: ${total} sheet problems, ${ready} ready to solve, ${total - ready} awaiting content` +
        ` (${created} new${removed ? `, ${removed} removed` : ""})`
    );
  } catch (error) {
    // Invalid YAML should not take the whole app down; run `npm run verify:problems`.
    console.error(`Problem library sync failed:\n${error.message}`);
  }

  const interrupted = await recoverInterruptedSyncs();
  if (interrupted > 0) console.log(`GitHub: ${interrupted} interrupted sync(s) marked as failed (retry from the app)`);

  const execution = getExecutionInfo();
  console.log(`Code execution: ${execution.description}`);

  createApp().listen(env.port, () => {
    console.log(`DSAForge API running on http://localhost:${env.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
