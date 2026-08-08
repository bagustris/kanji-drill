// User preferences (as opposed to js/progress.js, which tracks learning
// history), saved to their own localStorage entry so resetting progress
// never wipes a user's configured preferences and vice versa.

const SettingsManager = (() => {
  const STORAGE_KEY = 'kanji-drill-settings';
  // playAudio defaults to false (spoken readings off); turning it on in
  // Settings speaks the reading via the browser's speech synthesis. It stays a
  // real boolean here (the audioEnabled() helper in app.js still handles a
  // legacy `null` from earlier versions as "never chosen").
  // autoAdvance defaults to true: after answering, the quiz moves on after a
  // short timed pause. Turning it off makes it wait for a manual continue
  // (tap / → / Enter) so there's unlimited time to read the revealed answer.
  const DEFAULTS = { showMeaning: true, roundSize: 10, playAudio: false, autoAdvance: true };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function save(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage unavailable (private mode, quota, etc.) — fail silently
    }
  }

  function get(key) {
    return load()[key];
  }

  function set(key, value) {
    const settings = load();
    settings[key] = value;
    save(settings);
  }

  return { get, set };
})();
