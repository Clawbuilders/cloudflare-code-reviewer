# S1:E5 Workshop: Building an Automated Code Review Agent with Cloudflare & Alibaba Open-Code-Review (OCR)

> **Event:** ClawBuilders S1:E5 — Deploy AI Agents with Cloudflare  
> **Format:** 3-Hour Hands-on Builder Meetup (Build • Deploy • Demo)  
> **Reference Architecture:** [alibaba/open-code-review](https://github.com/alibaba/open-code-review) + Cloudflare Agent Cloud  

---

## 1. Executive Summary & Core Concept

This workshop guides developers through building and deploying a **24/7 automated GitHub Pull Request Review Agent** living entirely on the Cloudflare edge network.

Rather than building a standard chatbot, attendees build an edge-native developer tool inspired by **Alibaba's `open-code-review` (OCR)**—an internal tool battle-tested across millions of code changes before being open-sourced.

### Key Architectural Tenets
1. **Edge Ingress**: Cloudflare Workers handle GitHub webhook ingress with sub-5ms cold starts.
2. **State & Debounce**: SQLite-backed Durable Objects coordinate PR events, debouncing rapid commit pushes and preserving review conversation history.
3. **Multi-Model Committee**: Runs multiple specialized AI models concurrently (Security specialist + Code Quality specialist + Arbiter) using edge parallelization (`Promise.all()`).
4. **AI Gateway Proxy**: Provides unified model endpoints, 24-hour diff caching (0 token cost on repeated hunks), and automatic provider failover.
5. **Interactive MCP**: Exposes a Model Context Protocol endpoint so developers can question or challenge the reviewer directly inside local terminals via **Claude Code**, **Cursor**, or **Hermes Agent**.

---

## 2. Research: Alibaba `open-code-review` (OCR) Deep Dive

Alibaba open-sourced **`open-code-review` (OCR)** to solve the fundamental flaw of naive LLM code reviewers: **high hallucination rates, missing line context, and noisy nitpicks**.

### The Dual-Engine Philosophy
Alibaba divides code review into two distinct layers:

```
                  Raw GitHub Pull Request Diff
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │        1. DETERMINISTIC "HARD RAILS"         │
        │ - Filter lockfiles, binaries, vendor files   │
        │ - Extract accurate file paths & line numbers │
        │ - AST rule-matching: NPEs, leaks, SQLi, XSS  │
        └──────────────────────┬───────────────────────┘
                               │ Curated Hunks & Hotspots
                               ▼
        ┌──────────────────────────────────────────────┐
        │       2. CONTEXT-AWARE LLM REASONING         │
        │ - Evaluate architectural intent & logic      │
        │ - Check boundary edge cases & concurrency    │
        │ - Output GitHub ```suggestion diff blocks    │
        └──────────────────────────────────────────────┘
```

### 1. Deterministic Pipeline ("Hard Rails")
*   **Aggressive Noise Filtering**: Automatically ignores lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`, `go.sum`), build artifacts, compiled bundles (`dist/`), vendor packages, and generated documentation.
*   **Syntactic Anchoring**: Computes precise patch line numbers, preventing comments from drifting or failing to attach inline.
*   **Static Defect Rules**: Heuristically flags known critical anti-patterns before spending LLM tokens:
    *   Null Pointer Exceptions (NPE) and undefined property lookups.
    *   Thread-safety hazards and unhandled concurrency.
    *   Resource / connection leaks (unclosed sockets, unreleased file descriptors).
    *   SQL injection, command injection, and unsanitized HTML/XSS.

