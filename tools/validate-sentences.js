// Structural validator for data/sentencesN.json — enforces the invariants a
// second-sentence-per-kanji expansion must not violate. Node built-ins only.
//
// Layout assumed: for grade N with K kanji (data/gradeN.json), the sentence
// file holds the original K entries first (entry i <-> kanji i), optionally
// followed by K new entries (entry K+i <-> kanji i). Each new entry is a
// SECOND sentence for kanji i using a DIFFERENT target word than entry i.
//
// Checks (all fatal):
//   1. target is a literal substring of sentence      (highlightTarget needs it)
//   2. target contains the grade's kanji for its slot (right kanji quizzed)
//   3. readings are kana + at most one okurigana dot   (readingHTML/coreReading)
//   4. sentence text is unique within the grade        (progress keys on it)
//   5. a new entry's target differs from the original  (comprehensible-input goal)
//
// Usage: node tools/validate-sentences.js            (all grades)
//        node tools/validate-sentences.js 1          (one grade)

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const KANA = /^[぀-ゟ゠-ヿーー]+$/; // hira + kata + long marks

function readingOk(r) {
  const dot = r.indexOf('.');
  if (dot === -1) return KANA.test(r);
  if (r.indexOf('.', dot + 1) !== -1) return false; // at most one dot
  return KANA.test(r.slice(0, dot)) && KANA.test(r.slice(dot + 1));
}

// The app's splitOkurigana() strips only the target's TRAILING hiragana run,
// and coreReading() answers with the text before the dot. So the dot must sit
// exactly at that boundary: the part after it must equal the target's trailing
// hiragana, and a target ending in a kanji must carry no dot. Getting this
// wrong truncates the shown answer (e.g. 焼き芋 -> "や") or doubles the
// okurigana in the post-answer furigana.
function trailingOkurigana(target) {
  const m = target.match(/[ぁ-ゟ]+$/); // mirror app.js splitOkurigana
  return m ? m[0] : '';
}
function dotBoundaryOk(target, reading) {
  const okuri = trailingOkurigana(target);
  const dot = reading.indexOf('.');
  if (okuri === '') return dot === -1;
  return dot !== -1 && reading.slice(dot + 1) === okuri;
}

// The original block (first K entries) is NOT always in kanji-list order
// (grade 2 isn't). Assign each original entry to the grade-kanji it teaches via
// greedy matching: entries whose target holds exactly one grade-kanji claim it
// first, then multi-kanji targets take whatever remains. Returns kanji -> target.
function origTargetByKanji(kanji, originals) {
  const kset = new Set(kanji.map((k) => k.kanji));
  const map = new Map();
  const pending = [];
  originals.forEach((e) => {
    const hits = [...new Set([...e.target].filter((c) => kset.has(c)))];
    if (hits.length === 1) { if (!map.has(hits[0])) map.set(hits[0], e.target); }
    else pending.push({ e, hits });
  });
  pending.forEach(({ e, hits }) => {
    const free = hits.find((k) => !map.has(k)) || hits[0];
    if (!map.has(free)) map.set(free, e.target);
  });
  return map;
}

function validateGrade(n) {
  const kanji = JSON.parse(fs.readFileSync(path.join(DATA, `grade${n}.json`), 'utf8'));
  const sentences = JSON.parse(fs.readFileSync(path.join(DATA, `sentences${n}.json`), 'utf8'));
  const K = kanji.length;
  const errors = [];
  const origMap = origTargetByKanji(kanji, sentences.slice(0, K));

  const seen = new Map();
  const kset = new Set(kanji.map((k) => k.kanji));
  sentences.forEach((e, idx) => {
    const where = `grade${n}[${idx}] target=${e.target}`;
    if (!e.sentence.includes(e.target)) errors.push(`${where}: target not a substring of sentence`);
    if (![...e.target].some((c) => kset.has(c))) errors.push(`${where}: contains no grade-${n} kanji`);
    (e.readings || []).forEach((r) => {
      if (!readingOk(r)) errors.push(`${where}: bad reading "${r}"`);
      else if (!dotBoundaryOk(e.target, r)) errors.push(`${where}: reading "${r}" dot does not match target's trailing okurigana`);
    });
    if (seen.has(e.sentence)) errors.push(`${where}: duplicate sentence (also ${seen.get(e.sentence)})`);
    else seen.set(e.sentence, where);
    // New block is authored in kanji-list order: entry K+i is the second
    // sentence for kanji[i], so it must contain that kanji and use a new word.
    if (idx >= K) {
      const k = kanji[idx - K].kanji;
      if (!e.target.includes(k)) errors.push(`${where}: new entry must contain kanji ${k}`);
      // Must be a different word OR at least a different reading of the same
      // word (some rare kanji have only one common word — e.g. 憬 → 憧憬).
      const origEntry = sentences.slice(0, K).find((o) => o.target === origMap.get(k));
      const sameTarget = origMap.get(k) === e.target;
      const sameReading = origEntry && JSON.stringify(origEntry.readings) === JSON.stringify(e.readings);
      if (sameTarget && sameReading) errors.push(`${where}: same word and reading as original for ${k} — vary one`);
    }
  });

  return { n, K, count: sentences.length, expanded: sentences.length === 2 * K, errors };
}

const arg = process.argv[2];
const grades = arg ? [parseInt(arg, 10)] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
let bad = 0;
for (const n of grades) {
  const r = validateGrade(n);
  const status = r.errors.length ? `FAIL (${r.errors.length})` : 'ok';
  console.log(`grade${r.n}: ${r.count} entries (${r.expanded ? 'expanded 2x' : `${r.K} kanji`}) — ${status}`);
  r.errors.slice(0, 20).forEach((m) => console.log(`  - ${m}`));
  bad += r.errors.length;
}
process.exit(bad ? 1 : 0);
