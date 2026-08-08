// Configuration for the Adaptive Learning Engine's distractor generation.
// Configuration only — no feature-extraction/scoring/selection logic lives
// here. DistractorGenerator and strategies must read every tunable value
// from this object; nothing should be a magic number inside their
// implementations.
//
// To experiment with a different algorithm, implement a new module
// conforming to DistractorStrategy (see js/learning/distractors/DistractorStrategy.js)
// and point `strategy` at it — no other file needs to change.
//
// Deliberately excludes onyomi/kunyomi/JLPT-level features: elementary and
// junior high kanji drilling in Japan doesn't ask a kid to reason in those
// terms, so scoring shouldn't either. What actually mirrors classroom
// review is exactReading/firstMora/meaning similarity plus each learner's
// own mistake history (see weights.confusion below).
const DistractorConfig = {
  strategy: WeightedDistractorStrategy,

  // Per-feature multipliers in WeightedDistractorStrategy's score formula.
  // `grade` and `frequency` stay dormant at a similarity of 0 until
  // matching per-item metadata is added to data/*.json — see README
  // "Adaptive Distractor Generation" for how to wire up a new field
  // without touching any other file.
  weights: {
    exactReading: 50, // whole-reading string similarity (e.g. きょう vs きょく)
    firstMora: 20, // shares the same first character/mora as the correct reading
    confusion: 40, // this learner has actually picked this reading wrong before (see ProgressManager.getConfusions)
    meaning: 10, // overlapping English gloss tokens (e.g. shared word in "meaning")
    grade: 5, // same/nearby school grade (dormant: no per-item grade data yet)
    frequency: 5, // nearby corpus frequency rank (dormant: no frequency data yet)
  },

  // Reverse mode (reading + meaning shown -> pick the kanji) needs its own
  // weights, NOT the forward `weights` above. Reversing the direction inverts
  // what a *graded* reading similarity means: forward, せい-vs-せき is hard
  // (you must know the exact reading); reverse, a candidate whose reading is
  // せき is trivially eliminable once you half-know the prompt reading せい.
  // So the only reading signal that makes a hard reverse distractor is an
  // *exact* homophone (handled as a binary match in DistractorGenerator, not
  // a Levenshtein gradient), alongside meaning overlap (a same-meaning kanji
  // is hard precisely because the meaning is on screen) and this learner's
  // own past wrong kanji picks. firstMora is a mild plausibility nudge that
  // keeps picks from looking random when true homophones are sparse (common
  // at grade 1, where readings are mostly distinct).
  reverseWeights: {
    homophone: 60, // candidate kanji shares the exact prompt reading
    meaning: 30, // overlapping English gloss tokens with the target
    confusion: 40, // this learner has picked this kanji wrong for this question before
    firstMora: 12, // candidate reading starts with the same mora as the prompt
    grade: 5, // same/nearby grade (dormant until per-item grade data exists)
  },

  selection: {
    distractorCount: 3, // number of wrong options to generate (OPTIONS_COUNT - 1 in app.js)
    // Set well above the largest real candidate pool so this never truncates
    // today's data — it's a safety valve against a future, much larger
    // dataset (e.g. corpus-occurrence pools), not a routine filter. A lower
    // value here previously caused a real bug: candidates are built in
    // itemList's fixed array order, so a low cap always scored roughly
    // the same early slice of the file regardless of the target,
    // collapsing distractor variety (grade 7 offered only ~48 distinct
    // readings across all 370 questions).
    //
    // Raised from 1000 when cumulative mode landed: a 全部 round over grades
    // 1-9 pools 2,136 kanji (~3,000 readings), which the old cap truncated —
    // reproducing exactly that collapse (30 questions offered only 24
    // distinct distractors instead of 30).
    maxCandidates: 5000,
  },
};
