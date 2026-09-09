# Cloudflare Code Review Agent (Alibaba OCR on Workers)

> A 24/7 automated GitHub PR code reviewer living on Cloudflare Workers, powered by SQLite Durable Objects, Workers AI, and inspired by **Alibaba's [open-code-review (OCR)](https://github.com/alibaba/open-code-review)** architecture.

Built for [ClawBuilders](https://clawbuilder.club) S1:E5 — [Deploy AI Agents with Cloudflare](https://clawbuilder.club/events/s1/ep5/deploy-ai-agents-with-cloudflare).

---

## ⚡ One-Click Deploy to Cloudflare

Deploy the complete multi-model agent live to your own Cloudflare account in under 60 seconds with zero local setup:

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/Clawbuilders/cloudflare-code-reviewer">
  <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" height="38"/>
</a>

---

## 🧭 Two Tracks in One Repo

This repository contains both workshop tracks so builders can see the code evolve from a simple 50-line worker to an enterprise multi-model committee:

### 1. 🚀 Starter Track (`src/starter.ts`)
*   **Concept**: Deploy your first automated PR reviewer in 10 minutes.
*   **Architecture**: Single stateless Cloudflare Worker + Workers AI (Alibaba Qwen 2.5 Coder).
*   **Run Locally**: `npm run dev:starter`
*   **Deploy**: `npm run deploy:starter`

### 2. ⚡ Advanced Track (`src/index.ts` — Default Deploy)
*   **Concept**: Full Alibaba OCR architecture with state, debouncing, and multi-model consensus.
*   **Architecture**: Ingress Worker + SQLite Durable Object (15s push debounce) + Parallel Committee (`DeepSeek-R1` + `Alibaba Qwen 2.5 Coder` + `Llama 3.3 70B` Arbiter).
*   **Run Locally**: `npm run dev`
*   **Deploy**: `npm run deploy` (or click the **Deploy to Cloudflare** button above!)

---

## 🧠 Architecture Overview

Unlike naive AI review bots that dump entire diffs into a prompt, this agent implements Alibaba's **dual-engine review philosophy**:

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
        ┌────────────────┴────────────────┐
        │ Parallel Review via Promise.all │
        ▼                                 ▼
Security Specialist              Code Quality Specialist
DeepSeek-R1 Distill              Alibaba Qwen 2.5 Coder
(NPE, Leaks, Race Conditions)    (Idiomatic Fixes & Diffs)
        │                                 │
        └────────────────┬────────────────┘
                         │
                         ▼
                Lead Review Arbiter
                 Meta Llama 3.3 70B
            (Deduplicates & Removes Noise)
                         │
                         ▼
              GitHub Inline Suggestions
```

### Key Highlights
*   **100% Free Tier**: Runs on Cloudflare's free Workers, free SQLite Durable Objects, and free daily Workers AI Neurons. Zero external API credits required.
*   **Deterministic Hard Rails**: Automatically strips lockfiles, minified bundles, documentation, and vendor directories.
*   **Stateful 15s Debounce**: If an author pushes 3 rapid commits, the PR Durable Object debounces execution, running once for the final state to save tokens.
*   **Multi-Model Committee**: Evaluates security and syntax in parallel using **DeepSeek-R1** and **Alibaba Qwen 2.5 Coder**, synthesized by **Llama 3.3 70B** to filter false positives.
*   **Actionable Suggestions**: Posts comments formatted as GitHub ````suggestion ... ```` blocks so fixes can be accepted with one click.

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
# To run the Advanced Track (Multi-Model + Durable Objects):
npm run dev

# Or to run the Starter Track (Single Worker):
npm run dev:starter
```

### 3. Deploy to Cloudflare
```bash
npx wrangler login
npm run deploy
```

### 4. Configure GitHub Token (Secret)
To allow the agent to post review comments back to your GitHub repository:
```bash
npx wrangler secret put GITHUB_TOKEN
```
*(Enter a GitHub Personal Access Token with `repo` or `pull_requests:write` permission).*

---

## 🔗 GitHub Webhook Setup

1. In your GitHub repository, go to **Settings** ➔ **Webhooks** ➔ **Add webhook**.
2. **Payload URL**: `https://<your-worker-subdomain>.workers.dev/webhook/github`
3. **Content type**: `application/json`
4. **Events to trigger**: Select **Let me select individual events** ➔ Check **Pull requests**.
5. Click **Add webhook**.

Whenever a PR is opened or updated, your Cloudflare agent will automatically review the changes and post inline suggestions!

---

## 📜 License
Apache-2.0. Built with ❤️ by [ClawBuilders](https://clawbuilder.club).
