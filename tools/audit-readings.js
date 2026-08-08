// Kanji-reading audit — cross-checks every reading of every KANJI entry in a
// data directory against KANJIDIC (via the free, EDRDG / Creative-Commons-
// licensed kanjiapi.dev) and flags any the dictionary doesn't attest. Those are
// almost always data-entry slips — e.g. 生 was stored as "う.ま", which renders
// the non-word 生ま; the real reading is "う.む" (生む).
//
// It processes any *.json file whose entries look like kanji records ({kanji,
// readings}), so it works on kanji-drill's data/gradeN.json AND jlpt's
// data/kanji-nN.json unchanged. For WORD files ({word, ...}) use audit-words.js.
//
// Readings/okurigana are *facts* (not copyrightable). This never touches — and
// you must never copy — the example sentences or 熟語 selections from a
// commercial 漢字ドリル / らくらくノート workbook; those are copyrighted.
//
// Node built-ins only (Node 18+ for global fetch). From a repo root:
//   node tools/audit-readings.js                     # via kanjiapi.dev (needs network)
//   node tools/audit-readings.js 1                   # only files whose name contains "1"
//   node tools/audit-readings.js --data ../jlpt/data # audit another repo's data
//
// OFFLINE (recommended — no third-party API to be down): download KANJIDIC2 once
// from https://www.edrdg.org/kanjidic/kanjidic2.xml.gz, gunzip it, then:
//   node tools/audit-readings.js --kanjidic ~/kanjidic2.xml
//   node tools/audit-readings.js --kanjidic ~/kanjidic2.xml --data ../jlpt/data
//
// Network mode caches to tools/.kanjiapi-cache.json (git-ignored, resumable);
// --kanjidic mode uses the local file only and needs no cache or network.

'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '.kanjiapi-cache.json');
const API = (k) => `https://kanjiapi.dev/v1/kanji/${encodeURIComponent(k)}`;
const CONCURRENCY = 4;
const DELAY_MS = 120;

// Args: optional `--data <dir>` (default ../data), optional
// `--kanjidic <file>` (a local kanjidic2.xml — offline, no API), optional
// filename-substring filter.
function parseArgs() {
  const args = process.argv.slice(2);
  let dataDir = path.join(__dirname, '..', 'data');
  const di = args.indexOf('--data');
  if (di !== -1) {
    dataDir = path.resolve(args[di + 1] || '');
    args.splice(di, 2);
  }
  let kanjidicFile = null;
  const ki = args.indexOf('--kanjidic');
  if (ki !== -1) {
    kanjidicFile = path.resolve(args[ki + 1] || '');
    args.splice(ki, 2);
  }
  return { dataDir, filter: args[0], kanjidicFile };
}

// Parse a local KANJIDIC2 XML file into Map(kanji -> {on, kun, nanori}). The
// file is small and regularly structured, so a light regex scan avoids adding
// an XML-parser dependency (matching the repo's no-build ethos). On-readings
// come as katakana, kun with the okurigana dot — exactly what norm() expects.
// Download once from https://www.edrdg.org/kanjidic/kanjidic2.xml.gz (© EDRDG,
// CC BY-SA — see CREDITS.md), gunzip, and pass the path with --kanjidic.
function parseKanjidic(xml) {
  const map = new Map();
  for (const block of xml.split('<character>')) {
    const lit = block.match(/<literal>(.*?)<\/literal>/);
    if (!lit) continue;
    const on = [...block.matchAll(/<reading r_type="ja_on">(.*?)<\/reading>/g)].map((m) => m[1]);
    const kun = [...block.matchAll(/<reading r_type="ja_kun">(.*?)<\/reading>/g)].map((m) => m[1]);
    const nanori = [...block.matchAll(/<nanori>(.*?)<\/nanori>/g)].map((m) => m[1]);
    map.set(lit[1], { on, kun, nanori });
  }
  return map;
}

// Set when --kanjidic is used; makes lookups a local, offline map read.
let kanjidicMap = null;

