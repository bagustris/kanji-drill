// Word-reading audit — the WORD-file counterpart to audit-readings.js. For each
// WORD entry ({word, readings|reading}) it checks the stored reading against
// JMdict and flags words whose reading the dictionary doesn't list (or that
// JMdict doesn't have at all).
//
// Two data sources:
//   • OFFLINE (recommended — no third-party API to be down): a local JMdict_e
//     file via --jmdict. Download JMdict_e.gz once from
//     https://www.edrdg.org/jmdict/edict_doc.html, gunzip it.
//   • kanjiapi.dev (needs network; reuses fetch-example-words.js's cache).
//
// Processes any *.json whose entries look like word records, so it runs on
// kanji-drill's data/wordsN.json AND jlpt's data/compounds-nN.json. For KANJI
// files ({kanji, readings}) use audit-readings.js.
//
// Readings are *facts*. This never copies example sentences or 熟語 selections
// from a commercial 漢字ドリル / らくらくノート workbook — those are copyrighted.
//
// Node built-ins only (Node 18+). From a repo root:
//   node tools/audit-words.js --jmdict ~/JMdict_e            # offline (recommended)
//   node tools/audit-words.js --jmdict ~/JMdict_e --data ../jlpt/data
//   node tools/audit-words.js                                # via kanjiapi.dev (needs network)
//   node tools/audit-words.js words                          # only files whose name contains "words"
//
// Network mode caches to tools/.kanjiapi-words-cache.json (git-ignored, resumable).

'use strict';

const fs = require('fs');
const path = require('path');
const { iterEntries, loadXml } = require('./jmdict');

const CACHE_FILE = path.join(__dirname, '.kanjiapi-words-cache.json');
const API = (k) => `https://kanjiapi.dev/v1/words/${encodeURIComponent(k)}`;
const CONCURRENCY = 4;
const DELAY_MS = 120;

function parseArgs() {
  const args = process.argv.slice(2);
  let dataDir = path.join(__dirname, '..', 'data');
  const di = args.indexOf('--data');
  if (di !== -1) {
    dataDir = path.resolve(args[di + 1] || '');
    args.splice(di, 2);
  }
  let jmdictFile = null;
  const ji = args.indexOf('--jmdict');
  if (ji !== -1) {
    jmdictFile = path.resolve(args[ji + 1] || '');
    args.splice(ji, 2);
  }
  return { dataDir, filter: args[0], jmdictFile };
}

function discoverWordFiles(dataDir, filter) {
  return fs
    .readdirSync(dataDir)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !filter || f.includes(filter))
    .filter((f) => {
      try {
        const arr = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
        return Array.isArray(arr) && arr[0] && arr[0].word && !arr[0].sentence;
      } catch {
        return false;
      }
    })
    .sort();
}

function kataToHira(s) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
function norm(reading) {
  return kataToHira(reading).replace(/-/g, '').trim();
}
function firstKanji(word) {
  const m = word.match(/[一-龯々]/);
  return m ? m[0] : null;
}
function appReadings(entry) {
  if (Array.isArray(entry.readings)) return entry.readings;
  if (entry.reading) return [entry.reading];
  return [];
}

// --- Offline source: build Map(word -> Set(reading)) from a local JMdict, but
// only for the words we actually need, so memory stays bounded. ---
function buildWordReadings(xml, targetWords) {
  const map = new Map();
  for (const e of iterEntries(xml)) {
    for (const keb of e.kebs) {
      if (!targetWords.has(keb)) continue;
      let set = map.get(keb);
      if (!set) {
        set = new Set();
        map.set(keb, set);
      }
      for (const reb of e.rebs) set.add(norm(reb));
    }
  }
  return map;
}

// --- Network source: kanjiapi.dev /v1/words/{kanji}, cached by kanji. ---
let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
} catch {
  cache = {};
}
function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
}
async function fetchWordsForKanji(kanji) {
  if (cache[kanji] && !cache[kanji].error) return cache[kanji];
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      res = await fetch(API(kanji));
    } catch (err) {
      return { error: `network: ${err.message}` };
    }
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (res.status === 404) {
      cache[kanji] = { words: [] };
      return cache[kanji];
    }
    if (!res.ok) return { error: `HTTP ${res.status}` };
    cache[kanji] = { words: await res.json() };
    return cache[kanji];
  }
  return { error: 'rate-limited after retries' };
}
function jmdictReadingsFor(word, entries) {
  const readings = new Set();
  for (const entry of entries || []) {
    for (const v of entry.variants || []) {
      if (v.written === word && v.pronounced) readings.add(norm(v.pronounced));
    }
  }
  return readings;
}

