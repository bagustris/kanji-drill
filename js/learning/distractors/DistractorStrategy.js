// Formal contract every distractor-scoring strategy must implement. This
// project is plain JavaScript (no build step, no TypeScript), so the
// contract is documented with JSDoc rather than a language-level interface.
//
// DistractorGenerator depends ONLY on this contract — never on a specific
// strategy's implementation — so any conforming strategy
// (WeightedDistractorStrategy today; a future ReadingSimilarityStrategy,
// SemanticSimilarityStrategy, VisualSimilarityStrategy, ...) can be swapped
// in via DistractorConfig.strategy without touching DistractorGenerator.js.
//
// @typedef {Object} DistractorStrategy
// @property {function(features: Object, config: Object): number} score
//   Computes a numeric similarity score for one candidate distractor. Higher
//   scores are preferred by DistractorGenerator.
//
//   Contract:
//   - `features` and `config` MUST be treated as immutable — the strategy
//     must never mutate them.
//   - MUST NOT access localStorage, ProgressManager, or the DOM.
//   - MUST NOT generate randomness or otherwise produce side effects.
//   - MUST be deterministic: identical `features`/`config` arguments always
//     produce the identical numeric result.
//
//   `features` (built by SimilarityFeatures.compute) has the shape:
//   { exactReadingSimilarity, firstMoraSimilarity, onyomiSimilarity,
//     kunyomiSimilarity, meaningSimilarity, gradeSimilarity, jlptSimilarity,
//     frequencySimilarity }, each a number in the 0-1 range.

const DistractorStrategy = {
  /** Returns true if `strategy` conforms to the DistractorStrategy contract. */
  isValid(strategy) {
    return !!strategy && typeof strategy.score === 'function';
  },
};
