## Online usage  
By default, no argument these tools will use kanjiapi.dev. For offline usage, follow the instructions below.

### The complete offline setup

Download two files from EDRDG once (same CC BY-SA data already credited in
CREDITS.md), then everything is local forever:

```bash
# one-time downloads
curl -O https://www.edrdg.org/kanjidic/kanjidic2.xml.gz && gunzip
kanjidic2.xml.gz
curl -O http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz     && gunzip JMdict_e.gz
cd ~/github/kanji-drill
# reading errors (kanji) — KANJIDIC2
node tools/audit-readings.js --kanjidic ~/kanjidic2.xml
# reading errors (words) — JMdict
node tools/audit-words.js    --jmdict   ~/JMdict_e
# example words to curate — JMdict → example-words-report.json
node tools/fetch-example-words.js --jmdict ~/JMdict_e
# jlpt too — just add --data:
node tools/audit-readings.js --kanjidic ~/kanjidic2.xml --data ../jlpt/data  
node tools/audit-words.js    --jmdict   ~/JMdict_e      --data ../jlpt/data  
node tools/fetch-example-words.js --jmdict ~/JMdict_e   --data ../jlpt/data  
```

(If a download URL 404s, check the EDRDG site for the latest version of the file, and update the URL accordingly.)
