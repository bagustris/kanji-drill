// Persistent learning progress, saved as a single localStorage entry so it
// survives reloads, browser restarts, and GitHub Pages redeploys (data lives
// in the browser, not the deployment).
// Shape: { version, lastUpdated, grades: { [gradeKey]: {answered, correct} },
//          questions: { [questionId]: {seen, correct, wrong, lastSeen, lastCorrect} },
//          history: [isCorrect, ...] } (most recent last, capped length)

const ProgressManager = (() => {
  const STORAGE_KEY = 'kanji-drill-progress';
  const VERSION = 1;
  const HISTORY_LIMIT = 30;
  const MODE_PREFIX = { kanji: 'grade', word: 'words' };

  // Reuses the existing per-mode/grade key naming (kanjidrill:gradeN /
  // kanjidrill:wordsN) as the namespace for a question's stable ID, so we
  // don't invent a new identifier scheme — the kanji/word text itself
  // (see itemText() in app.js) is still the identifying key.
  function gradeKey(mode, grade) {
    return mode === 'word' ? `words${grade}` : `grade${grade}`;
  }

  function questionId(mode, grade, text) {
    return `${gradeKey(mode, grade)}:${text}`;
  }

  function emptyProgress() {
    return { version: VERSION, lastUpdated: null, grades: {}, questions: {}, history: [] };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyProgress();
      const parsed = JSON.parse(raw);
      return {
        version: parsed.version || VERSION,
        lastUpdated: parsed.lastUpdated || null,
        grades: parsed.grades || {},
        questions: parsed.questions || {},
        history: parsed.history || [],
      };
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
  function recordAnswer(mode, grade, text, isCorrect, selectedReading) {
    const progress = load();

    const qId = questionId(mode, grade, text);
    const qStat = progress.questions[qId] || { seen: 0, correct: 0, wrong: 0, lastSeen: null, lastCorrect: null, confusions: {} };
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

  const DEFAULT_QUESTION_STAT = { seen: 0, correct: 0, wrong: 0, lastSeen: null, lastCorrect: null };

  // Stable per-question identifier, exposed so callers outside this module
  // (e.g. QuestionSelector) can look up stats without duplicating the
  // gradeKey/questionId naming scheme.
  function getQuestionId(mode, grade, text) {
    return questionId(mode, grade, text);
  }

  // Raw per-question stats (seen/correct/wrong/lastSeen/lastCorrect), never
  // null — defaults to a zeroed, never-seen record. Returned object is a
  // fresh copy so callers can't mutate stored progress by accident.
  function getQuestionStats(id) {
    const progress = load();
    return { ...DEFAULT_QUESTION_STAT, ...progress.questions[id] };
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
    const progress = load();
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

  // One-decimal accuracy percentage (e.g. 89.6), 0 when nothing answered yet.
  function getAccuracy(stats) {
    if (!stats || stats.answered === 0) return 0;
    return Math.round((stats.correct / stats.answered) * 1000) / 10;
  }

  function getAnswered(stats) {
    return stats ? stats.answered : 0;
  }

  function getGradeStats(mode, grade) {
    const progress = load();
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
    const progress = load();
    const totals = sumGrades(progress);
    return { ...totals, accuracy: getAccuracy(totals) };
  }

  // Same as getOverallStats(), scoped to a single quiz mode (kanji or word).
  function getOverallStatsByMode(mode) {
    const progress = load();
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

  // Count of questions in a grade at each mastery level. Untouched questions
  // (never answered, so not present in `questions` at all) are counted as
  // 'new' when the grade's total question count is known.
  function getMasteryBreakdown(mode, grade) {
    const progress = load();
    const prefix = `${gradeKey(mode, grade)}:`;
    const counts = { new: 0, learning: 0, familiar: 0, mastered: 0 };
    let tracked = 0;
    Object.entries(progress.questions).forEach(([id, stat]) => {
      if (!id.startsWith(prefix)) return;
      counts[mastery(stat)] += 1;
      tracked += 1;
    });
    const total = getTotalQuestions(mode, grade);
    if (total !== null) counts.new += Math.max(0, total - tracked);
    return counts;
  }

  // Most recent answers (oldest first), correct/incorrect, across every
  // mode/grade — used for the "recent performance" sparkline.
  function getRecentHistory(limit = 20) {
    const progress = load();
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
    getGradeStats,
    getOverallStats,
    getOverallStatsByMode,
    getAccuracy,
    getAnswered,
    setTotalQuestions,
    getTotalQuestions,
    getGradeProgressPercent,
    getMasteryBreakdown,
    getRecentHistory,
  };
})();

