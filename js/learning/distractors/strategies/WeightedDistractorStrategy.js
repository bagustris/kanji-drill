// Default DistractorStrategy (see ../DistractorStrategy.js for the
// contract). Completely pure: no localStorage/ProgressManager/DOM access,
// no randomness, no mutation of its arguments. Given identical
// features/config it always returns the identical score, which makes it
// independently unit-testable and safe to swap out.

const WeightedDistractorStrategy = (() => {
  // score() is a plain weighted sum of the 0-1 similarity features computed
  // by SimilarityFeatures — no hard-coded priorities, only the weights in
  // config.weights (see DistractorConfig.js for what each one means).
  function score(features, config) {
    const { weights } = config;
    return (
      weights.exactReading * features.exactReadingSimilarity +
      weights.firstMora * features.firstMoraSimilarity +
      weights.confusion * features.confusionSimilarity +
      weights.meaning * features.meaningSimilarity +
      weights.grade * features.gradeSimilarity +
      weights.frequency * features.frequencySimilarity
    );
  }

  return { score };
})();
