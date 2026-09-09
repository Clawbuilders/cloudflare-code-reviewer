import { DurableObject } from 'cloudflare:workers';
import parseDiff from 'parse-diff';

export interface Env {
  // Kept as `any` deliberately: Workers AI's typed `Ai` binding infers a
  // different, narrower output shape per model (some resolve `.run()` to a
  // plain `string` instead of `{ response: string }`), which fights the
  // uniform `.response` access used across every model call below.
  AI: any;
  PR_COORDINATOR: DurableObjectNamespace<PrReviewCoordinator>;
  GITHUB_TOKEN?: string;
  AI_GATEWAY_NAME?: string;
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
  <title>Cloudflare Code Review Agent (7-Pillar Security Suite)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #f3f4f6; margin: 0; padding: 2rem; }
    .card { max-width: 760px; margin: 3rem auto; background: #18181b; border: 1px solid #27272a; border-radius: 1rem; padding: 2.5rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { color: #fe5e1e; font-size: 1.75rem; margin-top: 0; display: flex; align-items: center; gap: 0.5rem; }
    p { color: #a1a1aa; line-height: 1.6; font-size: 0.95rem; }
    .badge { display: inline-block; background: rgba(254, 94, 30, 0.15); color: #fe5e1e; font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 9999px; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .endpoint { background: #09090b; border: 1px solid #27272a; padding: 0.75rem 1rem; border-radius: 0.5rem; font-family: monospace; font-size: 0.9rem; color: #e4e4e7; margin: 1rem 0; word-break: break-all; }
    ul { padding-left: 1.25rem; color: #a1a1aa; font-size: 0.9rem; line-height: 1.8; }
    li strong { color: #f4f4f5; }
    .tag { font-size: 0.7rem; font-weight: 700; padding: 0.1rem 0.45rem; border-radius: 0.3rem; margin-left: 0.4rem; }
    .tag.real { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
    .tag.heuristic { background: rgba(250, 204, 21, 0.15); color: #facc15; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Live on Cloudflare Edge</div>
    <h1>🤖 Cloudflare Code Review Agent</h1>
    <p>An autonomous GitHub PR review agent built on Cloudflare Workers, Durable Objects &amp; Workers AI, inspired by <strong>Alibaba open-code-review (OCR)</strong> and guarded by a <strong>7-Pillar Security Harness Suite</strong>.</p>

    <p><strong>Webhook Ingress Endpoint:</strong></p>
    <div class="endpoint">POST ${url.origin}/webhook/github</div>

    <p><strong>The 7-Pillar Security Suite:</strong> <span class="tag real">REAL</span> pillars call a live external API with no native binary required — exactly what a V8-isolate Worker can do. <span class="tag heuristic">HEURISTIC</span> pillars are lightweight, honest re-implementations of the named project's rule *ideas* in JS, not the actual binary (Workers can't exec native code without paid Sandboxes).</p>
    <ul>
      <li><strong>1. Gitleaks-pattern Secret Scan</strong><span class="tag heuristic">HEURISTIC</span> — regex/entropy rules modeled on Gitleaks' public default ruleset. Blocks the PR on hardcoded API keys, tokens, and private keys.</li>
      <li><strong>2. OSV.dev Vulnerability Lookup</strong><span class="tag real">REAL</span> — new/changed <code>package.json</code> dependencies are queried live against <a href="https://osv.dev" style="color:#fe5e1e">osv.dev</a>'s public vulnerability database.</li>
      <li><strong>3. Hard-Rails File Filter</strong><span class="tag heuristic">HEURISTIC</span> — Alibaba-OCR-style noise reduction (lockfiles, bundles, vendor code). Not a Semgrep integration; SAST-style reasoning happens in the LLM pass below.</li>
      <li><strong>4. OPA-inspired Policy Gate</strong><span class="tag heuristic">HEURISTIC</span> — flags changes to CI/CD workflows, auth code, or infra config, and PRs over a blast-radius file-count threshold.</li>
      <li><strong>5. Mantis-style Reachability Check</strong><span class="tag real">REAL context, heuristic reasoning</span> — pulls full file content (not just the diff hunk) from the GitHub Contents API so the security model can judge whether a flaw is actually reachable.</li>
      <li><strong>6. OWASP-ASRH-style Regression Check</strong><span class="tag heuristic">HEURISTIC</span> — the Lead Arbiter is instructed to verify proposed fixes introduce no secondary vulnerabilities before posting.</li>
      <li><strong>7. OpenSSF Scorecard Supply-Chain Check</strong><span class="tag real">REAL</span> — new dependencies are looked up against <a href="https://deps.dev" style="color:#fe5e1e">deps.dev</a>'s OpenSSF Scorecard data (maintenance, code review practices) via its public API.</li>
    </ul>

    <p><strong>Multi-Model Reasoning Committee:</strong></p>
    <ul>
      <li><em>DeepSeek-R1 Distill</em> (Security & Exploit Analysis) + <em>Alibaba Qwen 2.5 Coder</em> (Clean Syntax & Fixes), synthesized by <em>Llama 3.3 70B</em> — all three proxied through Cloudflare AI Gateway for 24h caching.</li>
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
    const stub = env.PR_COORDINATOR.getByName(prKey);

    return stub.fetch(new Request('https://internal/queue-review', {
      method: 'POST',
      body: JSON.stringify(payload)
    }));
  }
};

// ── Security Harnesses ─────────────────────────────────────────────────────────

// Pillar 1: Secret & Credential Scanner (Gitleaks-pattern heuristic)
// Modeled on gitleaks' public default rule categories — this is JS regex, not
// the gitleaks binary (Workers can't exec native code without paid Sandboxes).
function scanForSecrets(diffText: string): string[] {
  const findings: string[] = [];
  const secretPatterns = [
    { name: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
    { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{32,}/g },
    { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/g },
    { name: 'Slack Token', regex: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
    { name: 'Slack Webhook URL', regex: /hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]+/g },
    { name: 'Stripe API Key', regex: /(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g },
    { name: 'Google API Key', regex: /AIza[0-9A-Za-z_-]{35}/g },
    { name: 'Twilio API Key', regex: /SK[a-f0-9]{32}/g },
    { name: 'SendGrid API Key', regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g },
    { name: 'npm Access Token', regex: /npm_[A-Za-z0-9]{36}/g },
    { name: 'Heroku API Key', regex: /[hH]eroku[a-zA-Z0-9_ .=:"'-]{0,20}\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g },
    { name: 'RSA/EC/PGP Private Key Block', regex: /-----BEGIN\s(?:RSA|EC|OPENSSH|PGP|DSA)?\s?PRIVATE KEY-----/g },
    { name: 'Generic Secret Assignment', regex: /(?:api[_-]?key|secret[_-]?key|private[_-]?key|access[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_/+=-]{16,}['"]/gi },
  ];

  for (const { name, regex } of secretPatterns) {
    if (regex.test(diffText)) {
      findings.push(name);
    }
  }
  return findings;
}

// Pillar 2: Dependency Vulnerability Auditor — REAL osv.dev API lookup
// Extracts newly added `"name": "version"` pairs out of package.json diff
// hunks and batch-queries the public OSV.dev database (no auth required).
// Scope note: only package.json is parsed (not pnpm-lock.yaml/Cargo.lock —
// those need a real lockfile parser to do honestly); and since package.json
// pins ranges (e.g. "^4.17.15"), the caret/tilde is stripped and the base
// version is queried, which can occasionally miss a vuln patched between the
// base version and what actually gets installed. Good enough for a live
// demo; not a substitute for `npm audit` / a real CI supply-chain gate.
interface DependencyUpdate { name: string; version: string; }

function extractPackageJsonDependencyUpdates(parsedFiles: parseDiff.File[]): DependencyUpdate[] {
  const updates: DependencyUpdate[] = [];
  const depLineRegex = /^[+\s]*"([^"@][^"]*)":\s*"[\^~]?([0-9][^"]*)"/;

  for (const file of parsedFiles) {
    const filename = file.to || '';
    if (!filename.endsWith('package.json')) continue;

    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;
        const match = depLineRegex.exec(change.content);
        if (match) {
          updates.push({ name: match[1], version: match[2] });
        }
      }
    }
  }
  // Bound the batch size — keeps latency and osv.dev rate limits sane for a live demo.
  return updates.slice(0, 10);
}

async function checkOsvVulnerabilities(deps: DependencyUpdate[]): Promise<string[]> {
  if (deps.length === 0) return [];

  try {
    const response = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: deps.map((dep) => ({
          version: dep.version,
          package: { name: dep.name, ecosystem: 'npm' }
        }))
      })
    });

    if (!response.ok) return [];

    const data: any = await response.json();
    const results: string[] = [];
    (data.results || []).forEach((result: any, i: number) => {
      const vulns = result.vulns || [];
      if (vulns.length > 0) {
        const ids = vulns.map((v: any) => v.id).join(', ');
        results.push(`${deps[i].name}@${deps[i].version} — ${vulns.length} known advisor${vulns.length === 1 ? 'y' : 'ies'} (${ids})`);
      }
    });
    return results;
  } catch (err) {
    console.error('OSV lookup failed (failing open):', err);
    return [];
  }
}

// Pillar 4: Blast Radius & Policy Gate (OPA-inspired heuristic)
// A real OPA integration would compile a Rego policy to WASM
// (`opa build -t wasm`) and evaluate it with @open-policy-agent/opa-wasm —
// that's a legitimate upgrade path but needs a build step this workshop
// doesn't have time for. This is a hand-rolled stand-in for that policy.
function evaluateOpaPolicy(parsedFiles: parseDiff.File[]): string[] {
  const policyViolations: string[] = [];
  const sensitivePatterns = [
    { pattern: '.github/workflows/', description: 'CI/CD Workflow modification (Pipeline poisoning risk)' },
    { pattern: 'auth/', description: 'Core authentication/authorization middleware modification' },
    { pattern: 'wrangler.json', description: 'Cloudflare binding / infrastructure config modification' },
  ];

  for (const file of parsedFiles) {
    const filename = file.to || '';
    for (const { pattern, description } of sensitivePatterns) {
      if (filename.includes(pattern)) {
        policyViolations.push(`⚠️ Policy Warning (${description}): ${filename}`);
      }
    }
  }

  // Blast radius check: > 15 files changed in one PR
  if (parsedFiles.length > 15) {
    policyViolations.push(`⚠️ Blast Radius Warning: PR modifies ${parsedFiles.length} files. Recommended to split into smaller PRs.`);
  }

  return policyViolations;
}

// Pillar 5: Mantis-style Reachability Check — REAL context via GitHub Contents API
// The point of Google Mantis is verifying a flagged defect is actually
// reachable, not just pattern-matched. A diff hunk alone can't tell you that
// (no surrounding function, no call sites) — so this fetches the *full* file
// content for a bounded number of changed files at the PR's head commit and
// hands it to the security model alongside the diff.
async function fetchFullFileContext(
  repoFullName: string,
  headSha: string,
  filePaths: string[],
  githubToken: string | undefined
): Promise<string> {
  const [owner, repo] = repoFullName.split('/');
  const headers: Record<string, string> = {
    'User-Agent': 'Cloudflare-Code-Reviewer',
    'Accept': 'application/vnd.github.raw+json',
  };
  if (githubToken) headers['Authorization'] = `token ${githubToken}`;

  const MAX_FILES = 2;
  const MAX_CHARS_PER_FILE = 4000;
  const sections: string[] = [];

  for (const path of filePaths.slice(0, MAX_FILES)) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${headSha}`,
        { headers }
      );
      if (!res.ok) continue;
      const content = await res.text();
      sections.push(`--- Full file: ${path} ---\n${content.slice(0, MAX_CHARS_PER_FILE)}`);
    } catch (err) {
      console.error(`Full-file context fetch failed for ${path} (continuing without it):`, err);
    }
  }

  return sections.join('\n\n');
}

// Pillar 7: Supply-Chain Provenance — REAL OpenSSF Scorecard via deps.dev API
// For each new dependency, resolves its source repo through deps.dev's
// GetVersion endpoint, then pulls that repo's OpenSSF Scorecard checks.
// Bounded to 2 dependencies per run to keep the two-hop lookup fast.
async function checkSupplyChainScorecard(deps: DependencyUpdate[]): Promise<string[]> {
  const findings: string[] = [];

  for (const dep of deps.slice(0, 2)) {
    try {
      const versionRes = await fetch(
        `https://api.deps.dev/v3/systems/npm/packages/${encodeURIComponent(dep.name)}/versions/${encodeURIComponent(dep.version)}`
      );
      if (!versionRes.ok) continue;
      const versionData: any = await versionRes.json();

      const projectId = versionData.relatedProjects?.[0]?.projectKey?.id;
      if (!projectId) continue;

      const projectRes = await fetch(`https://api.deps.dev/v3/projects/${encodeURIComponent(projectId)}`);
      if (!projectRes.ok) continue;
      const projectData: any = await projectRes.json();

      const checks: Array<{ name: string; score: number }> = projectData.scorecard?.checks || [];
      const lowChecks = checks.filter((c) => typeof c.score === 'number' && c.score >= 0 && c.score <= 3);
      if (lowChecks.length > 0) {
        const detail = lowChecks.map((c) => `${c.name}: ${c.score}/10`).join(', ');
        findings.push(`${dep.name}@${dep.version} — low OpenSSF Scorecard checks (${detail})`);
      }
    } catch (err) {
      console.error(`Scorecard lookup failed for ${dep.name} (failing open):`, err);
    }
  }

  return findings;
}

// ── Durable Object: State, Debounce & Multi-Model Committee ────────────────────
export class PrReviewCoordinator extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Schema setup only — block concurrency so no request is served against
    // a table that hasn't been created yet.
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          commit_sha TEXT,
          summary TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const payload: any = await request.json();
    const pr = payload.pull_request;

