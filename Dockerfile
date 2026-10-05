# DSAForge API + its code sandbox, for hosts that run containers on a real
# kernel (Render, Fly.io, Railway, any VPS).
#
#   docker build -t dsaforge-api .
#   docker run -p 5050:5050 --env-file backend/.env dsaforge-api
#
# The sandbox runs user code in Linux namespaces, so the image needs python3
# and util-linux (unshare). Nothing here is privileged.
#
# Hosts that deny mount(2) inside containers (Render, most Kubernetes
# platforms) cannot build the full jail; DSAFORGE_SANDBOX_ALLOW_REDUCED lets
# sandbox.sh fall back to namespaces without a private filesystem there.
FROM node:22-slim

# python3 runs the submissions; util-linux provides unshare; procps is used by
# the harness to clean up stray processes.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 util-linux procps ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install only the backend's production dependencies. Both workspace manifests
# are needed for `npm ci` to validate the lockfile.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev --workspace backend --include-workspace-root

COPY backend ./backend
COPY sandbox ./sandbox

ENV NODE_ENV=production \
    PORT=5050 \
    EXECUTION_PROVIDER=namespace \
    EXECUTION_MAX_CONCURRENT=1 \
    DSAFORGE_SANDBOX_ALLOW_REDUCED=1

EXPOSE 5050

# A non-root user is enough: the sandbox uses unprivileged user namespaces.
# /app stays owned by root, so submissions (which share this uid in reduced
# mode) can read the app's files but never change them.
RUN useradd --create-home --shell /bin/bash dsaforge
USER dsaforge

CMD ["node", "backend/src/server.js"]
