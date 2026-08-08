// Minimal JMdict XML reader, shared by audit-words.js and fetch-example-words.js
// for their offline (--jmdict) modes. JMdict is large but regularly structured,
// so a streaming regex scan avoids adding an XML-parser dependency (matching the
// repo's no-build ethos). Download JMdict_e.gz once from
// https://www.edrdg.org/jmdict/edict_doc.html (© EDRDG, CC BY-SA — see
// CREDITS.md), gunzip it, and pass the path with --jmdict.
//
// It yields one object per <entry>:
//   { kebs: [written forms], rebs: [readings], glosses: [English], priorities: [] }
// re_restr / stagk restrictions (which reading applies to which kanji form) are
// intentionally NOT modelled — for auditing that only risks *fewer* false flags,
// which is the safe direction.

'use strict';

const fs = require('fs');

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function allText(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(block)) !== null) out.push(decodeXml(m[1]));
  return out;
}

// Generator over entries. Uses a lazy regex over the whole string rather than
// splitting it into an array, to keep peak memory to roughly the file size.
function* iterEntries(xml) {
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    yield {
      kebs: allText(block, 'keb'),
      rebs: allText(block, 'reb'),
      glosses: allText(block, 'gloss'),
      priorities: [...allText(block, 'ke_pri'), ...allText(block, 're_pri')],
    };
  }
}

function loadXml(file) {
  return fs.readFileSync(file, 'utf8');
}

module.exports = { iterEntries, loadXml, decodeXml };
