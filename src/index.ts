import { DurableObject } from 'cloudflare:workers';
import parseDiff from 'parse-diff';

export interface Env {
  AI: any;
  PR_COORDINATOR: DurableObjectNamespace;
  GITHUB_TOKEN?: string;
  AI_GATEWAY_URL?: string;
}

// ── Ingress Worker ────────────────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Dashboard / Health Check
    if (request.method === 'GET') {
      return new Response(
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cloudflare Code Review Agent</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #f3f4f6; margin: 0; padding: 2rem; }
    .card { max-width: 680px; margin: 3rem auto; background: #18181b; border: 1px solid #27272a; border-radius: 1rem; padding: 2rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { color: #fe5e1e; font-size: 1.75rem; margin-top: 0; display: flex; align-items: center; gap: 0.5rem; }
    p { color: #a1a1aa; line-height: 1.6; font-size: 0.95rem; }
    .badge { display: inline-block; background: rgba(254, 94, 30, 0.15); color: #fe5e1e; font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 9999px; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .endpoint { background: #09090b; border: 1px solid #27272a; padding: 0.75rem 1rem; border-radius: 0.5rem; font-family: monospace; font-size: 0.9rem; color: #e4e4e7; margin: 1rem 0; word-break: break-all; }
    ul { padding-left: 1.25rem; color: #a1a1aa; font-size: 0.9rem; line-height: 1.8; }
    li strong { color: #f4f4f5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Live on Cloudflare Edge</div>
    <h1>🤖 Cloudflare Code Review Agent</h1>
    <p>An autonomous GitHub PR review agent built with the Cloudflare Agent Cloud, inspired by <strong>Alibaba's open-code-review (OCR)</strong> architecture.</p>
    
    <p><strong>Webhook Ingress Endpoint:</strong></p>
    <div class="endpoint">POST ${url.origin}/webhook/github</div>

    <p><strong>System Capabilities:</strong></p>
    <ul>
      <li><strong>Deterministic Pre-filtering:</strong> Discards lockfiles, build artifacts, and vendor packages.</li>
      <li><strong>Stateful Debouncing:</strong> SQLite Durable Object delays review by 15s to batch rapid git pushes.</li>
      <li><strong>Multi-Model Committee:</strong> Parallel evaluation via <em>DeepSeek-R1</em> (Security) + <em>Alibaba Qwen 2.5 Coder</em> (Clean Syntax & Diffs), synthesized by <em>Llama 3.3 70B</em>.</li>
      <li><strong>Actionable Feedback:</strong> Posts inline reviews with ready-to-merge GitHub suggestion blocks.</li>
    </ul>
  </div>
</body>
</html>`,
        { headers: { 'Content-Type': 'text/html;charset=UTF-8' } }
      );
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    // Only handle pull_request events (opened or new commits pushed)
    if (!payload.pull_request || (payload.action !== 'opened' && payload.action !== 'synchronize')) {
      return new Response('Event ignored', { status: 200 });
    }

    // Route event to a Durable Object isolated per Pull Request
    const prKey = `${payload.repository.full_name}#${payload.pull_request.number}`;
    const id = env.PR_COORDINATOR.idFromName(prKey);
    const stub = env.PR_COORDINATOR.get(id);

    return stub.fetch(new Request('https://internal/queue-review', {
      method: 'POST',
      body: JSON.stringify(payload)
    }));
  }
};

// ── Durable Object: State, Debounce & Multi-Model Committee ────────────────────
export class PrReviewCoordinator extends DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;

    // Initialize persistent SQLite table for review tracking
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

    return new Response(JSON.stringify({ status: 'queued', pr: pr.number, debounce_seconds: 15 }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Fired after 15 seconds of silence (no new commits pushed)
  async alarm() {
    const pr: any = await this.state.storage.get('pending_pr');
    if (!pr) return;

    try {
      // 1. Fetch raw diff from GitHub
      const diffResponse = await fetch(pr.diff_url, {
        headers: { 'User-Agent': 'Cloudflare-Code-Reviewer' }
      });
      const diffText = await diffResponse.text();

      // 2. Deterministic Hard Rails (Alibaba OCR Philosophy)
      // Discard lockfiles, minified bundles, assets, and vendored code
      const parsedFiles = parseDiff(diffText);
      const reviewableFiles = parsedFiles.filter(file => {
        const path = file.to || '';
        return !path.endsWith('.lock') &&
               !path.endsWith('.json') &&
               !path.endsWith('.yaml') &&
               !path.endsWith('.yml') &&
               !path.endsWith('.md') &&
               !path.includes('dist/') &&
               !path.includes('vendor/') &&
               !path.includes('build/');
      });

      if (reviewableFiles.length === 0) {
        await this.state.storage.delete('pending_pr');
        return;
      }

      const diffHunk = JSON.stringify(reviewableFiles.slice(0, 5));

      // 3. Multi-Model Parallel Evaluation (Promise.all)
      const [securityReport, codeReport] = await Promise.all([
        // Specialist 1: DeepSeek R1 for logic flaws, NPEs, race conditions, security
        this.env.AI.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', {
          messages: [
            {
              role: 'system',
              content: 'You are an adversarial security auditor using Alibaba Open-Code-Review standards. Flag only genuine security flaws, NPE hazards, race conditions, and unhandled errors. If code is clean, say NONE.'
            },
            { role: 'user', content: diffHunk }
          ]
        }),

        // Specialist 2: Alibaba Qwen 2.5 Coder for idiomatic syntax, edge cases, and replacement diffs
        this.env.AI.run('@cf/qwen/qwen2.5-coder-32b-instruct', {
          messages: [
            {
              role: 'system',
              content: `You are a staff engineer performing code review. For each issue found:
1. State the file and line number.
2. Explain the issue succinctly.
3. Provide the exact fix formatted as a GitHub suggestion block:
\`\`\`suggestion
<replacement code>
\`\`\``
            },
            { role: 'user', content: diffHunk }
          ]
        })
      ]);

      // 4. Lead Arbiter: Synthesize reports & remove false alarms
      const finalSynthesis = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          {
            role: 'system',
            content: `You are the Lead Code Review Arbiter. You have reports from two specialized AI reviewers:
--- Security Auditor ---
${securityReport.response}

--- Code Quality Reviewer ---
${codeReport.response}

Task:
- Deduplicate overlapping comments.
- Discard trivial nitpicks, speculative claims, or false alarms.
- Output a single executive review formatted in clean markdown for GitHub with [CRITICAL], [WARNING], or [SUGGESTION] tags.`
          },
          { role: 'user', content: `Original diff:\n${diffHunk}` }
        ]
      });

      // 5. Save review into Durable Object SQLite storage
      this.state.storage.sql.exec(
        'INSERT INTO reviews (commit_sha, summary) VALUES (?, ?)',
        pr.head.sha,
        finalSynthesis.response
      );

      // 6. Post review back to GitHub PR
      const githubToken = this.env.GITHUB_TOKEN;
      if (githubToken) {
        await fetch(pr.comments_url, {
          method: 'POST',
          headers: {
            'Authorization': `token ${githubToken}`,
            'User-Agent': 'Cloudflare-Code-Reviewer',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            body: `### 🛡️ AI Code Review Committee\n*Powered by Cloudflare Workers AI (DeepSeek-R1 + Alibaba Qwen 2.5 Coder + Llama 3.3 70B)*\n\n${finalSynthesis.response}`
          })
        });
      }
    } catch (err: any) {
      console.error('Error running review:', err);
    } finally {
      await this.state.storage.delete('pending_pr');
    }
  }
}
