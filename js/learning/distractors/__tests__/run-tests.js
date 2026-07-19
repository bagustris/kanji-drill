// Dependency-free test harness for the distractor generation module. No test
// framework is added to the project (it stays a build-step-free, dependency-
// free static site) — this uses only Node's built-in `vm`, `fs`, `path`, and
// `assert` modules, and never modifies the modules under test.
//
// It loads progress.js plus the five distractors/*.js files exactly the way
// index.html does (same order, same shared-global-scope semantics as classic
// <script> tags) by concatenating them into one script and running it in a
// fresh vm context (with an in-memory localStorage stub, since ProgressManager
// needs one), then exercises the resulting globals with plain assertions.
//
// Run with: node js/learning/distractors/__tests__/run-tests.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const PROGRESS_FILE = path.join(__dirname, '..', '..', '..', 'progress.js');
const FILES = [
  'DistractorStrategy.js',
  'features/SimilarityFeatures.js',
  'strategies/WeightedDistractorStrategy.js',
  'DistractorConfig.js',
  'DistractorGenerator.js',
];

// Minimal in-memory localStorage so the real ProgressManager (unmodified)
// can run in Node. `var` at top level becomes an actual global property in
// a vm context, same as it would in a browser.
const localStoragePrelude = `
  var __store = Object.create(null);
  var localStorage = {
    getItem: (key) => (key in __store ? __store[key] : null),
    setItem: (key, value) => { __store[key] = String(value); },
    removeItem: (key) => { delete __store[key]; },
  };
`;

// vm.runInContext gives each top-level `const` a lexical binding, not a
// property on the sandbox object (same as classic <script> tags in a real
// browser) — so an epilogue assigns each module to globalThis, inside the
// same script execution, to make them retrievable below.
const epilogue = `
  globalThis.ProgressManager = ProgressManager;
  globalThis.DistractorStrategy = DistractorStrategy;
  globalThis.SimilarityFeatures = SimilarityFeatures;
  globalThis.WeightedDistractorStrategy = WeightedDistractorStrategy;
  globalThis.DistractorConfig = DistractorConfig;
  globalThis.DistractorGenerator = DistractorGenerator;
`;
const source = localStoragePrelude
  + fs.readFileSync(PROGRESS_FILE, 'utf8')
  + FILES.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n')
  + epilogue;
const context = vm.createContext({ console });
vm.runInContext(source, context, { filename: 'distractors-bundle.js' });

const { ProgressManager, DistractorStrategy, SimilarityFeatures, WeightedDistractorStrategy, DistractorConfig, DistractorGenerator } = context;

// --- Fixtures -----------------------------------------------------------
// Shaped like data/gradeN.json entries, but deliberately varied so tests can
// steer which candidate should "win" under different weight configs.
function buildItemList() {
  return [
    { kanji: '一', readings: ['いち'], meaning: 'one' },
    { kanji: '右', readings: ['みぎ'], meaning: 'right' },
    { kanji: '雨', readings: ['あめ'], meaning: 'rain' },
    { kanji: '天', readings: ['あま'], meaning: 'heaven; sky' }, // close reading to 雨's あめ, unrelated meaning
    { kanji: '空', readings: ['そら'], meaning: 'sky; empty' }, // shares "sky" with 天, unrelated reading
    { kanji: '雲', readings: ['くも'], meaning: 'cloud' },
    { kanji: '風', readings: ['かぜ'], meaning: 'wind' },
    { kanji: '花', readings: ['はな'], meaning: 'flower' },
    { kanji: '犬', readings: ['いぬ'], meaning: 'dog' },
    { kanji: '月', readings: ['つき'], meaning: 'moon; month' },
  ];
}

function questionFor(itemList, kanji) {
  const target = itemList.find((e) => e.kanji === kanji);
  return { text: target.kanji, reading: target.readings[0], meaning: target.meaning };
}

// --- Test runner ----------------------------------------------------------
const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
  } catch (err) {
    results.push({ name, pass: false, err });
  }
}

// --- SimilarityFeatures ---------------------------------------------------

test('SimilarityFeatures: identical reading scores exactReadingSimilarity=1 and firstMoraSimilarity=1', () => {
  const features = SimilarityFeatures.compute({ reading: 'きょう', meaning: '' }, { reading: 'きょう', meaning: '' });
  assert.equal(features.exactReadingSimilarity, 1);
  assert.equal(features.firstMoraSimilarity, 1);
});

test('SimilarityFeatures: different first mora scores firstMoraSimilarity=0', () => {
  const features = SimilarityFeatures.compute({ reading: 'きょう', meaning: '' }, { reading: 'あめ', meaning: '' });
  assert.equal(features.firstMoraSimilarity, 0);
});

