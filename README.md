# Cloudflare Code Review Agent (Alibaba OCR + 7-Pillar Security Suite)

> A 24/7 automated GitHub PR code reviewer living on Cloudflare Workers, powered by SQLite Durable Objects, Workers AI, and inspired by **Alibaba's [open-code-review (OCR)](https://github.com/alibaba/open-code-review)** architecture guarded by a **7-Pillar Defense-in-Depth Suite**.

Built for [ClawBuilders](https://clawbuilder.club) S1:E5 — [Deploy AI Agents with Cloudflare](https://clawbuilder.club/events/s1/ep5/deploy-ai-agents-with-cloudflare).

---

## ⚡ One-Click Deploy to Cloudflare

Each track lives in its own fully self-contained directory, so Cloudflare's Deploy to Workers button can target either one directly and deploy *exactly* that track — not a mix of the two.

**Starter Track** (`starter/` — single-file reviewer, ten minutes to set up):

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/Clawbuilders/cloudflare-code-reviewer/tree/main/starter">
  <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy Starter Track to Cloudflare" height="38"/>
</a>

**Advanced Track** (repo root — full 7-pillar suite, Durable Objects, multi-model committee):

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/Clawbuilders/cloudflare-code-reviewer">
  <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy Advanced Track to Cloudflare" height="38"/>
</a>

> Each button's deploy command is auto-detected from that directory's own `package.json` (`npm run deploy`) — there's no shared root dependency between the two, so one button can never accidentally deploy the other track.

---

## 🛡️ The 7-Pillar Security Harness Suite

A Cloudflare Worker is a V8 isolate — it **cannot** execute native binaries (no `gitleaks`, `semgrep`, or `opa` executables) without a paid [Cloudflare Sandbox](https://developers.cloudflare.com/sandbox/) container. So this pipeline is honest about what's actually running:

- **REAL** = calls a live, public, unauthenticated HTTP API. No binary needed — this is exactly what a free-tier Worker can legitimately do.
- **HEURISTIC** = a hand-rolled JS re-implementation of the named project's rule *ideas* (regex/path-matching), not the actual tool.

| # | Pillar & Repository | Kind | Specialty in the PR Agent Pipeline |
|---|---|---|---|
| **1** | 🔑 **[gitleaks/gitleaks](https://github.com/gitleaks/gitleaks)**-pattern scan | HEURISTIC | Zero-tolerance regex scan for hardcoded API keys, Stripe/AWS/Slack/GitHub tokens, private key blocks, and `.env` leaks. Blocks the PR outright if found. |
| **2** | 📦 **[osv.dev](https://osv.dev)** vulnerability lookup | **REAL** | New `package.json` dependencies are batch-queried live against Google's public OSV vulnerability database — real CVE/GHSA IDs, not a guess. |
| **3** | 🔍 Hard-Rails file filter (Alibaba OCR-style) | HEURISTIC | Strips lockfiles, bundles, and vendor code before spending LLM tokens. Not a Semgrep integration — SAST-style reasoning happens in the LLM pass (Pillar 5). |
| **4** | 🛡️ **[open-policy-agent/opa](https://github.com/open-policy-agent/opa)**-inspired policy gate | HEURISTIC | Flags changes to CI/CD workflows (`.github/workflows/`), auth code, or infra config, and PRs over a blast-radius file-count threshold. *(Real OPA is possible: compile a Rego policy to WASM with `opa build -t wasm` and evaluate it with [`@open-policy-agent/opa-wasm`](https://github.com/open-policy-agent/npm-opa-wasm) — a good stretch goal, not built here since it needs a build step.)* |
| **5** | 🧰 **[google/mantis](https://github.com/google/mantis)**-style reachability check | **REAL context** | Pulls the *full file* (not just the diff hunk) for changed files via the GitHub Contents API, so the security model can judge whether a flaw is actually reachable instead of pattern-matching a hunk in isolation. |
| **6** | 🧪 **[OWASP/Agent-Security-Regression-Harness](https://github.com/OWASP/Agent-Security-Regression-Harness)**-style regression gate | HEURISTIC | The Lead Arbiter (Llama 3.3 70B) is instructed to verify proposed fixes introduce zero secondary vulnerabilities before posting. *(The real OWASP harness is an external, executable regression suite meant to run in CI against a deployed agent endpoint — a good companion GitHub Action, not something that runs inside the Worker itself.)* |
| **7** | 📊 **[deps.dev](https://deps.dev)** OpenSSF Scorecard check | **REAL** | New dependencies are resolved to their source repo and checked live against the OpenSSF Scorecard (maintenance activity, code review practices, branch protection) via deps.dev's public API. |

---

## 🧠 Multi-Harness + Multi-Model Pipeline

```
                 GitHub PR Webhook
                         │
                         ▼
              Cloudflare Edge Worker
                         │
                         ▼
        Durable Object (PrReviewCoordinator)
         - 15s Push Debounce Timer
         - SQLite PR State & History
                         │
         ┌───────────────┼───────────────┬───────────────┐
         ▼               ▼               ▼               ▼
   [Pillar 1]      [Pillar 2]      [Pillar 3]      [Pillar 4]
  Gitleaks-pattern  osv.dev API    Hard-Rails      OPA-inspired
   Secret Scan     (REAL — CVEs)   File Filter    Policy/Blast Radius
  (heuristic)                     (heuristic)      (heuristic)
         │               │               │               │
         └───────────────┼───────────────┴───────────────┘
                         │
                         ▼
              [Pillar 7] deps.dev Scorecard
              (REAL — supply-chain check)
                         │
        ┌────────────────┴────────────────┐
        │ Parallel Review via Promise.all,│
        │ each proxied through AI Gateway │
        ▼                                 ▼
[Pillar 5: Security Specialist]   [Code Quality Specialist]
DeepSeek-R1 Distill               Alibaba Qwen 2.5 Coder
+ full-file context (REAL) for    (Clean Code & Diffs)
  Mantis-style reachability
        │                                 │
        └────────────────┬────────────────┘
                         │
                         ▼
                Lead Review Arbiter
                 Meta Llama 3.3 70B
     + [Pillar 6: OWASP-ASRH-style Regression]
            (Deduplicates & Removes Noise)
                         │
                         ▼
           GitHub PR Comment (```suggestion
             blocks — copy-paste, not a
             one-click Review API suggestion)
```

---

## 🧭 Two Tracks, Two Isolated Directories

### 1. 🚀 Starter Track (`starter/src/index.ts`)
*   **Concept**: Deploy your first automated PR reviewer in 10 minutes.
*   **Architecture**: Single stateless Cloudflare Worker + Workers AI (Alibaba Qwen 2.5 Coder). Its own `package.json`/`wrangler.json` — no dependency on the repo root.
*   **Run Locally**: `cd starter && npm install && npm run dev`
*   **Deploy**: `cd starter && npm run deploy` (or click the **Starter** button above!)

### 2. ⚡ Advanced Track (`src/index.ts` — repo root)
*   **Concept**: Full Alibaba OCR architecture with the 7-pillar security suite, SQLite Durable Objects, debouncing, and multi-model committee.
*   **Run Locally**: `npm run dev`
*   **Deploy**: `npm run deploy` (or click the **Advanced** button above!)

---

## 🚀 Local Quickstart

### 1. Clone

```bash
git clone https://github.com/Clawbuilders/cloudflare-code-reviewer.git
cd cloudflare-code-reviewer
```

Pick a track — each has its own dependencies, so `npm install` runs separately per directory.

**Starter Track:**
```bash
cd starter
npm install
npm run dev        # http://localhost:8787
```

**Advanced Track** (from the repo root instead):
```bash
npm install
npm run dev        # http://localhost:8787
```

### 2. Deploy to Cloudflare
```bash
npx wrangler login
npm run deploy      # run from starter/ or the repo root, depending on the track
```

### 3. Configure GitHub Token (Secret)

A classic PAT needs the `repo` scope; a fine-grained PAT needs **Pull requests: Read and write** (plus **Contents: Read**) on the target repo.

**CLI** (run from `starter/` or the repo root, matching the track you deployed):
```bash
npx wrangler secret put GITHUB_TOKEN
```

**Or via the dashboard** (no terminal needed — useful if you'd rather not type a token into a CLI prompt):
1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**.
2. Click into your deployed worker → **Settings** tab → **Variables and Secrets** → **Add**.
3. Type **Secret** · Name `GITHUB_TOKEN` · Value your PAT → **Save and deploy**.

> **Deploying both tracks?** The secret is per-worker, not per-repo — deploying both the Advanced worker (`cloudflare-code-reviewer`) and the Starter worker (`cloudflare-code-reviewer-starter`) means **`GITHUB_TOKEN` has to be added to each one separately**. Setting it on only one still returns a 200 from the other, silently skipping the GitHub post — worth checking `wrangler secret list` (or the dashboard) on *both* workers if a review isn't showing up where you expect it.

### 4. (Optional) Enable AI Gateway caching

By default the agent calls Workers AI directly — no gateway, no caching. To turn on the 24h diff cache, fallback routing, and observability:

1. Dashboard → **AI** → **AI Gateway** → **Create Gateway** (any name).
2. Add it to that track's `wrangler.json` (`starter/wrangler.json` or the root one):
   ```json
   "vars": { "AI_GATEWAY_NAME": "your-gateway-name" }
   ```
3. Redeploy. Every `env.AI.run()` call already checks for `AI_GATEWAY_NAME` and routes through it automatically when present — no code changes needed.

> This is opt-in on purpose: a gateway ID that doesn't exist yet returns an error, so shipping a hardcoded default would break the demo for anyone who skips this step.

---

## 📜 License
Apache-2.0. Built with ❤️ by [ClawBuilders](https://clawbuilder.club).
