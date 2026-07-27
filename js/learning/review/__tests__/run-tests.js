// Dependency-free test harness for the spaced-repetition modules, mirroring
// js/learning/distractors/__tests__/run-tests.js. No test framework is added
// to the project (it stays a build-step-free, dependency-free static site) —
// this uses only Node's built-in `vm`, `fs`, `path`, and `assert`, and never
// modifies the modules under test.
//
// It loads the files exactly the way index.html does (same order, same
// shared-global-scope semantics as classic <script> tags) by concatenating
// them into one script run in a fresh vm context, then exercises the
// resulting globals with plain assertions.
//
// Both modules under test are pure, so nothing here needs a localStorage stub
// or a fake clock: ReviewScheduler returns an interval rather than a due
// date, and SpacedRepetitionStrategy receives daysUntilDue precomputed.
//
// Run with: node js/learning/review/__tests__/run-tests.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const LEARNING = path.join(__dirname, '..', '..');
const FILES = [
  'review/ReviewSchedulerConfig.js',
  'review/ReviewScheduler.js',
  'strategies/SpacedRepetitionStrategy.js',
];

// vm.runInContext gives each top-level `const` a lexical binding, not a
// property on the context object (same as a classic <script> tag in a
// browser) — so an epilogue assigns each module to globalThis, inside the
// same script, to make them reachable from out here.
const EPILOGUE = `
globalThis.ReviewSchedulerConfig = ReviewSchedulerConfig;
globalThis.ReviewScheduler = ReviewScheduler;
globalThis.SpacedRepetitionStrategy = SpacedRepetitionStrategy;
`;

const source = FILES.map((f) => fs.readFileSync(path.join(LEARNING, f), 'utf8')).join('\n') + EPILOGUE;
const context = vm.createContext({ console });
vm.runInContext(source, context, { filename: 'review-bundle.js' });

const { ReviewScheduler, ReviewSchedulerConfig, SpacedRepetitionStrategy } = context;

// Mirrors QuestionSelectorConfig's shape closely enough to score against,
// kept local so a tuning change there doesn't silently rewrite these
// assertions' meaning.
const CONFIG = {
  weights: { unseen: 100, recentMistake: 30, errorRate: 20, due: 60, hesitancy: 15 },
  normalization: {
    maxOverdueFactor: 4,
    minDuenessFactor: -1,
    fluentAnswerMs: 1500,
    hesitantAnswerMs: 4000,
  },
};

function stats(overrides) {
  return {
    seen: 1, correct: 1, wrong: 0, lastSeen: 0, lastCorrect: true,
    interval: 1, dueAt: 0, latencies: [],
    daysSinceLastSeen: 0, daysUntilDue: 0, medianLatencyMs: null,
    ...overrides,
  };
}

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}

console.log('\nReviewScheduler');

test('a wrong answer resets the interval to due-immediately', () => {
  assert.equal(ReviewScheduler.nextIntervalDays({ interval: 40 }, false, 800), 0);
});

test('first correct answer graduates to the starting interval', () => {
  assert.equal(ReviewScheduler.nextIntervalDays({ interval: 0 }, true, 800), 1);
});

test('a fluent correct answer multiplies by the full ease factor', () => {
  assert.equal(ReviewScheduler.nextIntervalDays({ interval: 4 }, true, 800), 10);
});

test('a slow correct answer earns a much smaller bump', () => {
  const slow = ReviewScheduler.nextIntervalDays({ interval: 4 }, true, 6000);
  const fluent = ReviewScheduler.nextIntervalDays({ interval: 4 }, true, 800);
  assert.equal(slow, 4 * ReviewSchedulerConfig.hesitantEaseFactor);
  assert.ok(slow < fluent, 'hesitant interval should be shorter than fluent');
});

test('missing latency is treated as fluent, never punished', () => {
  assert.equal(
    ReviewScheduler.nextIntervalDays({ interval: 4 }, true, null),
    ReviewScheduler.nextIntervalDays({ interval: 4 }, true, 800)
  );
});

test('interval growth is capped', () => {
  const capped = ReviewScheduler.nextIntervalDays({ interval: 170, correct: 9 }, true, 500);
  assert.equal(capped, ReviewSchedulerConfig.maxIntervalDays);
});

