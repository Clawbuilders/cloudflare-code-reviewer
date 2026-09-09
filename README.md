# Cloudflare Code Review Agent (Alibaba OCR + Multi-Harness Security)

> A 24/7 automated GitHub PR code reviewer living on Cloudflare Workers, powered by SQLite Durable Objects, Workers AI, and inspired by **Alibaba's [open-code-review (OCR)](https://github.com/alibaba/open-code-review)** architecture with a **4-pillar security harness suite**.

Built for [ClawBuilders](https://clawbuilder.club) S1:E5 — [Deploy AI Agents with Cloudflare](https://clawbuilder.club/events/s1/ep5/deploy-ai-agents-with-cloudflare).

---

## ⚡ One-Click Deploy to Cloudflare

Deploy the complete multi-harness agent live to your own Cloudflare account in under 60 seconds with zero local setup:

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/Clawbuilders/cloudflare-code-reviewer">
  <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" height="38"/>
</a>

---

## 🛡️ The 4-Pillar Security Harness Suite

Just as the brain employs multiple specialized models, this agent passes every pull request through **four specialized security harnesses**:

| # | Security Harness & Repository | Specialty & Role in Review |
|---|---|---|
| **1** | **[semgrep/semgrep](https://github.com/semgrep/semgrep)** | **Deterministic SAST Pattern Matching:** Scans AST for Null Pointer Exceptions (NPE), unhandled promise rejections, SQL injections, and resource leaks. |
| **2** | **[google/osv-scanner](https://github.com/google/osv-scanner)** | **Dependency & Supply Chain Auditing:** Heuristically audits newly added dependencies against open vulnerability databases to catch known CVEs before reviewing app code. |
| **3** | **[google/mantis](https://github.com/google/mantis)** | **Vulnerability Validation & Reproduction:** Google's agentic security review toolkit. DeepSeek-R1 validates whether flagged flaws are truly reachable and exploitable, eliminating false alarms. |
| **4** | **[OWASP/Agent-Security-Regression-Harness](https://github.com/OWASP/Agent-Security-Regression-Harness)** | **Agent Security Regression & Safety Boundary:** OWASP test harness ensuring that the AI agent's proposed fixes introduce zero secondary vulnerabilities, permission bypasses, or context leaks. |

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
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   [Harness 1]     [Harness 2]     [Harness 3]
  Semgrep SAST     Google OSV      Secret Scan
  (NPE, Leaks)    (Dependencies)   (API Tokens)
         │               │               │
         └───────────────┼───────────────┘
                         │
        ┌────────────────┴────────────────┐
        │ Parallel Review via Promise.all │
        ▼                                 ▼
Security Specialist              Code Quality Specialist
DeepSeek-R1 Distill              Alibaba Qwen 2.5 Coder
+ Google Mantis Validation       (Clean Code & Diffs)
        │                                 │
        └────────────────┬────────────────┘
                         │
                         ▼
                Lead Review Arbiter
                 Meta Llama 3.3 70B
          + OWASP Agent Regression Check
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
*   **Concept**: Full Alibaba OCR architecture with 4 security harnesses, SQLite Durable Objects, debouncing, and multi-model committee.
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
