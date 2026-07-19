// Computes independent, normalized (0-1) similarity features between a quiz
// question and one candidate distractor. This module ONLY extracts features
// — no weighting, no ranking, no selection, no side effects. It never
// touches ProgressManager, localStorage, or the DOM, and never throws: any
// metadata a `question`/`candidate` doesn't have (grade, frequency,
// confusionCount — none of which exist in today's data/*.json, only
// `readings` and `meaning` do) simply contributes 0 to that feature, so the
// generator degrades gracefully instead of crashing.
//
// Deliberately has no on'yomi/kun'yomi/JLPT-level features: elementary and
// junior high kanji review in Japan doesn't reason in those terms, so
// scoring shouldn't either — see DistractorConfig.js.
//
// `question` and `candidate` share the same shape:
//   { text, reading, meaning, grade?, frequency?, confusionCount? }
// (`question.reading` is named `correctReading` by its caller — see
// DistractorGenerator.js — but this module only cares about the `reading`
// each side is being compared on. `confusionCount` — how many times this
// learner has actually picked `candidate.reading` wrong for this exact
// question before — is looked up from ProgressManager by DistractorGenerator
// and attached to each candidate before compute() runs, keeping this module
// itself free of any ProgressManager/localStorage access.)

const SimilarityFeatures = (() => {
  // Local, named constants instead of magic numbers — kept here rather than
  // in DistractorConfig because compute() intentionally takes no config
  // argument (see the flow in README): these bound how a *feature* is
  // normalized, not how much a strategy *weighs* it.
  const MAX_GRADE_DIFF = 5; // grades 1-9 span at most this far apart
  const MAX_FREQUENCY_DIFF = 1000; // arbitrary corpus-rank spread, once frequency data exists
  const MAX_CONFUSION_COUNT = 3; // 3+ past wrong picks of the same reading is treated as maximally confusable

  function levenshteinDistance(a, b) {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let previousRow = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 0; i < a.length; i++) {
      const currentRow = [i + 1];
      for (let j = 0; j < b.length; j++) {
        const cost = a[i] === b[j] ? 0 : 1;
        currentRow.push(Math.min(
          previousRow[j + 1] + 1, // deletion
          currentRow[j] + 1, // insertion
          previousRow[j] + cost // substitution
        ));
      }
      previousRow = currentRow;
    }
    return previousRow[b.length];
  }

  // Whole-string similarity in [0, 1], 1 meaning identical. Used for
  // exactReadingSimilarity: two readings that differ by only a character or
  // two (e.g. きょう vs きょく) score high without being a literal duplicate
  // (duplicates of the correct reading are already excluded upstream).
  function stringSimilarity(a, b) {
    if (!a || !b) return 0;
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 0;
    return 1 - levenshteinDistance(a, b) / maxLength;
  }

  // First character (mora) of a reading, Unicode-codepoint-safe.
  function firstMora(text) {
    if (!text) return undefined;
    return Array.from(text)[0];
  }

  function tokenizeMeaning(meaning) {
    if (!meaning) return [];
    return meaning.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  }

  // Jaccard similarity of two token lists: |intersection| / |union|, 0 when
  // either side is empty or missing (never divides by zero).
  function jaccardSimilarity(listA, listB) {
    if (!Array.isArray(listA) || !Array.isArray(listB) || listA.length === 0 || listB.length === 0) return 0;
    const setA = new Set(listA);
    const setB = new Set(listB);
    const intersectionSize = [...setA].filter((value) => setB.has(value)).length;
    const unionSize = new Set([...setA, ...setB]).size;
    return unionSize === 0 ? 0 : intersectionSize / unionSize;
  }

  // Closeness of two numbers in [0, 1], 1 meaning identical, fading to 0 at
  // maxDiff apart. 0 when either value is missing (unavailable metadata).
  function numericCloseness(a, b, maxDiff) {
    if (typeof a !== 'number' || typeof b !== 'number') return 0;
    const diff = Math.abs(a - b);
    return Math.max(0, 1 - diff / maxDiff);
  }

  /**
   * @param {Object} question - the target being quizzed, e.g.
   *   { text, reading, meaning, grade?, frequency? }
   * @param {Object} candidate - one candidate distractor, same shape, plus
   *   an optional `confusionCount` (times this learner has picked this
   *   candidate's reading wrong for this question before).
   * @returns {{exactReadingSimilarity: number, firstMoraSimilarity: number,
   *   confusionSimilarity: number, meaningSimilarity: number,
   *   gradeSimilarity: number, frequencySimilarity: number}}
   */
  function compute(question, candidate) {
    return {
      exactReadingSimilarity: stringSimilarity(question.reading, candidate.reading),
      firstMoraSimilarity: firstMora(question.reading) && firstMora(question.reading) === firstMora(candidate.reading) ? 1 : 0,
      confusionSimilarity: typeof candidate.confusionCount === 'number' ? Math.min(1, candidate.confusionCount / MAX_CONFUSION_COUNT) : 0,
      meaningSimilarity: jaccardSimilarity(tokenizeMeaning(question.meaning), tokenizeMeaning(candidate.meaning)),
      gradeSimilarity: numericCloseness(question.grade, candidate.grade, MAX_GRADE_DIFF),
      frequencySimilarity: numericCloseness(question.frequency, candidate.frequency, MAX_FREQUENCY_DIFF),
    };
  }

  return { compute };
})();