test('legacy stats with no interval field still graduate', () => {
  assert.equal(ReviewScheduler.nextIntervalDays({}, true, 500), 1);
  assert.equal(ReviewScheduler.nextIntervalDays(undefined, true, 500), 1);
});

test('is pure — does not mutate the stats it is given', () => {
  const input = { interval: 4 };
  ReviewScheduler.nextIntervalDays(input, true, 500);
  assert.deepEqual(input, { interval: 4 });
});

console.log('\nSpacedRepetitionStrategy');

test('unseen questions score the flat introduction weight', () => {
  assert.equal(SpacedRepetitionStrategy.score({}, stats({ seen: 0 }), CONFIG), 100);
});

test('overdue outranks unseen, which outranks not-yet-due', () => {
  const overdue = SpacedRepetitionStrategy.score({}, stats({ interval: 10, daysUntilDue: -30 }), CONFIG);
  const unseen = SpacedRepetitionStrategy.score({}, stats({ seen: 0 }), CONFIG);
  const notDue = SpacedRepetitionStrategy.score({}, stats({ interval: 10, daysUntilDue: 8 }), CONFIG);
  assert.ok(overdue > unseen, `overdue ${overdue} should beat unseen ${unseen}`);
  assert.ok(unseen > notDue, `unseen ${unseen} should beat not-due ${notDue}`);
});

test('dueness is relative to the question own interval', () => {
  // Same 5 days late, but the short-interval question is far more overdue
  // in proportion to what it had earned, so it must rank higher.
  const shortInterval = SpacedRepetitionStrategy.score({}, stats({ interval: 1, daysUntilDue: -5 }), CONFIG);
  const longInterval = SpacedRepetitionStrategy.score({}, stats({ interval: 60, daysUntilDue: -5 }), CONFIG);
  assert.ok(shortInterval > longInterval);
});

test('overdue boost is capped so ancient items cannot dominate forever', () => {
  const veryLate = SpacedRepetitionStrategy.score({}, stats({ interval: 1, daysUntilDue: -9999 }), CONFIG);
  const late = SpacedRepetitionStrategy.score({}, stats({ interval: 1, daysUntilDue: -4 }), CONFIG);
  assert.equal(veryLate, late);
});

test('null daysUntilDue (pre-scheduling progress) is treated as due now', () => {
  const legacy = SpacedRepetitionStrategy.score({}, stats({ daysUntilDue: null }), CONFIG);
  const dueNow = SpacedRepetitionStrategy.score({}, stats({ daysUntilDue: 0 }), CONFIG);
  assert.equal(legacy, dueNow);
});

test('a zero interval does not divide to Infinity', () => {
  const score = SpacedRepetitionStrategy.score({}, stats({ interval: 0, daysUntilDue: -2 }), CONFIG);
  assert.ok(Number.isFinite(score), `expected finite score, got ${score}`);
});

test('slow-but-correct scores above fluent-and-correct', () => {
  const hesitant = SpacedRepetitionStrategy.score({}, stats({ medianLatencyMs: 4000 }), CONFIG);
  const fluent = SpacedRepetitionStrategy.score({}, stats({ medianLatencyMs: 900 }), CONFIG);
  assert.equal(hesitant - fluent, CONFIG.weights.hesitancy);
});

test('missing latency data adds no hesitancy boost', () => {
  const unmeasured = SpacedRepetitionStrategy.score({}, stats({ medianLatencyMs: null }), CONFIG);
  const fluent = SpacedRepetitionStrategy.score({}, stats({ medianLatencyMs: 900 }), CONFIG);
  assert.equal(unmeasured, fluent);
});

test('a question missed on its last attempt is boosted', () => {
  const missed = SpacedRepetitionStrategy.score({}, stats({ lastCorrect: false }), CONFIG);
  const known = SpacedRepetitionStrategy.score({}, stats({ lastCorrect: true }), CONFIG);
  assert.equal(missed - known, CONFIG.weights.recentMistake);
});

test('is deterministic and does not mutate its arguments', () => {
  const s = stats({ interval: 3, daysUntilDue: -1 });
  const snapshot = JSON.stringify(s);
  const a = SpacedRepetitionStrategy.score({}, s, CONFIG);
  const b = SpacedRepetitionStrategy.score({}, s, CONFIG);
  assert.equal(a, b);
  assert.equal(JSON.stringify(s), snapshot);
});

console.log(failures === 0 ? '\nAll tests passed.\n' : `\n${failures} test(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
