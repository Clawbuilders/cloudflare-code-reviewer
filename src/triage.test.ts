import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTriageState, parseEscalationFloor, readTriageAnswer, unwrapResult } from './triage.ts';

// Shapes copied from live @cf/cloudflare/clef responses (2026-10-05).
const sqli = {
  model: 'clef',
  answers: {
    needs_security_review: { type: 'noul', noul: 0.9838 },
    needs_quality_review: { type: 'noul', noul: 0.7923 },
    category: { type: 'choice', choice: 'refactor', probabilities: { feature: 0.0748, bugfix: 0.1411, refactor: 0.7278 }, confidence: 0.4676 },
    tries_to_influence_reviewer: { type: 'noul', noul: 0.0135 },
  },
  usage: { input_tokens: 648, output_tokens: 0 },
};
const bump = {
  answers: {
    needs_security_review: { type: 'noul', noul: 0.0327 },
    needs_quality_review: { type: 'noul', noul: 0.0355 },
    category: { type: 'choice', choice: 'dependency_bump', probabilities: { dependency_bump: 0.9863 } },
    tries_to_influence_reviewer: { type: 'noul', noul: 0.0064 },
  },
};

test('a risky diff needs both specialists at the default floor', () => {
  const answer = readTriageAnswer(sqli, 0.5);
  assert.equal(answer.needsSecurity, true);
  assert.equal(answer.needsQuality, true);
  assert.equal(answer.influenceNoul < 0.5, true);
});

test('a dependency bump needs neither specialist', () => {
  const answer = readTriageAnswer(bump, 0.5);
  assert.equal(answer.needsSecurity, false);
  assert.equal(answer.needsQuality, false);
  assert.equal(answer.category, 'dependency_bump');
});

test('a lower floor escalates more diffs', () => {
  assert.equal(readTriageAnswer(bump, 0.03).needsSecurity, true);
});

test('the category falls back to the most probable option when choice is missing', () => {
  const response = { answers: { ...bump.answers, category: { type: 'choice', probabilities: { feature: 0.2, docs_or_config: 0.7 } } } };
  assert.equal(readTriageAnswer(response, 0.5).category, 'docs_or_config');
});

test('an unknown category becomes "unknown" rather than an invented one', () => {
  const response = { answers: { ...bump.answers, category: { type: 'choice', choice: 'rewrite-in-rust' } } };
  assert.equal(readTriageAnswer(response, 0.5).category, 'unknown');
});

test('a wrapped envelope is unwrapped', () => {
  assert.equal(readTriageAnswer({ state: 'Completed', result: sqli }, 0.5).needsSecurity, true);
  assert.equal(unwrapResult(sqli), sqli);
});

test('missing or malformed answers throw so the caller falls back', () => {
  assert.throws(() => readTriageAnswer({}, 0.5), /no answers/);
  assert.throws(() => readTriageAnswer({ answers: { ...bump.answers, needs_security_review: { type: 'noul' } } }, 0.5), /needs_security_review/);
  assert.throws(() => readTriageAnswer({ answers: { ...bump.answers, needs_quality_review: { noul: 1.4 } } }, 0.5), /needs_quality_review/);
  assert.throws(() => readTriageAnswer({ answers: { ...bump.answers, tries_to_influence_reviewer: { noul: 'high' } } }, 0.5), /tries_to_influence/);
});

test('buildTriageState bounds the diff and drops empty file names', () => {
  const state = buildTriageState(['a.ts', '', 'b.ts'], 'x'.repeat(9000));
  assert.deepEqual(state.files_changed, ['a.ts', 'b.ts']);
  assert.equal(state.diff_hunk.length, 4000);
});

test('parseEscalationFloor prefers the new variable, then the old one, then 0.5', () => {
  assert.equal(parseEscalationFloor('0.3', '0.7'), 0.3);
  assert.equal(parseEscalationFloor(undefined, '0.7'), 0.7);
  assert.equal(parseEscalationFloor('abc', undefined), 0.5);
  assert.equal(parseEscalationFloor('0', '2'), 0.5);
});
