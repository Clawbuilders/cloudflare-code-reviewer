// Demo file for testing the Jev Triage Gate's "force security" path: a real
// injection-shaped bug the security specialist should still catch even with
// the gate in place. Not part of the actual reviewer runtime — safe to
// close without affecting the agent.

function buildUserLookupQuery(db, userSuppliedId) {
  // Bug: string-concatenates untrusted input directly into a SQL query
  // instead of using a parameterized query — classic injection surface.
  const sql = "SELECT * FROM users WHERE id = " + userSuppliedId;
  return db.exec(sql);
}

module.exports = { buildUserLookupQuery };
