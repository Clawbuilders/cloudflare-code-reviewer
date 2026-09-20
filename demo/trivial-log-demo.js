// Demo file for testing the Jev Triage Gate's "skip" path: a fully benign,
// already-safe change with no security signal and nothing a reviewer would
// flag. Not part of the actual reviewer runtime — safe to close without
// affecting the agent.

function logStartupBanner(appName) {
  const safeName = typeof appName === 'string' && appName.length > 0 ? appName : 'app';
  console.log(`[${safeName}] starting up`);
}

module.exports = { logStartupBanner };
