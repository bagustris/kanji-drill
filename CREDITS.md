# Credits & data attribution

## JMdict / KANJIDIC (dictionary data)

Example words, readings, and glosses that are sourced or verified using the
tools in [`tools/`](tools/) come from the **JMdict** and **KANJIDIC** dictionary
files.

> This application uses the JMdict, KANJIDIC and related dictionary files. These
> files are the property of the [Electronic Dictionary Research and Development
> Group (EDRDG)](https://www.edrdg.org/), and are used in conformance with the
> Group's licence.

- Copyright © Electronic Dictionary Research and Development Group.
- Licence: **Creative Commons Attribution-ShareAlike 4.0 International
  (CC BY-SA 4.0)** — <https://creativecommons.org/licenses/by-sa/4.0/>
- EDRDG licence statement: <https://www.edrdg.org/edrdg/licence.html>
- JMdict/EDICT project: <https://www.edrdg.org/jmdict/edict_doc.html>
- KANJIDIC project: <https://www.edrdg.org/wiki/index.php/KANJIDIC_Project>

The tools fetch this data through the free [kanjiapi.dev](https://kanjiapi.dev/)
service, which redistributes JMdict/KANJIDIC under the same licence.

Because the data is CC BY-SA, any redistribution of it (or works derived from
it) must keep this attribution and remain under a compatible share-alike
licence. The full CC BY-SA 4.0 legal text is available at the link above; add it
here as `LICENSE-CC-BY-SA-4.0.txt` from the official source if you ship the data
in the repo.

## Kanji alive (example words)

Where JMdict-based curation hadn't reached a kanji yet, its `examples`
(the "Words that use this kanji" list on the answer reveal) were backfilled
from the [Kanji alive](https://kanjialive.com) project's language-data CSV via
[`tools/fetch-examples-kanjialive.js`](tools/fetch-examples-kanjialive.js).

- Source: <https://github.com/kanjialive/kanji-data-media>
  (`language-data/ka_data.csv`)
- Copyright © Kanji alive.
- Licence: **Creative Commons Attribution 4.0 International (CC BY 4.0)**
  — <https://creativecommons.org/licenses/by/4.0/> (attribution-only, unlike
  JMdict/KANJIDIC's share-alike above).

## What is NOT from any workbook

Kanji readings, okurigana (送り仮名), and per-grade assignments are language
facts, taken from the MEXT 学年別漢字配当表 and the dictionaries above. They are
**not** copied from any commercial くりかえし漢字ドリル / らくらくノート or other
workbook. Those books' example sentences and 熟語 selections are copyrighted and
must not be transcribed — write example content from scratch or take it from a
freely-licensed source, with attribution.
