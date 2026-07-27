// Spaced-repetition scheduling: given how a question was just answered,
// decides how many days until it should come back.
//
// Pure and deterministic, in the same spirit as the selection strategies: it
// never reads the system clock, never touches ProgressManager/localStorage,
// and never mutates its arguments. It returns an *interval*, not a due date —
// stamping `dueAt = Date.now() + interval` is the caller's job (see
// ProgressManager.recordAnswer), which is what keeps this independently
// testable.
//
// The model is SM-2 minus the per-item ease adjustment: a correct answer
// multiplies the interval, a wrong answer resets it, and a slow-but-correct
// answer multiplies it by much less. Dropping per-item ease keeps the stored
// stat shape small; latency carries the "how well do you know this" signal
// that ease would otherwise carry.

const ReviewScheduler = (() => {
  // Days until this question should be shown again.
  //
  // @param {Object} stats - the question's stats *before* this answer; only
  //   `interval` is read (missing/legacy rows are treated as un-scheduled).
  // @param {boolean} isCorrect
  // @param {number|null} latencyMs - how long the answer took, or null when
  //   it wasn't measured (treated as fluent — never punish missing data).
  // @param {Object} [config=ReviewSchedulerConfig]
  // @returns {number} interval in days (0 means "due immediately").
  function nextIntervalDays(stats, isCorrect, latencyMs, config) {
    const cfg = config || ReviewSchedulerConfig;

    if (!isCorrect) return cfg.lapseIntervalDays;

    const previous = stats && typeof stats.interval === 'number' ? stats.interval : 0;

    // First correct answer (or the first after a lapse reset it to 0) starts
    // the ladder at the graduating interval rather than multiplying zero.
    if (previous <= 0) return cfg.graduatingIntervalDays;

    const hesitant = typeof latencyMs === 'number' && latencyMs > cfg.slowAnswerMs;
    const ease = hesitant ? cfg.hesitantEaseFactor : cfg.easeFactor;

    return Math.min(cfg.maxIntervalDays, previous * ease);
  }

  return { nextIntervalDays };
})();
