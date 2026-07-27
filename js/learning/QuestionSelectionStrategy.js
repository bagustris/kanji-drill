// Formal contract every question-selection strategy must implement. This
// project is plain JavaScript (no build step, no TypeScript), so the
// contract is documented with JSDoc rather than a language-level interface.
//
// QuestionSelector depends ONLY on this contract — never on a specific
// strategy's implementation — so any conforming strategy (WeightedScoreStrategy
// today; a future SM2Strategy, FSRSStrategy, LeitnerStrategy, ...) can be
// swapped in via QuestionSelectorConfig.strategy without touching
// QuestionSelector.js.
//
// @typedef {Object} QuestionSelectionStrategy
// @property {function(question: Object, stats: Object, config: Object): number} score
//   Computes a numeric ranking score for one candidate question. Higher
//   scores are preferred by QuestionSelector.
//
//   Contract:
//   - `question`, `stats`, and `config` MUST be treated as immutable — the
//     strategy must never mutate them.
//   - MUST NOT access ProgressManager or localStorage directly; all data the
//     strategy needs must arrive via the `stats` argument.
//   - MUST NOT generate randomness or otherwise produce side effects.
//   - MUST be deterministic: identical `question`/`stats`/`config` arguments
//     always produce the identical numeric result. Any input the score
//     depends on (e.g. "days since last seen") must be precomputed by the
//     caller and passed in via `stats` — never read from the system clock
//     inside the strategy.
//
//   `stats` (built by QuestionSelector from ProgressManager data) has the
//   shape: { seen, correct, wrong, lastSeen, lastCorrect, interval, dueAt,
//   latencies, daysSinceLastSeen, daysUntilDue, medianLatencyMs }.
//   The last three are derived by QuestionSelector (the first two from the
//   system clock, the third from the `latencies` samples) precisely so that
//   strategies stay clock-free and deterministic.
//   `daysSinceLastSeen` is `null` for a never-seen question; `daysUntilDue`
//   is `null` when the question has never been scheduled (never answered, or
//   progress written before scheduling existed); `medianLatencyMs` is `null`
//   when no answer latency has been recorded yet. Strategies must handle all
//   three nulls rather than assuming a number.

const QuestionSelectionStrategy = {
  /** Returns true if `strategy` conforms to the QuestionSelectionStrategy contract. */
  isValid(strategy) {
    return !!strategy && typeof strategy.score === 'function';
  },
};
