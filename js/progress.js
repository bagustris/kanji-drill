// Persistent learning progress, saved as a single localStorage entry so it
// survives reloads, browser restarts, and GitHub Pages redeploys (data lives
// in the browser, not the deployment).
// Shape: { version, lastUpdated, grades: { [gradeKey]: {answered, correct} },
//          questions: { [questionId]: {seen, correct, wrong, lastSeen, lastCorrect,
//                                      confusions, interval, dueAt, latencies} },
//          history: [isCorrect, ...] } (most recent last, capped length)

const ProgressManager = (() => {
  const STORAGE_KEY = 'kanji-drill-progress';
  const VERSION = 1;
  const HISTORY_LIMIT = 30;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // Answer-latency samples kept per question, newest last. A short window
  // rather than a running average, so improving fluency shows up quickly
  // instead of being anchored by how slow you were a month ago.
  const LATENCY_SAMPLE_LIMIT = 5;

  // Latencies above this are discarded rather than clamped: past ~30s the
  // learner almost certainly walked away or switched tabs, and that isn't a
  // measurement of anything. Clamping would silently record a fake 30s
  // "answer"; dropping keeps the median honest.
  const MAX_LATENCY_MS = 30000;
  // Reverse mode drills the same kanji as `kanji` mode but is a distinct
  // skill (recall the kanji from its reading, vs. recall the reading from the
  // kanji), so it gets its own namespace here — otherwise gradeKey() would
  // fall back to 'grade' and merge the two modes' schedules and grade totals
  // into one corrupted record. This is the progress-key namespace, separate
  // from app.js's MODE_FILE (which maps reverse -> the 'kanji' data, same
  // file as kanji mode).
  const MODE_PREFIX = { kanji: 'grade', word: 'words', sentence: 'sentences', reverse: 'reverse' };

  // Reuses the existing per-mode/grade key naming (kanjidrill:gradeN /
  // kanjidrill:wordsN / kanjidrill:sentencesN) as the namespace for a
  // question's stable ID, so we don't invent a new identifier scheme — the
  // kanji/word/sentence text itself (see itemText() in app.js) is still the
  // identifying key.
  function gradeKey(mode, grade) {
    return `${MODE_PREFIX[mode] || 'grade'}${grade}`;
  }

  function questionId(mode, grade, text) {
    return `${gradeKey(mode, grade)}:${text}`;
  }

  function emptyProgress() {
    return { version: VERSION, lastUpdated: null, grades: {}, questions: {}, history: [] };
  }

  // Defensive shaping: older stored blobs may predate any of these keys, so
  // every one is defaulted rather than assumed. Keep this pattern when
  // extending the shape — there's no migration step, old data must just load.
  function normalize(parsed) {
    return {
      version: parsed.version || VERSION,
      lastUpdated: parsed.lastUpdated || null,
      grades: parsed.grades || {},
      questions: parsed.questions || {},
      history: parsed.history || [],
    };
  }

  // Always parses fresh and returns a mutable object safe to modify — used by
  // the write paths (recordAnswer/reset) and exported for the same purpose.
  // Read-only callers should use readSnapshot() instead.
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyProgress();
      return normalize(JSON.parse(raw));
    } catch {
      return emptyProgress();
    }
  }

  let cachedRaw = null;
  let cachedSnapshot = null;

  // Read-only view of stored progress, memoized against the raw string it was
  // parsed from.
  //
  // Why this exists: every getter below used to re-parse the entire blob, and
  // QuestionSelector asks for stats once per candidate per question. That's
  // fine for a 200-kanji grade, but a cumulative round over grades 1-9 (2,136
  // candidates × 10 questions against a ~250KB blob) took ~34 seconds — the
  // parsing, not the scoring, was the whole cost.
  //
  // Invalidation is by string comparison rather than a manual dirty flag, so a
  // write from this tab *or another one* is picked up automatically; getItem
  // is cheap next to JSON.parse.
  //
  // The returned object is SHARED and must never be mutated. Every getter
  // below hands back a copy (`{...stat}`, `.slice()`, or a derived number).
  function readSnapshot() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return emptyProgress();
      if (raw !== cachedRaw) {
        cachedSnapshot = normalize(JSON.parse(raw));
        cachedRaw = raw;
      }
      return cachedSnapshot;
    } catch {
      return emptyProgress();
    }
  }

  function save(progress) {
    try {
      progress.lastUpdated = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // localStorage unavailable (private mode, quota, etc.) — fail silently
    }
  }

  // `selectedReading` is the wrong answer the learner actually clicked
  // (omitted/ignored when isCorrect is true). Recorded per-question as
  // `confusions: { [reading]: timesPicked }` so DistractorGenerator can
  // prioritize resurfacing the specific wrong answers a learner keeps
  // falling for — see js/learning/distractors/DistractorGenerator.js.
  // `latencyMs` is how long the learner took to answer (null when not
  // measured). It feeds two things: the stored `latencies` window, and
  // ReviewScheduler's decision about how much to grow the interval — a
  // correct-but-slow answer is treated as weaker evidence than a fluent one.
  function recordAnswer(mode, grade, text, isCorrect, selectedReading, latencyMs) {
    const progress = load();

    const qId = questionId(mode, grade, text);
    const qStat = progress.questions[qId] || { seen: 0, correct: 0, wrong: 0, lastSeen: null, lastCorrect: null, confusions: {} };

    // Read before the counters below are mutated: the scheduler needs the
    // interval as it stood *going into* this answer.
    const previousInterval = typeof qStat.interval === 'number' ? qStat.interval : 0;

    qStat.seen += 1;
    if (isCorrect) {
      qStat.correct += 1;
    } else {
      qStat.wrong += 1;
      if (selectedReading) {
        qStat.confusions = qStat.confusions || {};
        qStat.confusions[selectedReading] = (qStat.confusions[selectedReading] || 0) + 1;
      }
    }
    qStat.lastSeen = Date.now();
    qStat.lastCorrect = isCorrect;

    const validLatency = typeof latencyMs === 'number' && latencyMs > 0 && latencyMs <= MAX_LATENCY_MS
      ? Math.round(latencyMs)
      : null;
    if (validLatency !== null) {
      qStat.latencies = Array.isArray(qStat.latencies) ? qStat.latencies : [];
      qStat.latencies.push(validLatency);
      while (qStat.latencies.length > LATENCY_SAMPLE_LIMIT) qStat.latencies.shift();
    }

    // Guarded because the standalone test harnesses load progress.js without
    // the learning modules; without a scheduler the app still works, it just
    // stops spacing reviews (every answered question stays due immediately,
    // which is the pre-scheduling behavior).
    if (typeof ReviewScheduler !== 'undefined') {
      const interval = ReviewScheduler.nextIntervalDays(
        { interval: previousInterval },
        isCorrect,
        validLatency
      );
      qStat.interval = interval;
      qStat.dueAt = qStat.lastSeen + interval * MS_PER_DAY;
    }

    progress.questions[qId] = qStat;

    const gKey = gradeKey(mode, grade);
    const gStat = progress.grades[gKey] || { answered: 0, correct: 0 };
    gStat.answered += 1;
    if (isCorrect) gStat.correct += 1;
    progress.grades[gKey] = gStat;

    progress.history.push(isCorrect);
    if (progress.history.length > HISTORY_LIMIT) progress.history.shift();

    save(progress);
    return qStat;
  }

  function reset(mode, grade) {
    const progress = load();
    const gKey = gradeKey(mode, grade);
    delete progress.grades[gKey];
    const prefix = `${gKey}:`;
    Object.keys(progress.questions).forEach((id) => {
      if (id.startsWith(prefix)) delete progress.questions[id];
    });
    save(progress);
  }

  function resetAll() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable — nothing to clear
    }
  }

  // 'new' -> never seen, 'learning' -> shaky, 'familiar' -> decent, 'mastered' -> solid
  function mastery(stat) {
    if (!stat || stat.seen === 0) return 'new';
    const accuracy = stat.correct / stat.seen;
    if (accuracy < 0.5) return 'learning';
    if (stat.seen >= 3 && accuracy >= 0.9) return 'mastered';
    return 'familiar';
  }

  // `interval` is in days and `dueAt` is an epoch-ms timestamp, both written
  // by ReviewScheduler via recordAnswer. Defaults leave a never-seen question
  // un-scheduled (dueAt null), which QuestionSelector reads as "no due date
  // to measure against" rather than "overdue".
  const DEFAULT_QUESTION_STAT = {
    seen: 0, correct: 0, wrong: 0, lastSeen: null, lastCorrect: null,
    interval: 0, dueAt: null, latencies: [],
  };

  // Stable per-question identifier, exposed so callers outside this module
  // (e.g. QuestionSelector) can look up stats without duplicating the
  // gradeKey/questionId naming scheme.
  function getQuestionId(mode, grade, text) {
    return questionId(mode, grade, text);
  }

  // Raw per-question stats, never null — defaults to a zeroed, never-seen
  // record. The returned object is a fresh copy so callers can't mutate
  // stored progress by accident.
  //
  // The nested `latencies`/`confusions` are copied explicitly, not left to the
  // spread: a spread is shallow, and since readSnapshot() hands back a shared
  // memoized object, aliasing them would let a caller silently corrupt the
  // cache (and, for `latencies`, the single array literal on
  // DEFAULT_QUESTION_STAT shared by every never-seen question).
  function getQuestionStats(id) {
    const progress = readSnapshot();
    const stored = progress.questions[id];
    const stat = { ...DEFAULT_QUESTION_STAT, ...stored };
    stat.latencies = Array.isArray(stat.latencies) ? [...stat.latencies] : [];
    stat.confusions = { ...(stat.confusions || {}) };
    return stat;
  }

  function isSeen(id) {
    return getQuestionStats(id).seen > 0;
  }

  function getSeenCount(id) {
    return getQuestionStats(id).seen;
  }

  function getCorrectCount(id) {
    return getQuestionStats(id).correct;
  }

  function getWrongCount(id) {
    return getQuestionStats(id).wrong;
  }

  function getLastSeen(id) {
    return getQuestionStats(id).lastSeen;
  }

  // { [wrongReadingPicked]: timesPicked }, {} when the question has never
  // been answered incorrectly (or never seen at all). Fresh object each
  // call — safe for callers to read without risk of mutating stored progress.
  function getConfusions(id) {
    const progress = readSnapshot();
    return { ...(progress.questions[id]?.confusions || {}) };
  }

  // wrong / seen, 0 when never seen. Range 0–1.
  function getErrorRate(id) {
    const stats = getQuestionStats(id);
    return stats.seen === 0 ? 0 : stats.wrong / stats.seen;
  }

  // correct / seen, 0 when never seen. Range 0–1. This is the numeric
  // mastery ratio used by scoring strategies — distinct from the qualitative
  // new/learning/familiar/mastered bucket returned by mastery() above, which
  // the Progress Dashboard uses.
  function getMastery(id) {
    const stats = getQuestionStats(id);
    return stats.seen === 0 ? 0 : stats.correct / stats.seen;
  }

  // A "leech": a question the learner keeps missing — seen enough times to be
  // a pattern, yet still answered right less than half the time. It's the low
  // end of the same accuracy scale mastery() uses (mastered = seen>=3 &
  // acc>=0.9; a leech = seen>=3 & acc<0.5). Callers use it to give the item
  // extra scaffolding (e.g. always show its meaning) the way a teacher spends
  // more time on a stubborn kanji.
  const LEECH_MIN_SEEN = 3;
  const LEECH_MAX_ACCURACY = 0.5;
  function isLeech(id) {
    const stats = getQuestionStats(id);
    return stats.seen >= LEECH_MIN_SEEN && stats.correct / stats.seen < LEECH_MAX_ACCURACY;
  }

  // One-decimal accuracy percentage (e.g. 89.6), 0 when nothing answered yet.
  function getAccuracy(stats) {
    if (!stats || stats.answered === 0) return 0;
    return Math.round((stats.correct / stats.answered) * 1000) / 10;
  }

  function getAnswered(stats) {
    return stats ? stats.answered : 0;
  }

  function getGradeStats(mode, grade) {
    const progress = readSnapshot();
    const stats = progress.grades[gradeKey(mode, grade)] || { answered: 0, correct: 0 };
    return { ...stats, accuracy: getAccuracy(stats) };
  }

  function sumGrades(progress, keyPrefix) {
    return Object.entries(progress.grades)
      .filter(([key]) => !keyPrefix || key.startsWith(keyPrefix))
      .reduce((acc, [, g]) => ({ answered: acc.answered + g.answered, correct: acc.correct + g.correct }), { answered: 0, correct: 0 });
  }

  // Aggregate stats across every grade/mode, for the home-screen summary.
  function getOverallStats() {
    const progress = readSnapshot();
    const totals = sumGrades(progress);
    return { ...totals, accuracy: getAccuracy(totals) };
  }

  // Same as getOverallStats(), scoped to a single quiz mode (kanji or word).
  function getOverallStatsByMode(mode) {
    const progress = readSnapshot();
    const totals = sumGrades(progress, MODE_PREFIX[mode]);
    return { ...totals, accuracy: getAccuracy(totals) };
  }

  // Total question counts per grade/mode aren't tracked in localStorage —
  // they come from the static dataset (already known to the DOM via the
  // grade buttons' data-kanji-count / data-word-count attributes). Callers
  // register them once so the dashboard can compute a completion percentage
  // without ProgressManager needing to know about the DOM or fetch data.
  const totalQuestionsByGradeKey = {};

  function setTotalQuestions(mode, grade, total) {
    totalQuestionsByGradeKey[gradeKey(mode, grade)] = total;
  }

  function getTotalQuestions(mode, grade) {
    return totalQuestionsByGradeKey[gradeKey(mode, grade)] ?? null;
  }

  // Percentage of a grade's question pool answered at least once so far, or
  // null when the total is unknown (caller should hide the percentage then).
  function getGradeProgressPercent(mode, grade) {
    const total = getTotalQuestions(mode, grade);
    if (!total) return null;
    const { answered } = getGradeStats(mode, grade);
    return Math.min(100, Math.round((answered / total) * 100));
  }

  // Grade-level status, analogous to mastery() above but computed from the
  // grade's aggregate answered/correct counts rather than a single
  // question's history. Powers the home-screen per-grade breakdown so a
  // learner can see which grades are weak without opening each one.
  function getGradeStatus(mode, grade) {
    const stats = getGradeStats(mode, grade);
    if (stats.answered === 0) return 'new';
    if (stats.accuracy < 50) return 'learning';
    const percent = getGradeProgressPercent(mode, grade);
    if (stats.accuracy >= 90 && percent !== null && percent >= 90) return 'mastered';
    return 'familiar';
  }

  // Most recent answers (oldest first), correct/incorrect, across every
  // mode/grade — used for the "recent performance" sparkline.
  function getRecentHistory(limit = 20) {
    const progress = readSnapshot();
    return progress.history.slice(-limit);
  }

  return {
    load,
    save,
    recordAnswer,
    reset,
    resetAll,
    mastery,
    getQuestionId,
    getQuestionStats,
    isSeen,
    getSeenCount,
    getCorrectCount,
    getWrongCount,
    getLastSeen,
    getConfusions,
    getErrorRate,
    getMastery,
    isLeech,
    getGradeStats,
    getGradeStatus,
    getOverallStats,
    getOverallStatsByMode,
    getAccuracy,
    getAnswered,
    setTotalQuestions,
    getTotalQuestions,
    getGradeProgressPercent,
    getRecentHistory,
  };
})();

