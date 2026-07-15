// Per-grade kanji progress, persisted in localStorage.
// Shape: { [kanji]: { seen: number, correct: number } }

const Storage = (() => {
  const keyFor = (grade) => `kanjidrill:grade${grade}`;

  function load(grade) {
    try {
      const raw = localStorage.getItem(keyFor(grade));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function save(grade, progress) {
    try {
      localStorage.setItem(keyFor(grade), JSON.stringify(progress));
    } catch {
      // localStorage unavailable (private mode, quota, etc.) — fail silently
    }
  }

  function recordAnswer(grade, kanji, isCorrect) {
    const progress = load(grade);
    const stat = progress[kanji] || { seen: 0, correct: 0 };
    stat.seen += 1;
    if (isCorrect) stat.correct += 1;
    progress[kanji] = stat;
    save(grade, progress);
    return stat;
  }

  function reset(grade) {
    localStorage.removeItem(keyFor(grade));
  }

  function resetAll() {
    for (let g = 1; g <= 6; g++) reset(g);
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

  function weightFor(grade, kanji) {
    const progress = load(grade);
    return WEIGHT_BY_MASTERY[mastery(progress[kanji])];
  }

  function stats(grade) {
    const progress = load(grade);
    const entries = Object.entries(progress);
    const seenCount = entries.length;
    const masteredCount = entries.filter(([, s]) => mastery(s) === 'mastered').length;
    return { seenCount, masteredCount };
  }

  return { load, save, recordAnswer, reset, resetAll, mastery, weightFor, stats };
})();
