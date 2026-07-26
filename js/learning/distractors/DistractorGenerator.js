// Orchestrates adaptive distractor generation: the only file in this module
// that assembles the candidate pool, touches ProgressManager, and invokes a
// strategy (mirroring how QuestionSelector is the only file in the
// question-selection module that touches ProgressManager). Feature
// extraction is delegated to SimilarityFeatures, scoring to whichever
// strategy is configured in DistractorConfig (DistractorGenerator never
// depends on a specific strategy implementation, only on the
// DistractorStrategy contract).
//
// Flow: DistractorGenerator.generate(question, itemList)
//         -> build candidate pool (every other item's readings, excluding
//            the correct answer), tagging each candidate with how many
//            times this learner has actually picked that reading wrong for
//            this question before (ProgressManager.getConfusions)
//         -> SimilarityFeatures.compute(question, candidate) per candidate
//         -> config.strategy.score(features, config)
//         -> rank candidates
//         -> take the highest-scoring, skipping duplicate reading strings
//         -> return up to config.selection.distractorCount reading strings
//
// Answer-order shuffling stays the caller's responsibility (app.js), same
// as before — this module only decides *which* distractors to use.

const DistractorGenerator = (() => {
  // Kanji entries use `kanji`, word entries use `word`, sentence entries use
  // `sentence` — same shape otherwise.
  function itemText(entry) {
    return entry.kanji ?? entry.word ?? entry.sentence;
  }

  // Every reading of every other item is a candidate, tagged with its
  // source item's metadata so SimilarityFeatures can compare against it,
  // plus how many times this learner has mistakenly picked that exact
  // reading for this exact question before. Metadata fields the current
  // data/*.json files don't carry (grade, frequency) simply come through as
  // `undefined` — SimilarityFeatures treats that as "unavailable" and
  // scores it 0 rather than throwing. `confusions` is `{}` when `question.id`
  // isn't supplied (e.g. a caller/test that doesn't need history-aware
  // scoring) or when ProgressManager has no history for this question yet.
  function buildCandidatePool(question, itemList, confusions) {
    const candidates = [];
    itemList.forEach((entry) => {
      const text = itemText(entry);
      if (text === question.text) return;
      entry.readings.forEach((reading) => {
        if (reading === question.reading) return;
        candidates.push({
          text,
          reading,
          meaning: entry.meaning,
          grade: entry.grade,
          frequency: entry.frequency,
          confusionCount: confusions[reading] || 0,
        });
      });
    });
    return candidates;
  }

  // Walks candidates highest-score-first, keeping the first (best) occurrence
  // of each distinct reading string and stopping once `count` are collected —
  // this is what guarantees no duplicate readings/answer choices and that
  // the correct answer (already excluded from the pool) can't reappear.
  function selectTopDistractors(rankedCandidates, count) {
    const picked = [];
    const usedReadings = new Set();
    for (const { candidate } of rankedCandidates) {
      if (picked.length >= count) break;
      if (usedReadings.has(candidate.reading)) continue;
      usedReadings.add(candidate.reading);
      picked.push(candidate.reading);
    }
    return picked;
  }

  /**
   * Generates plausible multiple-choice distractors for one question.
   *
   * @param {{text: string, reading: string, meaning: string, grade?: number,
   *   frequency?: number, id?: string}} question - the target being quizzed;
   *   `reading` is the correct answer. `id` (ProgressManager's stable
   *   question ID, e.g. from `ProgressManager.getQuestionId(mode, grade,
   *   text)`) is optional — when present, past mistakes on this exact
   *   question boost matching candidates via `confusionSimilarity`.
   * @param {Array<Object>} itemList - the full grade/mode item pool (kanji or
   *   word entries) to draw candidate distractors from.
   * @param {Object} [options]
   * @param {Object} [options.config=DistractorConfig] - override config (mainly for tests).
   * @returns {string[]} up to config.selection.distractorCount unique reading
   *   strings, never including the correct answer or a duplicate of each other.
   */
  function generate(question, itemList, options = {}) {
    const config = options.config || DistractorConfig;

    if (!DistractorStrategy.isValid(config.strategy)) {
      throw new Error('DistractorConfig.strategy does not conform to DistractorStrategy');
    }

    const confusions = question.id ? ProgressManager.getConfusions(question.id) : {};
    const pool = buildCandidatePool(question, itemList, confusions).slice(0, config.selection.maxCandidates);

    const ranked = pool
      .map((candidate) => ({
        candidate,
        score: config.strategy.score(SimilarityFeatures.compute(question, candidate), config),
      }))
      .sort((a, b) => b.score - a.score);

    return selectTopDistractors(ranked, config.selection.distractorCount);
  }

  return { generate };
})();