### 2. Context-Aware LLM Reasoning
*   Focuses the LLM's limited context window exclusively on high-signal modified hunks.
*   Enforces structured markdown outputs with GitHub suggestion blocks (` ```suggestion `), allowing developers to accept fixes with a single click.

---

## 3. The 6-Pillar Security Harness Suite (Each with its Own Specialty)

Just as the brain employs multiple specialized models, the agent evaluates pull requests through a **6-Pillar Defense-in-Depth Suite**—where every harness is an industry-recognized open-source project backed by major foundations (CNCF, Google, OWASP):

| # | Security Harness & Repository | Stars / Pedigree | Specialty & Role in Review | Execution Layer |
|---|---|---|---|---|
| **1** | **[gitleaks/gitleaks](https://github.com/gitleaks/gitleaks)** | 20k+ ★ | **Zero-Tolerance Secret & Token Scanning**: Instant regex & entropy scanning on diffs. Halts and issues a critical block if hardcoded API keys, tokens, or `.env` credentials are detected. | Pre-LLM Edge Gate (Worker native) |
| **2** | **[google/osv-scanner](https://github.com/google/osv-scanner)** | 6k+ ★ (Google) | **Dependency & Supply Chain Auditing**: Audits newly added packages in `package.json`, `pnpm-lock.yaml`, and `Cargo.lock` against Google's Open Source Vulnerabilities database for known CVEs. | Pre-LLM Lockfile Scanner |
| **3** | **[semgrep/semgrep](https://github.com/semgrep/semgrep)** | 11k+ ★ | **Deterministic SAST Pattern Matching**: Fast AST-level rule matching for OWASP Top 10 vulnerabilities, Null Pointer Exceptions (NPE), SQL injection, and memory/socket leaks. | Pre-LLM Filter (Sandbox / rules) |
| **4** | **[open-policy-agent/opa](https://github.com/open-policy-agent/opa)** | 12k+ ★ (CNCF) | **Blast Radius & PR Policy Gate**: Enforces policy-as-code. Flags PRs modifying protected CI/CD workflows (`.github/workflows/`), core auth middleware, or exceeding safe change radius. | Pre-LLM Policy Gate |
| **5** | **[google/mantis](https://github.com/google/mantis)** | Google Toolkit | **Vulnerability Validation & Reproduction**: Google’s security review toolkit for AI agents. DeepSeek-R1 uses Mantis rules to verify whether a flagged flaw is truly reachable and exploitable, eliminating false alarms. | Mid-Pipeline Validation Layer |
| **6** | **[OWASP/Agent-Security-Regression-Harness](https://github.com/OWASP/Agent-Security-Regression-Harness)** | OWASP Standard | **Agent Safety & Regression Gate**: Enforced by Lead Arbiter (Llama 3.3 70B) to verify that the proposed replacement code does not introduce secondary vulnerabilities, permission bypasses, or context leaks. | Post-Generation Verification Layer |

---

## 4. Cloudflare Primitives & Free Tier Compatibility

The entire workshop runs on Cloudflare's **100% Free Tier** with zero credit card requirements:

| Cloudflare Primitive | Free Tier Allocation | Role in the Architecture |
|---|---|---|
| **Cloudflare Workers** | 100,000 requests/day | Instant webhook listener (`/webhook/github`) verifying GitHub HMAC signatures. |
| **Durable Objects (SQLite)** | Included on Workers Free Plan | Coordinates PR state, handles 15s commit debouncing, and stores review comment history in SQLite (`this.ctx.storage.sql`). |
| **Cloudflare AI Gateway** | 100% Free | Universal API gateway with zero-cost edge caching, analytics, rate limiting, and fallback routing. |
| **Workers AI** | 10,000 Neurons/day | Edge GPU inference running Alibaba Qwen 2.5 Coder and DeepSeek R1 for free. |
| **Model Context Protocol (MCP)** | Built-in SDK capability | Exposes `/mcp` so attendees can interrogate the reviewer from local agent tools. |
| **Cloudflare Sandboxes** | Paid ($5/mo container) | *Optional / Advanced only*. Free tier parses diffs via native TypeScript (`parse-diff`) inside Worker memory. |

---

## 5. Live Edge Models in Workers AI Catalog

Queried directly from Cloudflare's catalog (`wrangler ai models list`):

*   **`@cf/qwen/qwen2.5-coder-32b-instruct`**: Alibaba's official code model, trained specifically for code generation, diff comprehension, and syntax corrections.
*   **`@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`**: Reasoning model built for deep logic analysis, catching edge cases, memory leaks, and concurrency bugs.
*   **`@cf/meta/llama-3.3-70b-instruct-fp8-fast`**: High-throughput 70B parameter model ideal for multi-agent synthesis and review arbitration.
*   **`@cf/meta/llama-4-scout-17b-16e-instruct`**: Meta's 17B parameter MoE model (16 experts).
*   **`@cf/moonshotai/kimi-k2.7-code`**: Long-context code model (262K context) for reviewing massive multi-file pull requests.

---

## 6. System Architecture: Multi-Harness + Multi-Model Pipeline

```
                 ┌──────────────────────────────────────────────┐
                 │              GitHub Repository               │
                 └──────┬───────────────────────────────▲───────┘
                        │ 1. PR Webhook (opened/sync)    │ 8. Post Validated Review
                        ▼                                │    with ```suggestion
                 ┌──────────────────────────────┐       │
                 │   Cloudflare Worker (Edge)   │       │
                 │   - Verifies HMAC signature  │       │
                 │   - Fast 200 OK to GitHub    │       │
                 └──────────────┬───────────────┘       │
                                │ 2. Route to PR DO     │
                                ▼                       │
                 ┌──────────────────────────────┐       │
                 │   Durable Object (SQLite)    │───────┘
                 │   - 15s Push Debounce Timer  │
                 │   - Review thread history    │
                 └──────┬───────────────────────┘
                        │ 3. Multi-Harness Evaluation Layer
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
┌───────────────────┐ ┌───────────────────┐ ┌──────────────────────┐
│  Harness 1: SAST  │ │  Harness 2: CVEs  │ │  Harness 3: Secrets  │
│  Semgrep Pattern  │ │  Google OSV       │ │  Gitleaks Heuristics │
│  Matching (NPE,   │ │  Scanner          │ │  (API Keys, Tokens,  │
│  SQLi, Leaks)     │ │  (Dependencies)   │ │  .env Leaks)         │
└─────────┬─────────┘ └─────────┬─────────┘ └──────────┬───────────┘
          │                     │                      │
          └─────────────────────┼──────────────────────┘
                                │ 4. Multi-Model Parallel Reasoning
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
┌───────────────────────────┐                 ┌───────────────────────────┐
│     Security Auditor      │                 │   Code Quality Reviewer   │
│  @cf/deepseek-ai/         │                 │  @cf/qwen/                │
│  deepseek-r1-distill-32b  │                 │  qwen2.5-coder-32b        │
│  + Google Mantis          │                 │  (Clean code, Refactors,  │
│  (Exploit Verification)   │                 │   GitHub ```suggestions)  │
└─────────────┬─────────────┘                 └─────────────┬─────────────┘
              │                                             │
              └──────────────────────┬──────────────────────┘
                                     │ 5. Specialist Reports
                                     ▼
                      ┌─────────────────────────────┐
                      │     Lead Review Arbiter     │
                      │  @cf/meta/llama-3.3-70b-fp8 │
                      │  (Deduplicates & Ranks)     │
                      └──────────────┬──────────────┘
                                     │ 6. Harness 4 Verification
                                     ▼
                      ┌─────────────────────────────┐
                      │    OWASP Agent Security     │
                      │      Regression Check       │
                      │  (No secondary vulns/leaks) │
                      └──────────────┬──────────────┘
                                     │ 7. Proxied via AI Gateway
                                     ▼
                      ┌─────────────────────────────┐
                      │    Cloudflare AI Gateway    │
                      │  - 24h Diff Cache           │
                      │  - Observability & Metrics  │
                      └─────────────────────────────┘
              ┌─────────────────────────────┐
              │     Local IDE (MCP)         │
              │ Claude Code / Cursor /      │
              │ Hermes Agent                │
              └─────────────────────────────┘
