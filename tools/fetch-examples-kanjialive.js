// Backfills the `examples` field (used by kanji-drill's "Words that use this
// kanji" reveal — see js/app.js's renderExamples) for kanji entries that don't
// have one yet, using the Kanji alive project's language-data CSV.
//
// Unlike fetch-example-words.js (which ranks raw JMdict candidates by
// frequency and needs a human to pick the ones worth keeping), Kanji alive's
// example lists are already hand-curated per kanji by their team, so this
// script writes directly into data/gradeN.json instead of a review file. It
// never touches an entry that already has a non-empty `examples` array.
//
// Source: https://github.com/kanjialive/kanji-data-media (CC BY 4.0 — see
// CREDITS.md). Covers 1,235 kanji; entries for kanji outside that set are
// left untouched (still no `examples` field, same as before this script ran
// — js/app.js already renders nothing for that case).
//
// Node built-ins only (Node 18+). From a repo root:
//   node tools/fetch-examples-kanjialive.js                  # fetch CSV over network
//   node tools/fetch-examples-kanjialive.js --csv ka_data.csv  # use a local copy
//   node tools/fetch-examples-kanjialive.js 1 6               # files matching "1", 6 examples each

'use strict';

const fs = require('fs');
const path = require('path');

const CSV_URL = 'https://raw.githubusercontent.com/kanjialive/kanji-data-media/master/language-data/ka_data.csv';

function parseArgs() {
  const args = process.argv.slice(2);
  let dataDir = path.join(__dirname, '..', 'data');
  const di = args.indexOf('--data');
  if (di !== -1) {
    dataDir = path.resolve(args[di + 1] || '');
    args.splice(di, 2);
  }
  let csvFile = null;
  const ci = args.indexOf('--csv');
  if (ci !== -1) {
    csvFile = path.resolve(args[ci + 1] || '');
    args.splice(ci, 2);
  }
  return { dataDir, filter: args[0], limit: Number(args[1]) || 4, csvFile };
}

// RFC4180-ish CSV parser (handles quoted fields with embedded commas/newlines
// and "" escaped quotes) — Kanji alive's `examples` column embeds a JSON
// array, which needs exactly this.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// "一つ（ひとつ）" -> { word: "一つ", reading: "ひとつ" }. All 10,156 example
// entries in the current CSV match this shape (fullwidth parens); a
// non-matching row is skipped and counted rather than guessed at.
function splitWordReading(text) {
  const m = /^(.+)（(.+)）$/.exec(text);
  if (!m) return null;
  return { word: m[1].trim(), reading: m[2].split('/')[0].trim() };
}

// Kanji alive orders examples by its own on/kun sequence, not by the reading
// a given grade teaches — e.g. 立's first several examples are all
// on'yomi りつ compounds even though grade 1 teaches the kun readings
// た.つ/た.てる. Rank examples whose reading contains a taught reading's stem
// (the part before the okurigana dot) first, then fall back to CSV order.
function taughtStems(readings) {
  return readings.map((r) => r.split('.')[0]).filter(Boolean);
}

function rankByTaughtReading(candidates, stems) {
  return candidates
    .map((c, i) => ({ ...c, i, matches: stems.some((s) => c.reading.includes(s)) }))
    .sort((a, b) => (b.matches - a.matches) || (a.i - b.i));
}

function escapeForJs(s) {
  return JSON.stringify(s);
}

// Mirrors the hand-written formatting already in data/gradeN.json (each
// example object on one line) — plain JSON.stringify(arr, null, 2) does not
// produce this, so a round-trip through it would rewrite every untouched
// entry too and bury the real diff in whitespace churn.
function serializeEntries(entries) {
  const lines = ['['];
  entries.forEach((e, i) => {
    lines.push('  {');
    lines.push(`    "kanji": ${escapeForJs(e.kanji)},`);
    lines.push('    "readings": [');
    e.readings.forEach((r, ri) => {
      lines.push(`      ${escapeForJs(r)}${ri < e.readings.length - 1 ? ',' : ''}`);
    });
    lines.push('    ],');
    const hasExamples = Array.isArray(e.examples) && e.examples.length > 0;
    lines.push(`    "meaning": ${escapeForJs(e.meaning)}${hasExamples ? ',' : ''}`);
    if (hasExamples) {
      lines.push('    "examples": [');
      e.examples.forEach((ex, xi) => {
        const comma = xi < e.examples.length - 1 ? ',' : '';
        lines.push(`      { "word": ${escapeForJs(ex.word)}, "reading": ${escapeForJs(ex.reading)}, "gloss": ${escapeForJs(ex.gloss)} }${comma}`);
      });
      lines.push('    ]');
    }
    lines.push(`  }${i < entries.length - 1 ? ',' : ''}`);
  });
  lines.push(']');
  return lines.join('\n') + '\n';
}