test('SimilarityFeatures: missing metadata (grade/frequency/confusionCount) contributes 0, never throws', () => {
  const question = { reading: 'きょう', meaning: 'capital' };
  const candidate = { reading: 'あめ', meaning: 'rain' };
  const features = SimilarityFeatures.compute(question, candidate);
  assert.equal(features.gradeSimilarity, 0);
  assert.equal(features.frequencySimilarity, 0);
  assert.equal(features.confusionSimilarity, 0);
});

test('SimilarityFeatures: overlapping meaning tokens score meaningSimilarity>0', () => {
  const features = SimilarityFeatures.compute({ reading: 'そら', meaning: 'sky; empty' }, { reading: 'あま', meaning: 'heaven; sky' });
  assert.ok(features.meaningSimilarity > 0, `expected >0, got ${features.meaningSimilarity}`);
});

test('SimilarityFeatures: unrelated meaning tokens score meaningSimilarity=0', () => {
  const features = SimilarityFeatures.compute({ reading: 'いち', meaning: 'one' }, { reading: 'いぬ', meaning: 'dog' });
  assert.equal(features.meaningSimilarity, 0);
});

test('SimilarityFeatures: confusionCount scales confusionSimilarity toward 1 and clamps there', () => {
  const question = { reading: 'いち', meaning: 'one' };
  assert.equal(SimilarityFeatures.compute(question, { reading: 'いぬ', meaning: 'dog', confusionCount: 0 }).confusionSimilarity, 0);
  const oneCount = SimilarityFeatures.compute(question, { reading: 'いぬ', meaning: 'dog', confusionCount: 1 }).confusionSimilarity;
  assert.ok(oneCount > 0 && oneCount < 1, `expected between 0 and 1, got ${oneCount}`);
  assert.equal(SimilarityFeatures.compute(question, { reading: 'いぬ', meaning: 'dog', confusionCount: 3 }).confusionSimilarity, 1);
  assert.equal(SimilarityFeatures.compute(question, { reading: 'いぬ', meaning: 'dog', confusionCount: 10 }).confusionSimilarity, 1, 'must clamp, never exceed 1');
});

// --- WeightedDistractorStrategy -------------------------------------------

test('WeightedDistractorStrategy.score: deterministic for identical inputs', () => {
  const features = { exactReadingSimilarity: 0.5, firstMoraSimilarity: 1, confusionSimilarity: 0, meaningSimilarity: 0.2, gradeSimilarity: 0, frequencySimilarity: 0 };
  const a = WeightedDistractorStrategy.score(features, DistractorConfig);
  const b = WeightedDistractorStrategy.score(features, DistractorConfig);
  assert.equal(a, b);
});

test('WeightedDistractorStrategy.score: does not mutate its arguments', () => {
  const features = Object.freeze({ exactReadingSimilarity: 0.5, firstMoraSimilarity: 1, confusionSimilarity: 0, meaningSimilarity: 0.2, gradeSimilarity: 0, frequencySimilarity: 0 });
  const config = Object.freeze({ weights: Object.freeze({ ...DistractorConfig.weights }) });
  assert.doesNotThrow(() => WeightedDistractorStrategy.score(features, config));
});

test('WeightedDistractorStrategy.score: a higher confusionSimilarity scores higher, all else equal', () => {
  const base = { exactReadingSimilarity: 0.3, firstMoraSimilarity: 0, meaningSimilarity: 0, gradeSimilarity: 0, frequencySimilarity: 0 };
  const low = WeightedDistractorStrategy.score({ ...base, confusionSimilarity: 0 }, DistractorConfig);
  const high = WeightedDistractorStrategy.score({ ...base, confusionSimilarity: 1 }, DistractorConfig);
  assert.ok(high > low);
});

// --- DistractorGenerator ---------------------------------------------------

test('DistractorGenerator.generate: distractors are unique and exclude the correct answer', () => {
  const itemList = buildItemList();
  const question = questionFor(itemList, '雨');
  const distractors = DistractorGenerator.generate(question, itemList);
  assert.equal(new Set(distractors).size, distractors.length, 'distractors must be unique');
  assert.ok(!distractors.includes(question.reading), 'distractors must exclude the correct answer');
});

test('DistractorGenerator.generate: correct answer appears exactly once among final options', () => {
  const itemList = buildItemList();
  const question = questionFor(itemList, '雨');
  const distractors = DistractorGenerator.generate(question, itemList);
  const options = [question.reading, ...distractors];
  assert.equal(options.filter((r) => r === question.reading).length, 1);
  assert.equal(new Set(options).size, options.length, 'no duplicate answer choices');
});

test('DistractorGenerator.generate: is deterministic for identical inputs', () => {
  const itemList = buildItemList();
  const question = questionFor(itemList, '雨');
  const a = DistractorGenerator.generate(question, itemList);
  const b = DistractorGenerator.generate(question, itemList);
  assert.deepEqual(a, b);
});