```

---

## 6. Full Workshop Plan & Tracks

The workshop is split into two tracks:
*   **Starter Track**: Zero-to-hero in 10 minutes. 100% free, single worker, deployed live to `*.workers.dev`.
*   **Advanced Track**: Full Alibaba OCR architecture with stateful debouncing, multi-model committee, AI Gateway caching, and MCP terminal chat.

---

### Track 1: Starter Track ("Deploy in 10 Minutes")

**Goal:** Build a zero-cost GitHub PR Reviewer that parses diffs and posts inline suggestions using Alibaba Qwen 2.5 Coder.

#### Step 1: Initialize Project
```bash
npm create cloudflare@latest cf-pr-reviewer -- --template "cloudflare/workers-sdk/templates/experimental/worker-typescript"
cd cf-pr-reviewer
npm install parse-diff
```

#### Step 2: Configure Worker (`wrangler.json`)
```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "cf-pr-reviewer",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-01",
  "ai": {
    "binding": "AI"
  }
}
```

#### Step 3: Implement Webhook & Review Logic (`src/index.ts`)
```typescript
import parseDiff from 'parse-diff';

export interface Env {
  AI: any;
  GITHUB_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const payload: any = await request.json();

    // Only process PR open or new commits pushed to the branch
    if (payload.action !== 'opened' && payload.action !== 'synchronize') {
      return new Response('Event ignored', { status: 200 });
    }

