// Demo file for showcasing the 7-Pillar Security Suite's full multi-model
// committee (no secret pattern here, so it flows past Pillar 1 into the
// OSV.dev / deps.dev / DeepSeek+Qwen+Llama pipeline). Not part of the
// actual reviewer runtime (src/index.ts / src/starter.ts) — safe to close
// without affecting the agent.

function greet(user) {
  // Bug: no null/undefined check before accessing user.name
  console.log("Hello, " + user.name);
}

module.exports = { greet };

// Trigger a fresh push to re-deliver a real pull_request webhook from the
// GitHub App installation, proving the App-token bot persona end-to-end.
