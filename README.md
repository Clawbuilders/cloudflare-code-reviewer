# Cloudflare Code Review Agent (Alibaba OCR + 6-Pillar Security Suite)

> A 24/7 automated GitHub PR code reviewer living on Cloudflare Workers, powered by SQLite Durable Objects, Workers AI, and inspired by **Alibaba's [open-code-review (OCR)](https://github.com/alibaba/open-code-review)** architecture guarded by a **6-Pillar Defense-in-Depth Suite**.

Built for [ClawBuilders](https://clawbuilder.club) S1:E5 — [Deploy AI Agents with Cloudflare](https://clawbuilder.club/events/s1/ep5/deploy-ai-agents-with-cloudflare).

---

## ⚡ One-Click Deploy to Cloudflare

Deploy the complete multi-harness agent live to your own Cloudflare account in under 60 seconds with zero local setup:

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/Clawbuilders/cloudflare-code-reviewer">
  <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" height="38"/>
</a>

---

## 🛡️ The 6-Pillar Security Harness Suite

Every pull request is evaluated across six industry-standard open-source security harnesses backed by major foundations (CNCF, Google, OWASP):

| # | Pillar & Repository | Stars / Pedigree | Specialty in the PR Agent Pipeline |
|---|---|---|---|
| **1** | 🔑 **[gitleaks/gitleaks](https://github.com/gitleaks/gitleaks)** | **20k+ ★** | **Zero-Tolerance Secret Scanning:** Blocks hardcoded API keys, Stripe/AWS/CF tokens, and `.env` leaks immediately. |
| **2** | 📦 **[google/osv-scanner](https://github.com/google/osv-scanner)** | **6k+ ★ (Google)** | **Dependency & Supply Chain Auditing:** Checks new packages in `package.json` / lockfiles against Google's Open Source Vulnerabilities database for known CVEs. |
| **3** | 🔍 **[semgrep/semgrep](https://github.com/semgrep/semgrep)** | **11k+ ★** | **Deterministic SAST Pattern Matching:** Scans the diff for Null Pointer Exceptions, SQLi, XSS, and unhandled promise rejections before calling models. |
| **4** | 🛡️ **[open-policy-agent/opa](https://github.com/open-policy-agent/opa)** | **12.1k+ ★ (CNCF)** | **Blast Radius & PR Policy Gate:** Flags high-risk changes to CI/CD workflows (`.github/workflows/`), billing configs, and core auth middleware. |
| **5** | 🧰 **[google/mantis](https://github.com/google/mantis)** | **Google Toolkit** | **Vulnerability Validation & Exploitability:** DeepSeek-R1 verifies whether static findings are truly reachable and exploitable, eliminating false alarms. |
| **6** | 🧪 **[OWASP/Agent-Security-Regression-Harness](https://github.com/OWASP/Agent-Security-Regression-Harness)** | **OWASP Standard** | **Agent Safety & Regression Gate:** Lead Arbiter (Llama 3.3 70B) verifies proposed fixes introduce zero secondary vulnerabilities or permission leaks. |

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
    Gitleaks       Google OSV     Semgrep SAST      OPA Policy
   Secret Scan    Dependencies    (NPE, Leaks)    (Blast Radius)
         │               │               │               │
         └───────────────┼───────────────┴───────────────┘
                         │
        ┌────────────────┴────────────────┐
        │ Parallel Review via Promise.all │
        ▼                                 ▼
[Pillar 5: Security Specialist]   [Code Quality Specialist]
DeepSeek-R1 Distill               Alibaba Qwen 2.5 Coder
+ Google Mantis Validation        (Clean Code & Diffs)
        │                                 │
        └────────────────┬────────────────┘
                         │
                         ▼
                Lead Review Arbiter
                 Meta Llama 3.3 70B
       + [Pillar 6: OWASP Agent Regression]
            (Deduplicates & Removes Noise)
                         │
                         ▼
              GitHub Inline Suggestions
```

---

## 🧭 Two Tracks in One Repo

### 1. 🚀 Starter Track (`src/starter.ts`)
*   **Concept**: Deploy your first automated PR reviewer in 10 minutes.
*   **Architecture**: Single stateless Cloudflare Worker + Workers AI (Alibaba Qwen 2.5 Coder).
*   **Run Locally**: `npm run dev:starter`
*   **Deploy**: `npm run deploy:starter`

### 2. ⚡ Advanced Track (`src/index.ts` — Default Deploy)
*   **Concept**: Full Alibaba OCR architecture with the 6-pillar security suite, SQLite Durable Objects, debouncing, and multi-model committee.
*   **Run Locally**: `npm run dev`
*   **Deploy**: `npm run deploy` (or click the **Deploy to Cloudflare** button above!)

---

## 🚀 Local Quickstart

### 1. Clone & Install
```bash
git clone https://github.com/Clawbuilders/cloudflare-code-reviewer.git
cd cloudflare-code-reviewer
npm install
```

### 2. Run Locally
```bash
npm run dev
```

### 3. Deploy to Cloudflare
```bash
npx wrangler login
npm run deploy
```

### 4. Configure GitHub Token (Secret)
```bash
npx wrangler secret put GITHUB_TOKEN
```

---

## 📜 License
Apache-2.0. Built with ❤️ by [ClawBuilders](https://clawbuilder.club).