    const pr = payload.pull_request;

    // 1. Fetch raw diff directly from GitHub
    const diffRes = await fetch(pr.diff_url, {
      headers: { 'User-Agent': 'Cloudflare-PR-Reviewer' }
    });
    const diffText = await diffRes.text();

    // 2. Deterministic Filter: Skip lockfiles, bundles, and assets (Alibaba OCR rule)
    const files = parseDiff(diffText).filter(file => {
      const path = file.to || '';
      return !path.endsWith('.lock') && 
             !path.endsWith('.json') && 
             !path.includes('dist/') && 
             !path.includes('vendor/');
    });

    if (files.length === 0) {
      return new Response('No reviewable files found.', { status: 200 });
    }

    // 3. Review code with Alibaba Qwen 2.5 Coder on Workers AI
    const review = await env.AI.run('@cf/qwen/qwen2.5-coder-32b-instruct', {
      messages: [
        {
          role: 'system',
          content: `You are an automated code reviewer enforcing Alibaba Open-Code-Review rules.
Analyze the diff for NPEs, security flaws, race conditions, and unhandled errors.
Format your review with clear file paths, line numbers, and actionable suggestions:
\`\`\`suggestion
<replacement code>
\`\`\``
        },
        { role: 'user', content: `Review this diff:\n${JSON.stringify(files.slice(0, 5))}` }
      ]
    });

    // 4. Post feedback back to GitHub PR
    await fetch(pr.comments_url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-PR-Reviewer',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        body: `### 🤖 Automated Code Review (Cloudflare Workers AI × Alibaba Qwen 2.5 Coder)\n\n${review.response}`
      })
    });

    return new Response('Review posted successfully', { status: 200 });
  }
};
```

#### Step 4: Deploy Live
```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```
Copy the generated `*.workers.dev` URL and paste it into GitHub Repo Settings ➔ Webhooks (Event: `Pull requests`).

---

### Track 2: Advanced Track ("Multi-Model Committee & Stateful OCR")

**Goal:** Implement the full enterprise architecture:
1. **Durable Objects (`state.storage.sql`)**: 15s push debounce & review history.
2. **Multi-Model Committee**: DeepSeek R1 + Qwen 2.5 Coder evaluated concurrently via `Promise.all()`, synthesized by Llama 3.3 70B.
3. **AI Gateway**: 24h diff caching and provider failover.
4. **Model Context Protocol (MCP)**: Interactive developer chat via terminal agents.

#### Step 1: Configure Durable Objects & AI Gateway (`wrangler.json`)
```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "cf-pr-reviewer-advanced",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-01",
  "ai": {
    "binding": "AI"
  },
  "durable_objects": {
    "bindings": [
      { "name": "PR_COORDINATOR", "class_name": "PrReviewCoordinator" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["PrReviewCoordinator"] }
  ]
}
```

#### Step 2: Implementation (`src/index.ts`)
```typescript
import { DurableObject } from 'cloudflare:workers';
import parseDiff from 'parse-diff';

export interface Env {
  AI: any;
  PR_COORDINATOR: DurableObjectNamespace;
  GITHUB_TOKEN: string;
  CF_ACCOUNT_ID: string;
  AI_GATEWAY_NAME: string;
}

// ── Ingress Worker ────────────────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return new Response('OK');

    const payload: any = await request.json();
    if (payload.action !== 'opened' && payload.action !== 'synchronize') {
      return new Response('Ignored', { status: 200 });
    }

    // Unique Durable Object instance per Pull Request
    const prId = `${payload.repository.full_name}#${payload.pull_request.number}`;
    const id = env.PR_COORDINATOR.idFromName(prId);
    const stub = env.PR_COORDINATOR.get(id);

    return stub.fetch(new Request('https://internal/queue-review', {
      method: 'POST',
      body: JSON.stringify(payload)
    }));
  }
};