function discoverKanjiFiles(dataDir, filter) {
  return fs
    .readdirSync(dataDir)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !filter || f.includes(filter))
    .filter((f) => {
      try {
        const arr = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
        return Array.isArray(arr) && arr[0] && arr[0].kanji && Array.isArray(arr[0].readings);
      } catch {
        return false;
      }
    })
    .sort();
}

async function loadCsv(csvFile) {
  if (csvFile) return fs.readFileSync(csvFile, 'utf8');
  console.error(`Fetching ${CSV_URL} …`);
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching Kanji alive CSV`);
  return res.text();
}

async function main() {
  const { dataDir, filter, limit, csvFile } = parseArgs();
  if (!fs.existsSync(dataDir)) {
    console.error(`Data directory not found: ${dataDir}`);
    process.exit(1);
  }
  const files = discoverKanjiFiles(dataDir, filter);
  if (files.length === 0) {
    console.error(`No kanji-shaped *.json files found in ${dataDir}${filter ? ` matching "${filter}"` : ''}.`);
    process.exit(1);
  }

  const csv = await loadCsv(csvFile);
  const rows = parseCSV(csv);
  const header = rows[0];
  const kanjiIdx = header.indexOf('kanji');
  const exIdx = header.indexOf('examples');
  if (kanjiIdx === -1 || exIdx === -1) throw new Error('CSV missing expected kanji/examples columns');

  const sourceMap = new Map();
  for (const r of rows.slice(1)) {
    if (r.length <= 1 || !r[kanjiIdx]) continue;
    try {
      sourceMap.set(r[kanjiIdx], JSON.parse(r[exIdx] || '[]'));
    } catch {
      // malformed examples cell for this kanji — leave it absent from the map
    }
  }
  console.error(`Loaded example words for ${sourceMap.size} kanji from Kanji alive.`);

  let alreadyHad = 0;
  let filled = 0;
  let noSourceData = 0;
  let parseFailures = 0;
  const failSamples = [];

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const entries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let changed = false;

    for (const e of entries) {
      if (Array.isArray(e.examples) && e.examples.length > 0) { alreadyHad++; continue; }
      const raw = sourceMap.get(e.kanji);
      if (!raw || raw.length === 0) { noSourceData++; continue; }

      const parsed = [];
      for (const [wordReading, gloss] of raw) {
        const split = splitWordReading(wordReading);
        if (!split) { parseFailures++; if (failSamples.length < 10) failSamples.push(`${e.kanji}\t${wordReading}`); continue; }
        parsed.push({ ...split, gloss });
      }
      if (parsed.length === 0) continue;

      const ranked = rankByTaughtReading(parsed, taughtStems(e.readings)).slice(0, limit);
      e.examples = ranked.map(({ word, reading, gloss }) => ({ word, reading, gloss }));
      filled++;
      changed = true;
    }

    if (changed) fs.writeFileSync(filePath, serializeEntries(entries));
  }

  console.log(`\nDone.`);
  console.log(`  already had examples: ${alreadyHad}`);
  console.log(`  filled from Kanji alive: ${filled}`);
  console.log(`  no Kanji alive data for this kanji: ${noSourceData}`);
  if (parseFailures) {
    console.log(`  unparsed example entries (skipped): ${parseFailures}`);
    failSamples.forEach((s) => console.log('    ' + s));
  }
  console.log(`\nRemember to keep the CC BY 4.0 attribution in CREDITS.md and bump`);
  console.log(`CACHE_VERSION in sw.js if these data files are precached.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
