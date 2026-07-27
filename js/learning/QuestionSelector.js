// Orchestrates adaptive question selection: the only file in the learning
// module that touches ProgressManager, owns randomness, or owns the
// in-memory "recently shown" queue. Ranking itself is delegated to whichever
// strategy is configured in QuestionSelectorConfig (QuestionSelector never
// depends on a specific strategy implementation, only on the
// QuestionSelectionStrategy contract).
//
// Flow: QuestionSelector.select(pool)
//         -> ProgressManager.getQuestionStats(question.id) per candidate
//         -> config.strategy.score(question, stats, config)
//         -> rank candidates
//         -> keep top config.selection.topCandidateRatio
//         -> pick one at random (recently shown questions deprioritized)
//         -> remember the pick, return it
//
// `pool` items only need an `id` property (plus whatever the caller wants to
// get back); everything else about the entry is opaque to this module.

const QuestionSelector = (() => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // In-memory only (never persisted) — resets on page reload, matching the
  // spec's "session diversity" requirement rather than long-term storage.
  let recentIds = [];

  function daysSinceLastSeen(lastSeen) {
    if (!lastSeen) return null;
    return (Date.now() - lastSeen) / MS_PER_DAY;
  }

  // Negative once the question is overdue. null when it has never been
  // scheduled (never answered, or progress saved before scheduling existed).
  function daysUntilDue(dueAt) {
    if (!dueAt) return null;
    return (dueAt - Date.now()) / MS_PER_DAY;
  }

  // Median is deliberate rather than a mean: one answer interrupted by a
  // phone call shouldn't make a kanji look permanently shaky.
  function medianLatencyMs(latencies) {
    if (!Array.isArray(latencies) || latencies.length === 0) return null;
    const sorted = [...latencies].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  // Builds the immutable stats object passed into strategy.score(). Anything
  // derived from the system clock (daysSinceLastSeen, daysUntilDue) is
  // precomputed here so strategies never need to touch Date.now(), which
  // would make them non-deterministic and untestable.
  function buildStats(id) {
    const stats = ProgressManager.getQuestionStats(id);
    return {
      ...stats,
      daysSinceLastSeen: daysSinceLastSeen(stats.lastSeen),
      daysUntilDue: daysUntilDue(stats.dueAt),
      medianLatencyMs: medianLatencyMs(stats.latencies),
    };
  }

  function rememberPick(id, historySize) {
    recentIds.push(id);
    while (recentIds.length > historySize) recentIds.shift();
  }

  function resetSession() {
    recentIds = [];
  }

  /**
   * Selects the next question from `pool` (array of objects with a stable
   * `id` property).
   *
   * @param {Array<{id: string}>} pool - candidate questions.
   * @param {Object} [options]
   * @param {Object} [options.config=QuestionSelectorConfig] - override config (mainly for tests).
   * @param {function(): number} [options.random=Math.random] - injectable RNG;
   *   pass a deterministic function (e.g. () => 0) to make selection
   *   reproducible in tests.
   * @returns {Object|null} the chosen pool item, or null if pool is empty.
   */
  function select(pool, options = {}) {
    if (!pool || pool.length === 0) return null;

    const config = options.config || QuestionSelectorConfig;
    const random = options.random || Math.random;

    if (!QuestionSelectionStrategy.isValid(config.strategy)) {
      throw new Error('QuestionSelectorConfig.strategy does not conform to QuestionSelectionStrategy');
    }

    // Session diversity: prefer candidates not shown recently, but fall back
    // to the full pool if too few candidates remain (never return nothing).
    const notRecent = pool.filter((q) => !recentIds.includes(q.id));
    const candidates = notRecent.length > 0 ? notRecent : pool;

    const scored = candidates
      .map((question) => ({ question, score: config.strategy.score(question, buildStats(question.id), config) }))
      .sort((a, b) => b.score - a.score);

    const topCount = Math.max(1, Math.round(scored.length * config.selection.topCandidateRatio));
    const topCandidates = scored.slice(0, topCount);

    const pickIndex = Math.floor(random() * topCandidates.length);
    const picked = topCandidates[Math.min(pickIndex, topCandidates.length - 1)].question;

    rememberPick(picked.id, config.selection.recentHistorySize);
    return picked;
  }

  return { select, resetSession };
})();
