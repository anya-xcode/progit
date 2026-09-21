# Deploying DSAForge

Running it on your machine needs nothing extra. Deployed, three pieces move:

| Piece | Local | Deployed |
| --- | --- | --- |
| Frontend (React) | Vite dev server | Vercel (free) |
| API (Express) | `node src/server.js` | Render (free) or Vercel |
| Database | MongoDB on localhost | MongoDB Atlas M0 (free) |
| Code execution | WSL/Docker sandbox | the same sandbox on Render, or a remote judge |

**The one real constraint:** Vercel's serverless functions cannot create Linux
namespaces or run Docker, so the sandbox that judges your code cannot run there.
Either host the API where containers get a real kernel (Render, Fly.io, Railway,
a VPS — the sandbox works unchanged), or keep the API on Vercel and point it at a
remote judge.

The public Piston API is whitelist-only since February 2026, so it is not an option.

---

# Option 1 — All free: Vercel + Render + Atlas (recommended)

Your own sandbox, no third-party judge, no credit card.

## Step 1 — MongoDB Atlas (free M0)

1. <https://cloud.mongodb.com> → create a free **M0** cluster.
2. **Database Access** → add a user, password letters and numbers only.
3. **Network Access** → allow `0.0.0.0/0` (hosted apps have no fixed IP).
4. **Clusters → Connect → Drivers** → copy the string and add the database name:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/dsaforge?retryWrites=true&w=majority`

## Step 2 — Load the 474 problems (once, from your machine)

```bash
cd backend
$env:MONGODB_URI="mongodb+srv://…/dsaforge"; npm run seed   # PowerShell
# MONGODB_URI="mongodb+srv://…/dsaforge" npm run seed        # bash
```

Re-run whenever the problem library changes.

## Step 3 — API on Render (free)

1. <https://render.com> → sign up with GitHub.
2. **New → Blueprint** → pick `anya-xcode/progit`. Render reads `render.yaml`
   and creates a Docker web service on the **free** instance type.
3. Fill in the four secrets it asks for:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | the Atlas string from step 1 |
| `APP_ACCESS_KEY` | a long random password (the app will ask for it) |
| `GITHUB_TOKEN` | your fine-grained token (Contents: read and write) |
| `CLIENT_URL` | `https://your-app.vercel.app` — fill in after step 4, then redeploy |

4. Wait for the first build, then check the sandbox actually works there:

```bash
curl https://dsaforge-api.onrender.com/api/health
curl -X POST https://dsaforge-api.onrender.com/api/code/health -H "x-dsaforge-key: YOUR_KEY"
# {"ok":true,...} means code execution works on Render
```

If `ok` is false or the call errors, Render is blocking namespaces on that
instance — jump to Option 2 and use a remote judge instead.

## Step 4 — Frontend on Vercel (free)

1. <https://vercel.com/new> → import `anya-xcode/progit`.
2. Settings → Environment Variables → add
   `VITE_API_BASE_URL = https://dsaforge-api.onrender.com/api`
3. Deploy. Then go back to Render and set `CLIENT_URL` to the Vercel URL
   (this is what allows the browser to call the API) and redeploy the service.

## Step 5 — Check

Open the Vercel URL → enter your access key → open a problem → **Run** → **Submit**.
On Accepted, the commit appears in `anya-xcode/AtoZ`.

## What the free tiers mean in practice

- **Render free services sleep after ~15 minutes idle**, so the first request after
  a pause takes 30–60 seconds. Everything is normal speed afterwards.
- Free instances have 512 MB RAM; `EXECUTION_MAX_CONCURRENT=1` keeps runs within it.
- Atlas M0 is 512 MB of storage — the library uses about 30 MB.
- Vercel Hobby is free for personal projects.

---

# Option 2 — All on Vercel + a remote judge

Use this if you would rather not run a container host, or if Render blocks the sandbox.

1. Steps 1 and 2 above (Atlas + seed).
2. Get a Judge0:
   - **Self-hosted** on any VPS with Docker (free tiers: Oracle Cloud Always Free,
     Google Cloud e2-micro):
     ```bash
     wget https://github.com/judge0/judge0/releases/download/v1.13.1/judge0-v1.13.1.zip
     unzip judge0-v1.13.1.zip && cd judge0-v1.13.1
     # set passwords and AUTHN_TOKEN in judge0.conf
     docker compose up -d db redis && sleep 10 && docker compose up -d
     ```
     Judge0 needs cgroup v1 (`systemd.unified_cgroup_hierarchy=0`) and privileged
     containers; put it behind HTTPS (Caddy or a free Cloudflare Tunnel).
   - **Managed:** Judge0 CE on RapidAPI — quickest, but the free quota is small and
     each submission spends several requests.
3. Check which id is Python: `curl $JUDGE0_URL/languages | grep -i python` (71 on CE 1.13).
4. Import the repo on Vercel (`vercel.json` already configures the build, the
   `api/index.js` function, 60s limit and SPA rewrites) and set:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | Atlas string |
| `SKIP_LIBRARY_SYNC` | `true` |
| `EXECUTION_PROVIDER` | `judge0` |
| `JUDGE0_URL` / `JUDGE0_TOKEN` / `JUDGE0_LANGUAGE_ID` | your judge, token, `71` |
| `APP_ACCESS_KEY` | a long random password |
| `GITHUB_TOKEN` | your fine-grained token |
| `CLIENT_URL` | `https://your-app.vercel.app` |

Leave `VITE_API_BASE_URL` unset here — the frontend and API share an origin.

**Expect:** submissions are slower (a call per test, plus GitHub sync finishing
before the response, since serverless functions freeze once they reply), a 60s
function ceiling, and cold starts.

---

## Security

The app has no accounts and the server holds your GitHub token, so **set
`APP_ACCESS_KEY` on anything reachable from the internet**. Anyone with the URL and
the key can run code and commit to your repository. Rotate it by changing the
variable and redeploying.

## Updating a deployment

```bash
git push                        # Render and Vercel redeploy automatically
MONGODB_URI="…" npm run seed    # only when the problem library changed
```