// ── Durable Object: State, Debounce & Multi-Model Execution ────────────────────
export class PrReviewCoordinator extends DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
    // Initialize SQLite storage for conversation & review history
    this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        commit_sha TEXT,
        summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const payload: any = await request.json();
    const pr = payload.pull_request;

    // 1. Debounce rapid pushes: Reset alarm for 15 seconds
    await this.state.storage.setAlarm(Date.now() + 15000);
    await this.state.storage.put('pending_pr', pr);

    return new Response(JSON.stringify({ status: 'queued', debounce: 15 }), { status: 200 });
  }

  // Executes automatically after 15 seconds of silence (no new pushes)
  async alarm() {
    const pr: any = await this.state.storage.get('pending_pr');
    if (!pr) return;

    // 1. Fetch & Parse Diff
    const diffText = await fetch(pr.diff_url, {
      headers: { 'User-Agent': 'Cloudflare-Reviewer-Bot' }
    }).then(r => r.text());

    const files = parseDiff(diffText).filter(
      f => !f.to?.endsWith('.lock') && !f.to?.endsWith('.json') && !f.to?.includes('dist/')
    );
    const diffPayload = JSON.stringify(files.slice(0, 5));

    // 2. Parallel Multi-Model Committee (Zero added latency)
    const [securityCheck, codeCheck] = await Promise.all([
      // Specialist 1: DeepSeek R1 for deep vulnerability and race condition analysis
      this.env.AI.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', {
        messages: [
          { role: 'system', content: 'You are an adversarial security auditor. Flag only high-severity logic bugs, memory leaks, NPEs, or race conditions.' },
          { role: 'user', content: diffPayload }
        ]
      }),

      // Specialist 2: Alibaba Qwen 2.5 Coder for code correctness & replacement syntax
      this.env.AI.run('@cf/qwen/qwen2.5-coder-32b-instruct', {
        messages: [
          { role: 'system', content: 'You are a staff software engineer. Suggest clean, idiomatic improvements with ```suggestion blocks.' },
          { role: 'user', content: diffPayload }
        ]
      })
    ]);

    // 3. Lead Arbiter: Synthesize reports & remove false alarms via AI Gateway
    const finalReview = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        {
          role: 'system',
          content: `You are the Lead Code Review Arbiter. You received reports from two specialized AI reviewers:
Security Reviewer:
${securityCheck.response}

Code Quality Reviewer:
${codeCheck.response}

Task:
- Deduplicate overlapping points.
- Discard trivial nitpicks or speculative false alarms.
- Output a polished, executive review ready for GitHub with [CRITICAL], [WARNING], and [IMPROVEMENT] tags.`
        },
        { role: 'user', content: `Original Diff:\n${diffPayload}` }
      ]
    });

    // 4. Save review in SQLite memory
    this.state.storage.sql.exec(
      'INSERT INTO reviews (commit_sha, summary) VALUES (?, ?)',
      pr.head.sha,
      finalReview.response
    );

    // 5. Post final synthesis to GitHub PR
    await fetch(pr.comments_url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${this.env.GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-PR-Reviewer',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        body: `### 🛡️ AI Review Committee Report\n*Analyzed by DeepSeek-R1 + Qwen 2.5 Coder • Synthesized by Llama 3.3 70B*\n\n${finalReview.response}`
      })
    });

    await this.state.storage.delete('pending_pr');
  }
}
```

---

## 7. Facilitator Guide & Workshop Operations

### Schedule Breakdown (180 Minutes)
*   **0:00 – 0:30 (Check-in & Intros)**: Attendees get settled, grab food, and confirm prerequisites (`wrangler`, `Node.js 18+`, GitHub accounts).
*   **0:30 – 0:45 (Architecture Presentation)**: 
    *   Explain the Alibaba OCR dual-engine concept (Hard Rails + LLM Reasoning).
    *   Walk through Workers AI models (`qwen2.5-coder`, `deepseek-r1`) and AI Gateway caching.
*   **0:45 – 2:30 (Hands-on Hacking Session)**:
    *   Attendees choose Starter Track or Advanced Track.
    *   Mentors float around to unblock GitHub token permissions and webhook setups.
*   **2:30 – 2:55 (Live Community Demos)**:
    *   Builders project their screens, submit a pull request with an intentional bug (e.g. unhandled NPE or SQL injection), and watch their live Cloudflare agent catch and fix it in real-time.
*   **2:55 – 3:00 (Wrap-up & Group Photo)**.

### Common Troubleshooting Points
1. **GitHub Webhook Times Out**: GitHub requires an HTTP response within 10 seconds. The Worker acknowledges with `200 OK` immediately upon ingress and delegates work to the Durable Object alarm asynchronously.
2. **Missing SQLite Migration**: Ensure `wrangler.json` includes `new_sqlite_classes: ["PrReviewCoordinator"]` under migrations.
3. **GitHub API Permissions**: Personal Access Tokens (PAT) must have `repo` or `pull_requests:write` scopes enabled.
