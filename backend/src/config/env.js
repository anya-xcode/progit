// Central place for configuration read from backend/.env.

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Browsers compare the Origin header exactly, so a trailing slash or stray
// whitespace in CLIENT_URL would block every request. Several origins can be
// listed, separated by commas.
const clientUrls = (process.env.CLIENT_URL || "http://localhost:5174")
  .split(",")
  .map((url) => url.trim().replace(/\/+$/, ""))
  .filter(Boolean);

export const env = {
  port: toInt(process.env.PORT, 5050),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dsaforge",
  clientUrl: clientUrls[0],
  clientUrls,

  execution: {
    // "namespace": Linux namespace jail (runs through WSL on Windows)
    // "docker":    Docker container per run (recommended when Docker is available)
    // "judge0" / "piston": remote execution over HTTP, for hosts that cannot
    //             sandbox locally (Vercel and other serverless platforms)
    provider: process.env.EXECUTION_PROVIDER || "namespace",
    timeLimitMs: toInt(process.env.EXECUTION_TIME_LIMIT_MS, 2000),
    memoryLimitMb: toInt(process.env.EXECUTION_MEMORY_LIMIT_MB, 256),
    outputLimitKb: toInt(process.env.EXECUTION_OUTPUT_LIMIT_KB, 256),
    maxConcurrentRuns: toInt(process.env.EXECUTION_MAX_CONCURRENT, 2),
    wslDistro: process.env.WSL_DISTRO || "Ubuntu",
    dockerCommand: process.env.DOCKER_COMMAND || "docker",
    dockerImagePrefix: process.env.DOCKER_IMAGE_PREFIX || "dsaforge",

    // Remote judges
    judge0Url: process.env.JUDGE0_URL || "",
    judge0Token: process.env.JUDGE0_TOKEN || "",
    judge0LanguageId: toInt(process.env.JUDGE0_LANGUAGE_ID, 71), // 71 = Python 3.8
    pistonUrl: process.env.PISTON_URL || "https://emkc.org/api/v2/piston",
    pistonPythonVersion: process.env.PISTON_PYTHON_VERSION || "3.10.0",
  },

  // Deployment
  // A shared password for the whole app (single user). When set, every /api
  // request must carry it; leave empty for local use.
  accessKey: process.env.APP_ACCESS_KEY || "",
  // Serverless functions are frozen after they respond, so background work
  // (GitHub sync) has to finish before the response is sent.
  serverless: process.env.VERCEL === "1" || process.env.SERVERLESS === "true",
  // Skip the library upsert on boot (do it once with `npm run seed` instead).
  skipLibrarySync: process.env.SKIP_LIBRARY_SYNC === "true",

  github: {
    token: process.env.GITHUB_TOKEN || "",
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    oauthCallbackUrl:
      process.env.GITHUB_OAUTH_CALLBACK_URL ||
      `${process.env.CLIENT_URL || "http://localhost:5174"}/api/github/oauth/callback`,
    // Overridable for GitHub Enterprise or the local mock used in tests.
    apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
    webUrl: process.env.GITHUB_WEB_URL || "https://github.com",
  },
};
