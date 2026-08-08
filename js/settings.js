// User preferences (as opposed to js/progress.js, which tracks learning
// history), saved to their own localStorage entry so resetting progress
// never wipes a user's configured preferences and vice versa.

const SettingsManager = (() => {
  const STORAGE_KEY = 'kanji-drill-settings';
  // playAudio is deliberately tri-state: `null` means "the user has never
  // chosen", which app.js resolves at read time to a context-dependent
  // default (off in an installed/standalone PWA, where a ja-JP speech voice
  // is often network-dependent and unavailable offline; on in a browser
  // tab). An explicit toggle writes a real boolean and wins from then on.
  // Note the load() spread below means get('playAudio') returns `null`, not
  // `undefined`, until toggled — see audioEnabled() in app.js.
  // autoAdvance defaults to false: after answering, the quiz waits for the
  // learner to continue (tap / → / Enter) rather than jumping ahead on a
  // timer, so there's time to read the revealed answer. Turning it on restores
  // the timed auto-advance.
  const DEFAULTS = { showMeaning: true, roundSize: 10, playAudio: null, autoAdvance: false };

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