// Every *.json in dataDir whose first entry is a kanji record, optionally
// narrowed by a filename substring. Shape-detection (not a name pattern) is
// what lets this run on both gradeN.json and kanji-nN.json.
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

function kataToHira(s) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
// Comparison key: katakana→hiragana (app stores on-readings in hiragana, KANJIDIC
// in katakana), drop KANJIDIC prefix/suffix hyphens, keep the okurigana dot.
function norm(reading) {
  return kataToHira(reading).replace(/-/g, '').trim();
}

let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
} catch {
  cache = {};
}
function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

async function fetchKanji(kanji) {
  if (kanjidicMap) {
    const e = kanjidicMap.get(kanji);
    return e ? { kun: e.kun, on: e.on, name: e.nanori } : { error: 'not in KANJIDIC2 file' };
  }
  if (cache[kanji] && !cache[kanji].error) return cache[kanji];
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      res = await fetch(API(kanji));
    } catch (err) {
      return { error: `network: ${err.message}` }; // transient — never cached, so re-run retries
    }
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) {
      return { error: `HTTP ${res.status}` };
    }
    const j = await res.json();
    cache[kanji] = { kun: j.kun_readings || [], on: j.on_readings || [], name: j.name_readings || [] };
    return cache[kanji]; // only successful results are cached
  }
  return { error: 'rate-limited after retries' };
}

async function main() {
  const { dataDir, filter, kanjidicFile } = parseArgs();
  if (!fs.existsSync(dataDir)) {
    console.error(`Data directory not found: ${dataDir}`);
    process.exit(1);
  }
  if (kanjidicFile) {
    if (!fs.existsSync(kanjidicFile)) {
      console.error(`KANJIDIC2 file not found: ${kanjidicFile}\nDownload it from https://www.edrdg.org/kanjidic/kanjidic2.xml.gz and gunzip it.`);
      process.exit(1);
    }
    kanjidicMap = parseKanjidic(fs.readFileSync(kanjidicFile, 'utf8'));
    console.error(`Using local KANJIDIC2 (${kanjidicMap.size} kanji) — offline, no API.`);
  }
  const files = discoverKanjiFiles(dataDir, filter);
  if (files.length === 0) {
    console.error(`No kanji-shaped *.json files found in ${dataDir}${filter ? ` matching "${filter}"` : ''}.`);
    process.exit(1);
  }

  const flags = [];
  const errors = [];
  let checked = 0;

  for (const file of files) {
    const entries = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (e) => {
          const api = await fetchKanji(e.kanji);
          checked++;
          if (api.error) {
            errors.push(`${file}\t${e.kanji}\t(lookup failed: ${api.error})`);
            return;
          }
          const attested = new Set([...api.kun, ...api.on, ...api.name].map(norm));
          for (const r of e.readings) {
            if (!attested.has(norm(r))) {
              flags.push(`${file}\t${e.kanji}\t"${r}"  not in KANJIDIC  |  kun=[${api.kun.join(' ')}] on=[${api.on.join(' ')}]`);
            }
          }
        })
      );
      process.stderr.write(`\r  checked ${checked} kanji…`);
      saveCache();
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  saveCache();
  process.stderr.write('\n');

  console.log(`\n=== Readings NOT attested by KANJIDIC (${flags.length}) — in ${path.relative(process.cwd(), dataDir)} ===`);
  console.log('Likely data-entry errors (like 生 "う.ま"). Verify each by hand against');
  console.log('the kun/on lists shown — a few may be rare readings the dictionary omits.\n');
  if (flags.length === 0) console.log('  (none — every reading is attested) 🎉');
  else flags.sort().forEach((f) => console.log('  ' + f));

  if (errors.length) {
    console.log(`\n=== Lookups that failed (${errors.length}) — re-run to retry ===`);
    errors.forEach((e) => console.log('  ' + e));
  }

  console.log('\nNote: KANJIDIC readings this data *omits* are NOT flagged — a curated');
  console.log('per-grade/level subset is expected to leave readings out, not an error.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