    // 1. Debounce rapid pushes: Reset alarm for 15 seconds
    await this.ctx.storage.setAlarm(Date.now() + 15000);
    await this.ctx.storage.put('pending_pr', pr);
    await this.ctx.storage.put('repo_full_name', payload.repository.full_name);

    return new Response(JSON.stringify({ status: 'queued', pr: pr.number, debounce_seconds: 15 }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Fired after 15 seconds of silence (no new commits pushed)
  async alarm() {
    const pr: any = await this.ctx.storage.get('pending_pr');
    const repoFullName: string | undefined = await this.ctx.storage.get('repo_full_name');
    if (!pr || !repoFullName) return;

    // Every AI Gateway option below is what actually turns on the 24h cache,
    // analytics, and fallback routing — without this 3rd argument,
    // env.AI.run() calls Workers AI directly and none of that applies.
    const gatewayOpts = this.env.AI_GATEWAY_NAME
      ? { gateway: { id: this.env.AI_GATEWAY_NAME, cacheTtl: 86400 } }
      : undefined;

    try {
      // 1. Fetch raw diff from GitHub
      const diffResponse = await fetch(pr.diff_url, {
        headers: { 'User-Agent': 'Cloudflare-Code-Reviewer' }
      });
      const diffText = await diffResponse.text();

      // ── PILLAR 1: Gitleaks-pattern Zero-Tolerance Secret Gate ───────────────
      const leakedSecrets = scanForSecrets(diffText);
      if (leakedSecrets.length > 0) {
        if (this.env.GITHUB_TOKEN) {
          await fetch(pr.comments_url, {
            method: 'POST',
            headers: {
              'Authorization': `token ${this.env.GITHUB_TOKEN}`,
              'User-Agent': 'Cloudflare-Code-Reviewer',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              body: `### 🚨 [CRITICAL SECURITY BLOCK — Gitleaks-pattern Scan]\n\nHardcoded credentials detected in PR diff: **${leakedSecrets.join(', ')}**.\n\nPlease revoke this token immediately and remove it from git history before merging.`
            })
          });
        }
        await this.ctx.storage.delete('pending_pr');
        return;
      }

      const parsedFiles = parseDiff(diffText);
      const dependencyUpdates = extractPackageJsonDependencyUpdates(parsedFiles);

      // ── PILLAR 2: OSV.dev Vulnerability Lookup (real API) ───────────────────
      const vulnerabilityFindings = await checkOsvVulnerabilities(dependencyUpdates);

      // ── PILLAR 3: Hard-Rails File Filter (Alibaba OCR noise reduction) ─────
      const reviewableFiles = parsedFiles.filter(file => {
        const path = file.to || '';
        return !path.endsWith('.lock') &&
               !path.endsWith('.yaml') &&
               !path.endsWith('.yml') &&
               !path.endsWith('.md') &&
               !path.includes('dist/') &&
               !path.includes('vendor/') &&
               !path.includes('build/');
      });

      // ── PILLAR 4: OPA-inspired Blast Radius & Scope Gate ────────────────────
      const policyAlerts = evaluateOpaPolicy(parsedFiles);

      // ── PILLAR 7: OpenSSF Scorecard Supply-Chain Check (real API) ───────────
      const scorecardFindings = await checkSupplyChainScorecard(dependencyUpdates);

      if (reviewableFiles.length === 0 && dependencyUpdates.length === 0) {
        await this.ctx.storage.delete('pending_pr');
        return;
      }

      const diffHunk = JSON.stringify(reviewableFiles.slice(0, 5));

      // ── PILLAR 5: Mantis-style Reachability Context (real GitHub content) ──
      const fullFileContext = await fetchFullFileContext(
        repoFullName,
        pr.head.sha,
        reviewableFiles.slice(0, 5).map((f) => f.to || '').filter(Boolean),
        this.env.GITHUB_TOKEN
      );

      // ── MULTI-MODEL PARALLEL EVALUATION (Promise.all) ──────────────────────
      const [securityReport, codeReport] = await Promise.all([
        // Security Specialist: DeepSeek R1 does Mantis-style reachability reasoning
        this.env.AI.run('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', {
          messages: [
            {
              role: 'system',
              content: `You are a security auditor doing Mantis-style verification: don't just pattern-match, check whether a flagged issue is actually REACHABLE given the full file context provided.
Look for:
- Null Pointer Exceptions (NPE) & undefined dereferencing
- SQL / Command injection & sanitization bypasses
- Concurrency race conditions & unclosed resource leaks
If a candidate issue is not reachable from the code shown, say so explicitly and do not report it.
If nothing is reachable and exploitable, respond with NONE.`
            },
            { role: 'user', content: `Diff hunk:\n${diffHunk}\n\n${fullFileContext ? `Full file context for reachability analysis:\n${fullFileContext}` : '(No full-file context available — reason from the diff hunk alone.)'}` }
          ]
        }, gatewayOpts),

        // Code Quality Specialist: Alibaba Qwen 2.5 Coder (Clean Syntax & Fix Generation)
        this.env.AI.run('@cf/qwen/qwen2.5-coder-32b-instruct', {
          messages: [
            {
              role: 'system',
              content: `You are a staff software engineer performing code review following Alibaba OCR rules.
For any issue found:
1. State the file and line number.
2. Explain the defect succinctly.
3. Provide the exact fix formatted as a GitHub suggestion block:
\`\`\`suggestion
<replacement code>
\`\`\``
            },
            { role: 'user', content: diffHunk }
          ]
        }, gatewayOpts)
      ]);

      // ── PILLAR 6: OWASP-ASRH-style Regression Check + Lead Arbiter Synthesis ─
      const finalSynthesis = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          {
            role: 'system',
            content: `You are the Lead Code Review Arbiter, applying an OWASP-Agent-Security-Regression-Harness-style checklist. You received reports from the 7-pillar pipeline:
- OPA-style Policy & Blast Radius: ${policyAlerts.length > 0 ? policyAlerts.join('; ') : 'Safe scope'}
- OSV.dev Vulnerability Lookup: ${vulnerabilityFindings.length > 0 ? vulnerabilityFindings.join('; ') : 'No known vulnerabilities in changed dependencies'}
- OpenSSF Scorecard Supply-Chain Check: ${scorecardFindings.length > 0 ? scorecardFindings.join('; ') : 'No low-scoring dependencies flagged'}
- Security Specialist (Mantis-style reachability): ${securityReport.response}
- Code Quality Specialist (Qwen 2.5 Coder): ${codeReport.response}

Verification Checklist:
1. Ensure proposed fixes introduce ZERO secondary regressions or permission leaks.
2. Deduplicate overlapping comments and eliminate false alarms.
3. Format output with badges: [SECURITY], [POLICY], [DEPENDENCY], [SUPPLY-CHAIN], [CODE QUALITY].`
          },
          { role: 'user', content: `Original diff:\n${diffHunk}` }
        ]
      }, gatewayOpts);

      // Save review into Durable Object SQLite storage
      this.ctx.storage.sql.exec(
        'INSERT INTO reviews (commit_sha, summary) VALUES (?, ?)',
        pr.head.sha,
        finalSynthesis.response
      );

      // Post final review back to GitHub PR
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
            body: `### 🛡️ AI Review Committee (7-Pillar Security Suite)\n*Gitleaks-pattern • OSV.dev (live) • Hard-Rails Filter • OPA-inspired Policy • Mantis-style Reachability • OWASP-ASRH-style Regression • OpenSSF Scorecard (live)*\n\n${finalSynthesis.response}`
          })
        });
      }
    } catch (err: any) {
      console.error('Error running review:', err);
    } finally {
      await this.ctx.storage.delete('pending_pr');
      await this.ctx.storage.delete('repo_full_name');
    }
  }
}
