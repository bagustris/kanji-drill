// Optional spoken readings (音読) via the browser's built-in Web Speech
// synthesis — no library, no network asset, nothing to bundle. It adds an
// auditory channel to the drill the way an elementary classroom does (the
// teacher reads the kanji aloud), and degrades to a silent no-op wherever
// speechSynthesis or a Japanese voice is unavailable rather than erroring.
//
// This module only *speaks*; whether audio is enabled is decided by the
// caller (app.js's audioEnabled(), which reads the SettingsManager
// preference). Keeping the gate out of here mirrors how SimilarityFeatures
// stays free of ProgressManager access — one concern per module.

const AudioPlayer = (() => {
  const supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';

  // The chosen ja voice, resolved lazily: getVoices() is empty on first call
  // in some browsers and only populates after the voiceschanged event, so we
  // re-pick whenever it fires. A null voice is fine — the utterance still
  // carries lang="ja-JP" and the browser picks a default.
  let jaVoice = null;
  function pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    jaVoice =
      voices.find((v) => v.lang === 'ja-JP') ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('ja')) ||
      null;
  }
  if (supported) {
    pickVoice();
    // Assigning the handler (rather than addEventListener) keeps it idempotent
    // if this module were ever re-evaluated.
    window.speechSynthesis.onvoiceschanged = pickVoice;
  }

  // Speak a short string (a reading/word). Cancels anything still playing so
  // rapid question transitions never queue or overlap utterances.
  function speak(text) {
    if (!supported || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      if (jaVoice) utterance.voice = jaVoice;
      utterance.rate = 0.95; // a hair slower than default, closer to a teacher's pace
      window.speechSynthesis.speak(utterance);
    } catch {
      // Any speech-engine hiccup is non-fatal to the quiz — stay silent.
    }
  }

  // Stop any in-flight utterance. Called when a new question renders so a
  // reveal-triggered reading can't bleed into the next question.
  function stop() {
    if (!supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // no-op
    }
  }

  function isSupported() {
    return supported;
  }

  return { speak, stop, isSupported };
})();
