# Data tools

Small, dependency-free Node scripts (Node 18+, built-ins only) that **verify and
enrich the drill data against a dictionary** — they never modify the app itself.
Use them to catch reading typos and to gather candidate example words.

They read *facts* (readings, okurigana, example words) from **KANJIDIC2 / JMdict**
(© EDRDG, CC BY-SA 4.0 — see [`../CREDITS.md`](../CREDITS.md)). They do **not**
touch, and you must never copy, the example sentences or 熟語 selections from a
commercial くりかえし漢字ドリル / らくらくノート workbook — those are copyrighted.

| Script | Checks / produces | Data files it reads |
| --- | --- | --- |
| `audit-readings.js` | kanji readings not attested by KANJIDIC (e.g. `生 "う.ま"` → should be `う.む`) | kanji files: `data/gradeN.json`, jlpt `data/kanji-nN.json` |
| `audit-words.js` | word readings not attested by JMdict | word files: `data/wordsN.json`, jlpt `data/compounds-nN.json` |
| `fetch-example-words.js` | `example-words-report.json` — candidate 例語 per kanji to curate | kanji files (as above) |
| `jmdict.js` | shared JMdict parser (not run directly) | — |

## Online usage

By default (no `--kanjidic` / `--jmdict` argument) these tools fetch from
[kanjiapi.dev](https://kanjiapi.dev/), caching responses in `tools/.kanjiapi-*.json`
(git-ignored, resumable). This needs network, and a third-party API can be down
(it has been) — so the offline setup below is recommended.

## The complete offline setup (recommended — nothing to be down)

Download two EDRDG source files **once** (same CC BY-SA data credited in
[`../CREDITS.md`](../CREDITS.md)), then everything runs locally forever:

```bash
# one-time downloads
curl -O https://www.edrdg.org/kanjidic/kanjidic2.xml.gz && gunzip kanjidic2.xml.gz
curl -O http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz    && gunzip JMdict_e.gz

cd ~/github/kanji-drill

# reading errors (kanji) — KANJIDIC2
node tools/audit-readings.js --kanjidic ~/kanjidic2.xml
# reading errors (words) — JMdict
node tools/audit-words.js    --jmdict   ~/JMdict_e
# example words to curate — JMdict → example-words-report.json
node tools/fetch-example-words.js --jmdict ~/JMdict_e

# a sibling repo (e.g. ../jlpt) — just add --data:
node tools/audit-readings.js      --kanjidic ~/kanjidic2.xml --data ../jlpt/data
node tools/audit-words.js         --jmdict   ~/JMdict_e       --data ../jlpt/data
node tools/fetch-example-words.js --jmdict   ~/JMdict_e       --data ../jlpt/data
```

(If a download URL 404s, the files are linked from the
[KANJIDIC](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) and
[JMdict](https://www.edrdg.org/jmdict/edict_doc.html) project pages — check there
for the latest version and update the URL.)

Approx sizes: KANJIDIC2 ~15 MB, JMdict_e ~35 MB gz / ~100 MB uncompressed.

## Handy arguments

- `--data <dir>` — audit another repo's `data/` (default: this repo's `data/`).
- `<name>` — filename-substring filter, e.g. `node tools/audit-readings.js --kanjidic ~/kanjidic2.xml 1` runs only files containing `1` (grade1.json, kanji-n1.json…).
- `fetch-example-words.js <name> <N>` — `N` = words per kanji (default 4), e.g. `… 1 6`.

## Notes

- **Memory**: `--jmdict` reads the ~100 MB XML into memory once. If Node ever
  OOMs, prefix with `node --max-old-space-size=4096 tools/…`.
- **Reviewing output**: audit flags are *candidates* — most are typos, but a few
  may be rare readings the dictionary omits, so eyeball each against the
  kun/on/JMdict list printed beside it, then fix confirmed errors in `data/*.json`.
- **Example words**: `fetch-example-words.js` writes a **review** file, not a
  direct edit. Pick the words that reinforce the reading each grade teaches, add
  them to the data as an `examples` array (`{word, reading, gloss}` — kanji-drill
  already renders them on the answer reveal), and keep the JMdict attribution.
