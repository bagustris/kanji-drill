// Example-word finder — for each KANJI entry in a data directory, proposes a
// few common words that use it, from JMdict. This is the "learn 小 through
// 小さい / 小学校" data, sourced from a dictionary of facts — NOT from any
// commercial 漢字ドリル / らくらくノート, whose specific sentence and 熟語 selections
// are copyrighted and must never be copied.
//
// Two data sources:
//   • OFFLINE (recommended — no third-party API to be down): a local JMdict_e
//     file via --jmdict. Download JMdict_e.gz once from
//     https://www.edrdg.org/jmdict/edict_doc.html, gunzip it.
//   • kanjiapi.dev /v1/words/{kanji} (needs network).
//
// Processes any *.json whose entries look like kanji records ({kanji, readings}),
// so it runs on kanji-drill's data/gradeN.json AND jlpt's data/kanji-nN.json.
//
// Output is a REVIEW file (example-words-report.json next to the data dir), not
// a direct edit: JMdict lists many words per kanji, and which best reinforce the
// reading a grade teaches is your editorial call. Curate, then add an `examples`
// field to the data yourself (kanji-drill already renders it).
//
// Attribution: words/readings/glosses come from JMdict (© EDRDG, CC BY-SA 4.0).
// Credit them wherever this data ships (see README credits / CREDITS.md).
//
// Node built-ins only (Node 18+). From a repo root:
//   node tools/fetch-example-words.js --jmdict ~/JMdict_e          # offline (recommended)
//   node tools/fetch-example-words.js --jmdict ~/JMdict_e 1 6      # files matching "1", 6 words each
//   node tools/fetch-example-words.js --jmdict ~/JMdict_e --data ../jlpt/data
//   node tools/fetch-example-words.js                              # via kanjiapi.dev (needs network)
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
  return { dataDir, filter: args[0], limit: Number(args[1]) || 4, jmdictFile };
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

// Dedupe by word, then rank: JMdict "priority" *1 tags (news1/ichi1/spec1 =
// common) first, then shorter words. Shared by both sources.
function rankCandidates(candidates, limit) {
  const seen = new Set();
  const uniq = [];
  for (const c of candidates) {
    if (seen.has(c.word)) continue;
    seen.add(c.word);
    uniq.push(c);
  }
  uniq.sort((a, b) => Number(b.common) - Number(a.common) || b.score - a.score || a.length - b.length);
  return uniq.slice(0, limit).map(({ word, reading, gloss, common }) => ({ word, reading, gloss, common }));
}

// --- Offline source: scan a local JMdict once, indexing only words that
// contain one of the target kanji, so memory stays bounded. ---
function buildKanjiWordIndex(xml, targetKanji) {
  const index = new Map();
  for (const e of iterEntries(xml)) {
    if (!e.kebs.length) continue;
    const reading = e.rebs[0] || '';
    const gloss = e.glosses.slice(0, 2).join(', ');
    const common = e.priorities.some((p) => /1$/.test(p));
    const score = e.priorities.length;
    for (const keb of e.kebs) {
      for (const k of new Set([...keb].filter((c) => targetKanji.has(c)))) {
        let arr = index.get(k);
        if (!arr) {
          arr = [];
          index.set(k, arr);
        }
        arr.push({ word: keb, reading, gloss, common, score, length: [...keb].length });
      }
    }
  }
  return index;
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
async function fetchWords(kanji) {
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
function flattenApiEntries(kanji, entries) {
  const out = [];
  for (const entry of entries || []) {
    const gloss = (entry.meanings?.[0]?.glosses || []).slice(0, 2).join(', ');
    for (const v of entry.variants || []) {
      if (!v.written || !v.written.includes(kanji)) continue;
      const priorities = v.priorities || [];
      out.push({ word: v.written, reading: v.pronounced || '', gloss, common: priorities.some((p) => /1$/.test(p)), score: priorities.length, length: [...v.written].length });
    }
  }
  return out;
}

async function main() {
  const { dataDir, filter, limit, jmdictFile } = parseArgs();
  if (!fs.existsSync(dataDir)) {
    console.error(`Data directory not found: ${dataDir}`);
    process.exit(1);
  }
  const files = discoverKanjiFiles(dataDir, filter);
  if (files.length === 0) {
    console.error(`No kanji-shaped *.json files found in ${dataDir}${filter ? ` matching "${filter}"` : ''}.`);
    process.exit(1);
  }
  const reportFile = path.join(dataDir, '..', 'example-words-report.json');

  // Offline: parse JMdict once, indexing only words that use our target kanji.
  let kanjiIndex = null;
  if (jmdictFile) {
    if (!fs.existsSync(jmdictFile)) {
      console.error(`JMdict file not found: ${jmdictFile}\nDownload JMdict_e.gz from https://www.edrdg.org/jmdict/edict_doc.html and gunzip it.`);
      process.exit(1);
    }
    const targetKanji = new Set();
    for (const file of files) {
      for (const e of JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'))) targetKanji.add(e.kanji);
    }
    console.error(`Parsing local JMdict for ${targetKanji.size} kanji…`);
    kanjiIndex = buildKanjiWordIndex(loadXml(jmdictFile), targetKanji);
    console.error(`Indexed example words for ${kanjiIndex.size} kanji — offline, no API.`);
  }

  const report = {};
  const errors = [];
  let done = 0;

  // Candidate example words for one kanji, from whichever source.
  async function examplesFor(kanji) {
    if (kanjiIndex) return rankCandidates(kanjiIndex.get(kanji) || [], limit);
    const r = await fetchWords(kanji);
    if (r.error) return { error: r.error };
    return rankCandidates(flattenApiEntries(kanji, r.words), limit);
  }

  for (const file of files) {
    const entries = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    report[file] = {};
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (e) => {
          done++;
          const examples = await examplesFor(e.kanji);
          if (examples && examples.error) {
            errors.push(`${file}\t${e.kanji}\t${examples.error}`);
            report[file][e.kanji] = { error: examples.error };
            return;
          }
          report[file][e.kanji] = { taughtReadings: e.readings, examples };
        })
      );
      process.stderr.write(`\r  built words for ${done} kanji…`);
      if (!kanjiIndex) saveCache();
      if (!kanjiIndex) await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  if (!kanjiIndex) saveCache();
  process.stderr.write('\n');

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${path.relative(process.cwd(), reportFile)} — review and curate before adding to data/.`);
  console.log('Each kanji lists its taught readings plus candidate example words');
  console.log('(word / reading / gloss / common?), ranked by JMdict frequency. Pick the');
  console.log('ones that reinforce the reading each grade teaches, add them as an');
  console.log('"examples" field, and attribute JMdict (see CREDITS.md).');
  if (errors.length) {
    console.log(`\n${errors.length} lookups failed — re-run to retry (cache resumes):`);
    errors.slice(0, 20).forEach((e) => console.log('  ' + e));
    if (errors.length > 20) console.log(`  … and ${errors.length - 20} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
