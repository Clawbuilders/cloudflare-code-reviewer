// Demo file for testing the free-tier fallback triage path (Jev
// intentionally broken on the deployed Worker for this test). Benign,
// no bug, no secret. Not part of the actual reviewer runtime.

function formatGreeting(name) {
  const safeName = typeof name === 'string' && name.length > 0 ? name : 'friend';
  return `Hello, ${safeName}!`;
}

module.exports = { formatGreeting };
