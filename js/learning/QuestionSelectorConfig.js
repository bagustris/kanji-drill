// Configuration for the Adaptive Learning Engine's question selection.
// Configuration only — no selection/scoring logic lives here. QuestionSelector
// and strategies must read every tunable value from this object; nothing
// should be a magic number inside their implementations.
//
// To experiment with a different algorithm, implement a new module conforming
// to QuestionSelectionStrategy (see js/learning/QuestionSelectionStrategy.js)
// and point `strategy` at it — no other file needs to change.

const QuestionSelectorConfig = {
  strategy: WeightedScoreStrategy,

  // Per-term multipliers in WeightedScoreStrategy's score formula.
  weights: {
    unseen: 100, // never-answered questions are introduced before anything else
    recentMistake: 30, // boost for a question missed on its last attempt
    errorRate: 20, // boost scales with wrong/seen ratio
    reviewDelay: 5, // boost scales with time since last seen (spaced review)
    masteryPenalty: 10, // penalty scales with correct/seen ratio (well-known questions surface less)
  },

  selection: {
    topCandidateRatio: 0.20, // fraction of ranked candidates eligible for random pick (min 1)
    recentHistorySize: 5, // in-memory queue size of recently shown questions to avoid repeating
  },

  normalization: {
    reviewDelayDays: 7, // "one review cycle" — daysSinceLastSeen is divided by this
    maxReviewDelayFactor: 4, // caps the normalized review-delay term (avoids runaway scores for long-untouched questions)
  },
};
