// Persistent learning progress, saved as a single localStorage entry so it
// survives reloads, browser restarts, and GitHub Pages redeploys (data lives
// in the browser, not the deployment).
// Shape: { version, lastUpdated, grades: { [gradeKey]: {answered, correct} },
//          questions: { [questionId]: {seen, correct, wrong, lastSeen} } }

const ProgressManager = (() => {
  const STORAGE_KEY = 'kanji-drill-progress';
  const VERSION = 1;

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
    return { version: VERSION, lastUpdated: null, grades: {}, questions: {} };
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

  function recordAnswer(mode, grade, text, isCorrect) {
    const progress = load();

    const qId = questionId(mode, grade, text);
    const qStat = progress.questions[qId] || { seen: 0, correct: 0, wrong: 0, lastSeen: null };
    qStat.seen += 1;
    if (isCorrect) qStat.correct += 1;
    else qStat.wrong += 1;
    qStat.lastSeen = Date.now();
    progress.questions[qId] = qStat;

    const gKey = gradeKey(mode, grade);
    const gStat = progress.grades[gKey] || { answered: 0, correct: 0 };
    gStat.answered += 1;
    if (isCorrect) gStat.correct += 1;
    progress.grades[gKey] = gStat;

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

  // Higher weight = shown more often in future rounds.
  const WEIGHT_BY_MASTERY = { new: 3, learning: 4, familiar: 2, mastered: 1 };

  function weightFor(mode, grade, text) {
    const progress = load();
    const qId = questionId(mode, grade, text);
    return WEIGHT_BY_MASTERY[mastery(progress.questions[qId])];
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

  // Aggregate stats across every grade/mode, for the home-screen summary.
  function getOverallStats() {
    const progress = load();
    const totals = Object.values(progress.grades).reduce(
      (acc, g) => ({ answered: acc.answered + g.answered, correct: acc.correct + g.correct }),
      { answered: 0, correct: 0 }
    );
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

  return {
    load,
    save,
    recordAnswer,
    reset,
    resetAll,
    mastery,
    weightFor,
    getGradeStats,
    getOverallStats,
    getAccuracy,
    getAnswered,
    setTotalQuestions,
    getTotalQuestions,
    getGradeProgressPercent,
  };
})();
