// QuestionSelectionStrategy driven by review due dates (see
// ../QuestionSelectionStrategy.js for the contract). Pure and deterministic:
// no ProgressManager/localStorage access, no randomness, no mutation of its
// arguments, no system-clock reads — `daysUntilDue` and `medianLatencyMs` are
// precomputed by QuestionSelector and arrive via `stats`.
//
// How this differs from WeightedScoreStrategy: that one nudges questions up
// as time passes (a `reviewDelay` term normalized over a fixed 7 days, for
// every question equally). This one asks the spaced-repetition question
// instead — "is this *due*?" — where each question carries its own interval
// set by ReviewScheduler. A kanji you've answered fluently four times running
// has a ~40-day interval and stays out of the way; one you lapsed on
// yesterday is overdue immediately.
//
// The ordering the `dueness` term produces, high to low:
//   heavily overdue  >  just due  >  unseen  >  due soon  >  due far off
// Overdue items outrank new material deliberately: rescuing something you're
// about to forget is worth more than introducing another kanji on top of it.

const SpacedRepetitionStrategy = (() => {
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function score(question, stats, config) {
    const { weights, normalization } = config;
    const seen = stats.seen || 0;

    // Never-answered questions have no interval to be due against; they get a
    // flat introduction score and skip every other term.
    if (seen === 0) return weights.unseen;

    // Progress saved before scheduling existed has no dueAt, so
    // daysUntilDue is null — treat those as due now (dueness 0) rather than
    // excluding them, which lets old localStorage data migrate itself simply
    // by being answered once.
    const daysUntilDue = typeof stats.daysUntilDue === 'number' ? stats.daysUntilDue : 0;

    // Guard against a 0-day interval (a fresh lapse) dividing to Infinity.
    const interval = stats.interval > 0 ? stats.interval : 1;

    // Overdue by a full interval scores 1, by four intervals scores 4; not
    // yet due goes negative, floored so a far-future item can't outrank a
    // merely-distant one by an unbounded margin.
    const dueness = clamp(
      -daysUntilDue / interval,
      normalization.minDuenessFactor,
      normalization.maxOverdueFactor
    );

    const recentMistake = stats.lastCorrect === false ? 1 : 0;
    const errorRate = stats.wrong / seen;

    // Correct-but-slow is not the same as known. Scales 0 (fluent) to 1 (at
    // or past the hesitant threshold); 0 when latency was never recorded.
    let hesitancy = 0;
    if (typeof stats.medianLatencyMs === 'number') {
      const { fluentAnswerMs, hesitantAnswerMs } = normalization;
      hesitancy = clamp(
        (stats.medianLatencyMs - fluentAnswerMs) / (hesitantAnswerMs - fluentAnswerMs),
        0,
        1
      );
    }

    return (
      weights.due * dueness +
      weights.recentMistake * recentMistake +
      weights.errorRate * errorRate +
      weights.hesitancy * hesitancy
    );
  }

  return { score };
})();
