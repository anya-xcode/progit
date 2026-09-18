// Central place for configuration read from backend/.env.

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  port: toInt(process.env.PORT, 5050),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dsaforge",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5174",

  execution: {
    // "namespace": Linux namespace jail (runs through WSL on Windows)
    // "docker":    Docker container per run (recommended when Docker is available)
    provider: process.env.EXECUTION_PROVIDER || "namespace",
    timeLimitMs: toInt(process.env.EXECUTION_TIME_LIMIT_MS, 2000),
    memoryLimitMb: toInt(process.env.EXECUTION_MEMORY_LIMIT_MB, 256),
    outputLimitKb: toInt(process.env.EXECUTION_OUTPUT_LIMIT_KB, 256),
    maxConcurrentRuns: toInt(process.env.EXECUTION_MAX_CONCURRENT, 2),
    wslDistro: process.env.WSL_DISTRO || "Ubuntu",
    dockerCommand: process.env.DOCKER_COMMAND || "docker",
    dockerImagePrefix: process.env.DOCKER_IMAGE_PREFIX || "dsaforge",
  },

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
