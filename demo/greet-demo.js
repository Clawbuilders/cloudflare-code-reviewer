// Demo file for showcasing the 7-Pillar Security Suite reviewing its own
// repository — intentionally contains a couple of issues for the pipeline
// to catch. Not part of the actual reviewer runtime (src/index.ts /
// src/starter.ts) — safe to merge or close without affecting the agent.

function greet(user) {
  // Bug: no null/undefined check before accessing user.name
  console.log("Hello, " + user.name);
}

// Harmless placeholder shaped to trip the reviewer's generic
// "secret assignment" pattern — not a real credential.
const api_key = "demoNotARealSecret12345678";

module.exports = { greet };