test('DistractorGenerator.generate: works with any conforming strategy', () => {
  const itemList = buildItemList();
  const question = questionFor(itemList, '雨');
  const meaningOnlyStrategy = { score: (features) => features.meaningSimilarity };
  const config = { ...DistractorConfig, strategy: meaningOnlyStrategy };
  const distractors = DistractorGenerator.generate(question, itemList, { config });
  assert.ok(Array.isArray(distractors));
  assert.ok(!distractors.includes(question.reading));
});

test('DistractorGenerator.generate: rejects a strategy that does not conform to DistractorStrategy', () => {
  const itemList = buildItemList();
  const question = questionFor(itemList, '雨');
  const config = { ...DistractorConfig, strategy: {} };
  assert.throws(() => DistractorGenerator.generate(question, itemList, { config }));
});

test('DistractorGenerator.generate: changing weights changes which distractor ranks first', () => {
  const itemList = buildItemList();
  const question = questionFor(itemList, '空'); // reading そら, meaning "sky; empty"

  const readingFocused = {
    ...DistractorConfig,
    weights: { exactReading: 100, firstMora: 100, confusion: 0, meaning: 0, grade: 0, frequency: 0 },
  };
  const meaningFocused = {
    ...DistractorConfig,
    weights: { exactReading: 0, firstMora: 0, confusion: 0, meaning: 100, grade: 0, frequency: 0 },
  };

  const byReading = DistractorGenerator.generate(question, itemList, { config: readingFocused });
  const byMeaning = DistractorGenerator.generate(question, itemList, { config: meaningFocused });

  // 天 (あま) is close in reading to そら's neighbors but shares no meaning
  // tokens; nothing else in the fixture is reading-close to そら, so the
  // reading-focused config's top pick should differ from the meaning-focused
  // config's top pick (which should surface 天, sharing the "sky" token).
  assert.notDeepEqual(byReading[0], byMeaning[0]);
  assert.equal(byMeaning[0], 'あま');
});

test('DistractorGenerator.generate: missing metadata on every item does not break generation', () => {
  // buildItemList() entries only carry kanji/readings/meaning, exactly like
  // today's data/*.json — no grade/frequency anywhere, and no `question.id`
  // so no ProgressManager lookup happens either.
  const itemList = buildItemList();
  const question = questionFor(itemList, '花');
  assert.doesNotThrow(() => {
    const distractors = DistractorGenerator.generate(question, itemList);
    assert.ok(distractors.length > 0);
  });
});

test('DistractorGenerator.generate: gracefully returns fewer distractors when the pool is too small (never throws)', () => {
  const itemList = [
    { kanji: '一', readings: ['いち'], meaning: 'one' },
    { kanji: '右', readings: ['いち'], meaning: 'right' }, // only other item shares the correct reading, so it's excluded
  ];
  const question = questionFor(itemList, '一');
  const distractors = DistractorGenerator.generate(question, itemList);
  assert.equal(distractors.length, 0);
});

test('DistractorGenerator.generate: a reading the learner actually confused before outranks an otherwise-stronger candidate', () => {
  ProgressManager.resetAll();
  const itemList = buildItemList();
  const target = itemList.find((e) => e.kanji === '一'); // correct reading いち
  const id = ProgressManager.getQuestionId('kanji', 1, '一');

  // 犬(いぬ) is a weak candidate by every static feature (unrelated reading,
  // unrelated meaning) — but the learner has mistakenly picked it 3 times
  // before for this exact question, so it should now outrank the
  // reading-similar-but-never-confused candidates once real confusion
  // history exists.
  ProgressManager.recordAnswer('kanji', 1, '一', false, 'いぬ');
  ProgressManager.recordAnswer('kanji', 1, '一', false, 'いぬ');
  ProgressManager.recordAnswer('kanji', 1, '一', false, 'いぬ');

  const question = { id, text: target.kanji, reading: target.readings[0], meaning: target.meaning };
  const distractors = DistractorGenerator.generate(question, itemList);
  assert.equal(distractors[0], 'いぬ', `expected the confused reading first, got ${JSON.stringify(distractors)}`);

  ProgressManager.resetAll();
});

test('DistractorGenerator.generate: with no question.id, never touches ProgressManager and still works', () => {
  ProgressManager.resetAll();
  const itemList = buildItemList();
  const question = questionFor(itemList, '一'); // no `id` field
  assert.doesNotThrow(() => DistractorGenerator.generate(question, itemList));
});

test('DistractorStrategy.isValid: rejects objects without a score function', () => {
  assert.equal(DistractorStrategy.isValid(null), false);
  assert.equal(DistractorStrategy.isValid({}), false);
  assert.equal(DistractorStrategy.isValid({ score: 'not a function' }), false);
  assert.equal(DistractorStrategy.isValid(WeightedDistractorStrategy), true);
});

// --- Report -----------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
results.forEach((r) => {
  console.log(`${r.pass ? 'PASS' : 'FAIL'} - ${r.name}`);
  if (!r.pass) console.log(`  ${r.err.message}`);
});
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
