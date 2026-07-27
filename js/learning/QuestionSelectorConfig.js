// Configuration for the Adaptive Learning Engine's question selection.
// Configuration only — no selection/scoring logic lives here. QuestionSelector
// and strategies must read every tunable value from this object; nothing
// should be a magic number inside their implementations.
//
// To experiment with a different algorithm, implement a new module conforming
// to QuestionSelectionStrategy (see js/learning/QuestionSelectionStrategy.js)
// and point `strategy` at it — no other file needs to change.
//
// Both bundled strategies read from the same `weights`/`normalization`
// objects, so switching `strategy` needs no other edit here. Keys used by
// only one of them are marked below.

const QuestionSelectorConfig = {
  strategy: SpacedRepetitionStrategy,

  // Per-term multipliers in the active strategy's score formula.
  weights: {
    unseen: 100, // never-answered questions are introduced before anything else
    recentMistake: 30, // boost for a question missed on its last attempt
    errorRate: 20, // boost scales with wrong/seen ratio

    // SpacedRepetitionStrategy only. `due` multiplies a dueness factor that
    // runs from minDuenessFactor to maxOverdueFactor, so at 60 a heavily
    // overdue question can reach +240 (ahead of unseen material at 100) while
    // one that isn't due yet sits at -60.
    due: 60,
    hesitancy: 15, // boost for questions answered correctly but slowly

    // WeightedScoreStrategy only.
    reviewDelay: 5, // boost scales with time since last seen
    masteryPenalty: 10, // penalty scales with correct/seen ratio
  },

  selection: {
    topCandidateRatio: 0.20, // fraction of ranked candidates eligible for random pick (min 1)
    recentHistorySize: 5, // in-memory queue size of recently shown questions to avoid repeating
  },

  normalization: {
    // SpacedRepetitionStrategy only.
    maxOverdueFactor: 4, // caps dueness for long-untouched questions
    minDuenessFactor: -1, // floors dueness for questions not yet due
    fluentAnswerMs: 1500, // at or below this, an answer counts as fully fluent (hesitancy 0)
    hesitantAnswerMs: 4000, // at or above this, fully hesitant (hesitancy 1) — mirrors ReviewSchedulerConfig.slowAnswerMs

    // WeightedScoreStrategy only.
    reviewDelayDays: 7, // "one review cycle" — daysSinceLastSeen is divided by this
    maxReviewDelayFactor: 4, // caps the normalized review-delay term
  },
};
