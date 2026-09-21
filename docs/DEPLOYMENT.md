# Deploying DSAForge to Vercel

Local DSAForge runs everything on your machine. Deployed, three pieces move:

| Piece | Local | Deployed |
| --- | --- | --- |
| Frontend (React) | Vite dev server | Vercel static build |
| API (Express) | `node src/server.js` | Vercel serverless function (`api/index.js`) |
| Database | MongoDB on localhost | MongoDB Atlas |
| **Code execution** | **WSL/Docker sandbox on your machine** | **a Judge0 server you point at** |

**Why code execution moves:** Vercel functions cannot create Linux namespaces or run
Docker, so the sandbox that judges your code cannot run there. Everything else — the
library, saving approaches, the dashboard, GitHub sync — works on Vercel unchanged.

> The public Piston API is whitelist-only since February 2026, so it is not a
> drop-in option. Use Judge0 (hosted or self-hosted), or keep the API on a host
> that allows Docker (see "Option C" at the end).

---

## Step 1 — MongoDB Atlas (free)

1. Create an account at <https://www.mongodb.com/cloud/atlas>, then a **free M0 cluster**.
2. **Database Access** → add a user (username + password). Copy them.
3. **Network Access** → add `0.0.0.0/0` (Vercel's function IPs are not fixed).
4. **Connect → Drivers** → copy the connection string, and add the database name:

```
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/dsaforge?retryWrites=true&w=majority
```

## Step 2 — Load the 474 problems into Atlas

From your machine, once (the deployed app does not seed on boot):

```bash
cd backend
MONGODB_URI="mongodb+srv://…/dsaforge" npm run seed
# Windows PowerShell:
#   $env:MONGODB_URI="mongodb+srv://…/dsaforge"; npm run seed
```

Re-run this whenever the problem library changes.

## Step 3 — A Judge0 server for running code

**Option A — self-host (free-ish, full control).** On any VPS with Docker
(Hetzner, DigitalOcean, Oracle free tier):

```bash
wget https://github.com/judge0/judge0/releases/download/v1.13.1/judge0-v1.13.1.zip
unzip judge0-v1.13.1.zip && cd judge0-v1.13.1
# set REDIS_PASSWORD and POSTGRES_PASSWORD in judge0.conf, and an AUTHN_TOKEN
docker compose up -d db redis && sleep 10 && docker compose up -d
curl http://localhost:2358/languages   # check it answers
```

Judge0 needs **cgroup v1** and privileged containers. On a modern distro add
`systemd.unified_cgroup_hierarchy=0` to the kernel command line and reboot.
Put it behind HTTPS (Caddy or a Cloudflare tunnel) — Vercel functions should not
call a plain-HTTP host.

**Option B — managed.** Judge0 CE on RapidAPI gives you a URL and a key with a small
free quota; fine for personal use, and you can swap to self-hosted later without code
changes. Set `JUDGE0_TOKEN` to the RapidAPI key — the app sends the RapidAPI headers
automatically when the URL contains `rapidapi`.

Then confirm which language id is Python on your instance:

```bash
curl -s "$JUDGE0_URL/languages" | grep -i python
# 71 is Python 3.8 on Judge0 CE 1.13; newer builds may use a different id
```

## Step 4 — Deploy on Vercel

1. <https://vercel.com/new> → import `anya-xcode/progit`.
2. Leave the build settings alone — `vercel.json` already sets the build command
   (`npm run build`), the output directory (`frontend/dist`), the function
   (`api/index.js`, 60s max duration, problem data bundled) and the SPA rewrites.
3. Add the environment variables (Settings → Environment Variables), for **all**
   environments:

| Variable | Value | Why |
| --- | --- | --- |
| `MONGODB_URI` | your Atlas string | database |
| `SKIP_LIBRARY_SYNC` | `true` | you seeded in step 2; skipping keeps cold starts fast |
| `EXECUTION_PROVIDER` | `judge0` | run code on Judge0 |
| `JUDGE0_URL` | `https://judge0.example.com` | your Judge0 |
| `JUDGE0_TOKEN` | token / RapidAPI key | if your instance needs one |
| `JUDGE0_LANGUAGE_ID` | `71` | Python id from step 3 |
| `APP_ACCESS_KEY` | a long random string | the password the app asks for |
| `GITHUB_TOKEN` | your fine-grained token | commits your solutions |
| `CLIENT_URL` | `https://your-app.vercel.app` | CORS + OAuth redirect |

4. **Deploy**, then open the URL. The app asks for the access key once per browser.

## Step 5 — Check it works

```bash
curl https://your-app.vercel.app/api/health
# {"status":"ok","database":"connected","accessKeyRequired":true,...}
```

In the app: open a problem → **Run** (proves Judge0 works) → **Submit** → on Accepted,
check the commit appears in `anya-xcode/AtoZ`.

## Step 6 — GitHub in production

The token in `GITHUB_TOKEN` is enough. If you prefer the OAuth button, create a second
OAuth App whose callback is `https://your-app.vercel.app/api/github/oauth/callback` and
set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` on Vercel.

---

## What to expect

- **Submissions are slower.** Every test is a call to Judge0, and GitHub sync now
  finishes *before* the response (serverless functions freeze after responding), so an
  accepted submit can take several seconds.
- **Function limit is 60s.** A problem with many tests plus a slow judge can hit it.
  Lower `EXECUTION_TIME_LIMIT_MS` or use a judge close to your Vercel region.
- **Cold starts** add a second or two after idle periods.
- **The judge is a dependency.** If it is down, Run/Submit fail with a clear message;
  the rest of the app keeps working.
- **Anyone with the URL and the key can use it**, including committing to your repo.
  Use a long `APP_ACCESS_KEY`, and rotate it by changing the variable and redeploying.
- **Atlas free tier** is 512 MB — the library is ~30 MB, so there is plenty of room.

## Option C — keep the real sandbox instead

If you would rather not run a judge, put the **API on a host that allows Docker or
gives you a VM** (Fly.io, Railway, Render) with `EXECUTION_PROVIDER=docker` (build
`sandbox/python`) or `namespace`, keep the frontend on Vercel, and point the frontend
at the API by adding a Vercel rewrite:

```json
{ "rewrites": [{ "source": "/api/(.*)", "destination": "https://your-api-host/api/$1" }] }
```

This keeps the exact sandbox used locally — no third-party judge, same verdicts,
same limits.

## Updating a deployed instance

```bash
git push                      # Vercel redeploys automatically
MONGODB_URI="…" npm run seed  # only when the problem library changed
```
