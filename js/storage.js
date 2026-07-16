// Per-grade, per-mode progress, persisted in localStorage.
// Shape: { [kanjiOrWord]: { seen: number, correct: number } }

const Storage = (() => {
  const keyFor = (mode, grade) => (mode === 'word' ? `kanjidrill:words${grade}` : `kanjidrill:grade${grade}`);

  function load(mode, grade) {
    try {
      const raw = localStorage.getItem(keyFor(mode, grade));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function save(mode, grade, progress) {
    try {
      localStorage.setItem(keyFor(mode, grade), JSON.stringify(progress));
    } catch {
      // localStorage unavailable (private mode, quota, etc.) — fail silently
    }
  }

  function recordAnswer(mode, grade, key, isCorrect) {
    const progress = load(mode, grade);
    const stat = progress[key] || { seen: 0, correct: 0 };
    stat.seen += 1;
    if (isCorrect) stat.correct += 1;
    progress[key] = stat;
    save(mode, grade, progress);
    return stat;
  }

  function reset(mode, grade) {
    localStorage.removeItem(keyFor(mode, grade));
  }

  function resetAll() {
    for (let g = 1; g <= 6; g++) {
      reset('kanji', g);
      reset('word', g);
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

  function weightFor(mode, grade, key) {
    const progress = load(mode, grade);
    return WEIGHT_BY_MASTERY[mastery(progress[key])];
  }

  function stats(mode, grade) {
    const progress = load(mode, grade);
    const entries = Object.entries(progress);
    const seenCount = entries.length;
    const masteredCount = entries.filter(([, s]) => mastery(s) === 'mastered').length;
    return { seenCount, masteredCount };
  }

  return { load, save, recordAnswer, reset, resetAll, mastery, weightFor, stats };
})();