async function main() {
  const { dataDir, filter, jmdictFile } = parseArgs();
  if (!fs.existsSync(dataDir)) {
    console.error(`Data directory not found: ${dataDir}`);
    process.exit(1);
  }
  const files = discoverWordFiles(dataDir, filter);
  if (files.length === 0) {
    console.error(`No word-shaped *.json files found in ${dataDir}${filter ? ` matching "${filter}"` : ''}.`);
    process.exit(1);
  }

  // Offline: parse JMdict once, restricted to the words we're auditing.
  let wordReadings = null;
  if (jmdictFile) {
    if (!fs.existsSync(jmdictFile)) {
      console.error(`JMdict file not found: ${jmdictFile}\nDownload JMdict_e.gz from https://www.edrdg.org/jmdict/edict_doc.html and gunzip it.`);
      process.exit(1);
    }
    const targetWords = new Set();
    for (const file of files) {
      for (const e of JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'))) targetWords.add(e.word);
    }
    console.error(`Parsing local JMdict for ${targetWords.size} words…`);
    wordReadings = buildWordReadings(loadXml(jmdictFile), targetWords);
    console.error(`Matched ${wordReadings.size} words in JMdict — offline, no API.`);
  }

  const flags = [];
  const notFound = [];
  const skipped = [];
  const errors = [];
  let checked = 0;

  // Resolves the set of attested readings for one word from whichever source.
  async function dictReadingsFor(word) {
    if (wordReadings) return wordReadings.get(word) || new Set();
    const kanji = firstKanji(word);
    if (!kanji) return { skip: true };
    const r = await fetchWordsForKanji(kanji);
    if (r.error) return { error: r.error };
    return jmdictReadingsFor(word, r.words);
  }

  for (const file of files) {
    const entries = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (e) => {
          checked++;
          const res = await dictReadingsFor(e.word);
          if (res && res.skip) {
            skipped.push(`${file}\t${e.word}\t(kana-only — not lookupable by kanji)`);
            return;
          }
          if (res && res.error) {
            errors.push(`${file}\t${e.word}\t(lookup failed: ${res.error})`);
            return;
          }
          const dictReadings = res;
          if (dictReadings.size === 0) {
            notFound.push(`${file}\t${e.word}\t(not in JMdict — verify by hand)`);
            return;
          }
          for (const reading of appReadings(e)) {
            if (!dictReadings.has(norm(reading))) {
              flags.push(`${file}\t${e.word}\t"${reading}"  not a JMdict reading  |  jmdict=[${[...dictReadings].join(' ')}]`);
            }
          }
        })
      );
      process.stderr.write(`\r  checked ${checked} words…`);
      if (!wordReadings) saveCache();
      if (!wordReadings) await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  if (!wordReadings) saveCache();
  process.stderr.write('\n');

  console.log(`\n=== Word readings NOT in JMdict (${flags.length}) — in ${path.relative(process.cwd(), dataDir)} ===`);
  console.log('Likely wrong or mistyped readings. Verify each against the JMdict list shown.\n');
  if (flags.length === 0) console.log("  (none — every attested word's reading matches) 🎉");
  else flags.sort().forEach((f) => console.log('  ' + f));

  if (notFound.length) {
    console.log(`\n=== Words JMdict doesn't list (${notFound.length}) — can't auto-verify ===`);
    notFound.sort().forEach((f) => console.log('  ' + f));
  }
  if (skipped.length) {
    console.log(`\n=== Skipped (${skipped.length}) ===`);
    skipped.forEach((f) => console.log('  ' + f));
  }
  if (errors.length) {
    console.log(`\n=== Lookups that failed (${errors.length}) — re-run to retry ===`);
    errors.forEach((e) => console.log('  ' + e));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
