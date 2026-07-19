// Default QuestionSelectionStrategy (see ../QuestionSelectionStrategy.js for
// the contract). Pure and deterministic: no ProgressManager/localStorage
// access, no randomness, no mutation of its arguments. Given identical
// question/stats/config it always returns the identical score, which makes
// it independently unit-testable and safe to benchmark or swap out.

const WeightedScoreStrategy = (() => {
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // score() prioritizes, in order: unseen questions, recently missed
  // questions, high error rate, long review delay, and (negatively) high
  // mastery — see README "WeightedScoreStrategy" for the full rationale.
  function score(question, stats, config) {
    const { weights, normalization } = config;
    const seen = stats.seen || 0;

    const unseen = seen === 0 ? 1 : 0;
    const recentMistake = seen > 0 && stats.lastCorrect === false ? 1 : 0;
    const errorRate = seen > 0 ? stats.wrong / seen : 0;
    const masteryRatio = seen > 0 ? stats.correct / seen : 0;

    // Unseen questions have no lastSeen/daysSinceLastSeen to measure a delay
    // from, so they're excluded from the reviewDelay term entirely (they
    // already dominate via the `unseen` term above).
    let reviewDelay = 0;
    if (seen > 0 && typeof stats.daysSinceLastSeen === 'number') {
      reviewDelay = clamp(
        stats.daysSinceLastSeen / normalization.reviewDelayDays,
        0,
        normalization.maxReviewDelayFactor
      );
    }

    return (
      weights.unseen * unseen +
      weights.recentMistake * recentMistake +
      weights.errorRate * errorRate +
      weights.reviewDelay * reviewDelay -
      weights.masteryPenalty * masteryRatio
    );
  }

  return { score };
})();
