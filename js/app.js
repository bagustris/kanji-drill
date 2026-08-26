const OPTIONS_COUNT = 4;

const state = {
  mode: 'kanji',
  // The single grade being drilled, or null in cumulative review mode (where
  // the pool spans several grades and each *item* carries its own grade —
  // see sourceGrade in loadData/pickQuestions).
  grade: null,
  isReview: false,
  itemList: [],
  questions: [],
  index: 0,
  score: 0,
  missed: [],
  correctItems: [],
  // performance.now() stamp taken when the current question finished
  // rendering; nulled once consumed so a re-render can't double-count.
  questionShownAt: null,
  // Auto-advance (default off): after answering we either arm a timer or wait
  // for a user gesture. `advanceTimer` holds the pending auto-advance timeout
  // (cleared if the user advances first); `awaitingContinue` is true while a
  // revealed answer is waiting for the user to move on manually.
  advanceTimer: null,
  awaitingContinue: false,
  screen: 'home',
};

const el = {
  screens: {
    home: document.getElementById('screen-home'),
    quiz: document.getElementById('screen-quiz'),
    summary: document.getElementById('screen-summary'),
  },
  modeButtons: document.querySelectorAll('.mode-btn'),
  gradeCounts: document.querySelectorAll('.grade-count'),
  gradeButtons: document.querySelectorAll('.grade-btn'),
  btnQuit: document.getElementById('btn-quit'),
  btnRetry: document.getElementById('btn-retry'),
  btnHome: document.getElementById('btn-home'),
  quizProgress: document.getElementById('quiz-progress'),
  quizKanji: document.getElementById('quiz-kanji'),
  quizMeaning: document.getElementById('quiz-meaning'),
  quizInstruction: document.getElementById('quiz-instruction'),
  quizOptions: document.getElementById('quiz-options'),
  quizExamples: document.getElementById('quiz-examples'),
  quizContinue: document.getElementById('quiz-continue'),
  quizLeechBadge: document.getElementById('quiz-leech-badge'),
  btnReview: document.getElementById('btn-review'),
  reviewCount: document.getElementById('review-count'),
  summaryScore: document.getElementById('summary-score'),
  summaryMissed: document.getElementById('summary-missed'),
  summaryCorrect: document.getElementById('summary-correct'),
  fileWarning: document.getElementById('file-protocol-warning'),
  loadError: document.getElementById('load-error-banner'),
  gradeProgressList: document.getElementById('grade-progress-list'),
  btnSettings: document.getElementById('btn-settings'),
  btnSettingsClose: document.getElementById('btn-settings-close'),
  settingsOverlay: document.getElementById('settings-overlay'),
  settingShowMeaning: document.getElementById('setting-show-meaning'),
  settingShowExamples: document.getElementById('setting-show-examples'),
  settingPlayAudio: document.getElementById('setting-play-audio'),
  settingAutoAdvance: document.getElementById('setting-auto-advance'),
  settingRoundSizeButtons: document.querySelectorAll('#setting-round-size .segmented-btn'),
  installButton: document.getElementById('btn-install'),
  installHint: document.getElementById('settings-install-hint'),
  aboutVersion: document.getElementById('about-version'),
};

// Core screen navigation is wired up first, before dashboard rendering or
// any other setup below — so a bug (or a stale-cache version mismatch
// between index.html and this script, see js/sw.js's CACHE_VERSION) in
// that later code can never leave the grade/mode buttons unresponsive.

// data-*-count attributes hold the exact label text to display (e.g.
// "80字"); sentence-count reads "準備中" (not ready yet) for any grade that
// doesn't have a data/sentencesN.json yet, which parseInt() naturally turns
// into NaN/falsy everywhere a total is checked, so those grades just show
// "no total" — see registerTotalQuestionCounts() below.
// Reverse mode drills the same grade files as kanji mode (given a reading +
// meaning, pick the kanji), so it reuses the kanji counts.
const COUNT_ATTR = { kanji: 'kanjiCount', word: 'wordCount', sentence: 'sentenceCount', reverse: 'kanjiCount' };

el.modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    el.modeButtons.forEach((b) => b.classList.toggle('active', b === btn));
    const mode = btn.dataset.mode;
    el.gradeCounts.forEach((span) => {
      span.textContent = span.dataset[COUNT_ATTR[mode]];
    });
    el.gradeButtons.forEach((gbtn) => {
      gbtn.dataset.mode = mode;
      gbtn.disabled = !isGradeAvailable(gbtn, mode);
    });
    renderDashboard();
  });
});

el.gradeButtons.forEach((btn) => {
  btn.dataset.mode = 'kanji';
  btn.addEventListener('click', () => startGrade(btn.dataset.mode, Number(btn.dataset.grade)));
});

el.btnReview.addEventListener('click', () => startReview(getSelectedMode()));

el.btnQuit.addEventListener('click', () => showScreen('home'));
el.btnHome.addEventListener('click', () => showScreen('home'));
el.btnRetry.addEventListener('click', () => startRound());

// The grade name shown in the dashboard (e.g. "3年生") is read straight off
// the matching grade button rather than duplicated in a lookup table — strip
// its key-badge/count child spans and what's left is the label text.
function gradeDisplayName(grade) {
  const btn = document.querySelector(`.grade-btn[data-grade="${grade}"]`);
  if (!btn) return '';
  const clone = btn.cloneNode(true);
  clone.querySelectorAll('span').forEach((span) => span.remove());
  return clone.textContent.trim();
}

// Total question counts per grade/mode are already known statically (see the
// grade-count data attributes in index.html) — register them once so the
// dashboard can show a completion percentage without fetching any data.
function registerTotalQuestionCounts() {
  el.gradeButtons.forEach((btn) => {
    const grade = Number(btn.dataset.grade);
    const counts = btn.querySelector('.grade-count');
    ProgressManager.setTotalQuestions('kanji', grade, parseInt(counts.dataset.kanjiCount, 10));
    ProgressManager.setTotalQuestions('word', grade, parseInt(counts.dataset.wordCount, 10));
    ProgressManager.setTotalQuestions('sentence', grade, parseInt(counts.dataset.sentenceCount, 10));
    // Reverse mode covers the same kanji set, so its per-grade total matches
    // kanji mode — needed for the dashboard's completion percentage.
    ProgressManager.setTotalQuestions('reverse', grade, parseInt(counts.dataset.kanjiCount, 10));
  });
}

// The mode toggle only flips which mode the grade buttons will launch (see
// its click handler below) — state.mode itself isn't set until a grade is
// actually started, so the dashboard reads the active toggle directly to
// know which mode's per-grade progress to show.
function getSelectedMode() {
  return document.querySelector('.mode-btn.active').dataset.mode;
}

function renderDashboard() {
  const mode = getSelectedMode();
  const grades = [...el.gradeButtons].map((btn) => {
    const grade = Number(btn.dataset.grade);
    return { grade, name: gradeDisplayName(grade) };
  });
  ProgressView.renderAll(mode, grades);
  // Kept in step with the dashboard rather than called separately: the two
  // read the same progress data, and finishing a grade for the first time is
  // exactly what flips review from unavailable to available.
  renderReviewButton();
}

// Settings dialog: a plain modal (backdrop click / Escape / close button
// dismiss it) rather than something wired into the arrow-key nav groups —
// it's reached by mouse/touch or Tab, matching how a native <dialog> would
// behave, without the added complexity of a full focus trap.
function applyMeaningVisibility() {
  el.quizMeaning.classList.toggle('hidden', !SettingsManager.get('showMeaning'));
}

// Resolves the tri-state playAudio preference (see settings.js): an explicit
// user choice (true/false) always wins; `null` (never chosen) falls back to
// off in an installed/standalone PWA — where a ja-JP speech voice is often
// network-dependent and thus unavailable offline — and on in a browser tab.
function audioEnabled() {
  const pref = SettingsManager.get('playAudio');
  return pref === null ? !isStandaloneDisplay() : pref;
}

// Speaks a reading when audio is enabled and supported; a silent no-op
// otherwise. Centralized so every call site shares the same gate. The
// okurigana dot (e.g. "おぼ.える") is a display marker, not something to
// pronounce, so it's stripped before the reading is spoken.
function speakReading(reading, onEnd) {
  const text = reading ? reading.replace(/\./g, '') : '';
  if (text && audioEnabled() && AudioPlayer.isSupported()) {
    AudioPlayer.speak(text, onEnd);
  } else if (onEnd) {
    onEnd();
  }
}

// How long the revealed answer stays on screen before auto-advancing, scaled to
// how much there is to read: a single kanji reading needs less time than a long
// compound (熟語) or an example sentence. `text` is the reading/sentence being
// shown/spoken; a wrong answer gets a larger base, and the result is clamped so
// nothing is instant or interminable. With audio on this is only the floor — the
// advance also waits for the utterance to finish (see handleAnswer).
function advanceDelayMs(text, isCorrect) {
  const len = (text || '').length;
  const ms = (isCorrect ? 650 : 1300) + len * 120;
  return Math.min(isCorrect ? 6000 : 8000, Math.max(isCorrect ? 700 : 1800, ms));
}

function isSettingsOpen() {
  return !el.settingsOverlay.classList.contains('hidden');
}

function openSettings() {
  el.settingsOverlay.classList.remove('hidden');
  renderInstallRow();
  el.btnSettingsClose.focus();
}

function closeSettings() {
  el.settingsOverlay.classList.add('hidden');
  el.btnSettings.focus();
}

// PWA install: Chrome/Edge/Android fire `beforeinstallprompt`, which we
// stash until the user taps the Settings button. Browsers with no such
// event (iOS Safari, desktop Safari/Firefox) get manual "Add to Home
// Screen" instructions instead, since there's no install API to call there.
let deferredInstallPrompt = null;

function isStandaloneDisplay() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function renderInstallRow() {
  if (isStandaloneDisplay()) {
    el.installButton.classList.add('hidden');
    el.installHint.textContent = 'インストール済み — Already installed';
    el.installHint.classList.remove('hidden');
    return;
  }
  if (deferredInstallPrompt) {
    el.installButton.classList.remove('hidden');
    el.installHint.classList.add('hidden');
    return;
  }
  el.installButton.classList.add('hidden');
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  el.installHint.textContent = isIOS
    ? '共有ボタン → ホーム画面に追加 — Share button → Add to Home Screen'
    : 'ブラウザメニューの「インストール」から追加できます — Use your browser menu → Install app';
  el.installHint.classList.remove('hidden');
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  renderInstallRow();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  renderInstallRow();
});

function initSettingsPanel() {
  el.settingShowMeaning.checked = SettingsManager.get('showMeaning');
  applyMeaningVisibility();

  const roundSize = String(SettingsManager.get('roundSize'));
  el.settingRoundSizeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === roundSize);
  });

  el.settingShowMeaning.addEventListener('change', () => {
    SettingsManager.set('showMeaning', el.settingShowMeaning.checked);
    applyMeaningVisibility();
  });

  // Example words need real reading time that auto-advance's timer doesn't
  // account for (see SettingsManager.get's autoAdvance/showExamples note), so
  // showing them always suppresses auto-advance. Reflect that as a disabled,
  // synced checkbox rather than leaving it interactive-but-ineffective: the
  // underlying autoAdvance preference is untouched in storage and reappears
  // (checkbox included) the moment examples are turned back off.
  function syncAutoAdvanceAvailability() {
    const suppressed = SettingsManager.get('showExamples');
    el.settingAutoAdvance.disabled = suppressed;
    el.settingAutoAdvance.checked = SettingsManager.get('autoAdvance');
    el.settingAutoAdvance.title = suppressed
      ? 'この漢字を使うことばの表示中は自動で次へを使えません — Not available while example words are shown'
      : '';
  }

  el.settingShowExamples.checked = SettingsManager.get('showExamples');
  el.settingShowExamples.addEventListener('change', () => {
    SettingsManager.set('showExamples', el.settingShowExamples.checked);
    syncAutoAdvanceAvailability();
    // Only re-render if this question's examples were already revealed
    // (options disabled) — toggling the setting on before answering must not
    // reveal them early and give away the reading.
    const answered = state.screen === 'quiz' && el.quizOptions.children[0] && el.quizOptions.children[0].disabled;
    if (answered) renderExamples(state.questions[state.index]);
  });

  // Init from the *resolved* default (audioEnabled()), not the raw tri-state
  // preference: a never-chosen `null` must render as off/on per context, not
  // as an unchecked box everywhere. Toggling writes a real boolean.
  el.settingPlayAudio.checked = audioEnabled();
  el.settingPlayAudio.addEventListener('change', () => {
    SettingsManager.set('playAudio', el.settingPlayAudio.checked);
  });

  syncAutoAdvanceAvailability();
  el.settingAutoAdvance.addEventListener('change', () => {
    SettingsManager.set('autoAdvance', el.settingAutoAdvance.checked);
  });

  el.settingRoundSizeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      el.settingRoundSizeButtons.forEach((b) => b.classList.toggle('active', b === btn));
      SettingsManager.set('roundSize', btn.dataset.value === 'all' ? 'all' : Number(btn.dataset.value));
    });
  });

  el.btnSettings.addEventListener('click', openSettings);
  el.btnSettingsClose.addEventListener('click', closeSettings);
  el.settingsOverlay.addEventListener('click', (e) => {
    if (e.target === el.settingsOverlay) closeSettings();
  });

  el.installButton.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    renderInstallRow();
  });

  renderInstallRow();
}

// The About panel's version is read from CHANGELOG.md (the single source of
// truth — see its header) rather than duplicated here: parse the newest
// `## [x.y.z]` heading and show it. The static v-number in index.html is the
// offline/pre-fetch fallback, so a failed fetch just leaves that in place.
async function loadAppVersion() {
  try {
    const res = await fetch('CHANGELOG.md');
    if (!res.ok) return;
    const text = await res.text();
    const match = text.match(/^##\s*\[(\d+\.\d+\.\d+)\]/m);
    if (match) el.aboutVersion.textContent = `v${match[1]}`;
  } catch {
    // offline / fetch blocked — keep the static fallback from index.html
  }
}

initSettingsPanel();
loadAppVersion();
registerTotalQuestionCounts();
ProgressView.init();
renderDashboard();

el.gradeProgressList.addEventListener('click', (e) => {
  const btn = e.target.closest('.grade-row-reset');
  if (!btn) return;
  const grade = Number(btn.dataset.grade);
  const mode = getSelectedMode();
  const name = gradeDisplayName(grade);
  if (!confirm(`${name}の成績をリセットしますか？\nReset progress for ${name}?`)) return;
  ProgressManager.reset(mode, grade);
  renderDashboard();
});

if (location.protocol === 'file:') {
  el.fileWarning.classList.remove('hidden');
}

function showScreen(name) {
  // Cut off any reading still being spoken so it can't play over the next
  // screen when the user quits mid-quiz or lands on the summary (renderQuestion
  // handles the question-to-question case).
  AudioPlayer.stop();
  // Leaving the quiz screen mid-reveal (quit, or the summary) must clear any
  // pending auto-advance timer and the manual-continue state so neither fires
  // against the next screen.
  if (state.advanceTimer !== null) {
    clearTimeout(state.advanceTimer);
    state.advanceTimer = null;
  }
  state.awaitingContinue = false;
  document.removeEventListener('click', onContinueClick);
  el.quizContinue.classList.add('hidden');
  state.screen = name;
  Object.entries(el.screens).forEach(([key, section]) => {
    section.classList.toggle('hidden', key !== name);
  });
}

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Kanji entries use `kanji`, word entries use `word`, sentence entries use
// `sentence` (the full example sentence, unique per entry) — same shape
// otherwise.
function itemText(entry) {
  return entry.kanji ?? entry.word ?? entry.sentence;
}

// Splits a target (a word or okurigana-inflected kanji, e.g. "立てる") into
// its kanji part and trailing okurigana kana.
function splitOkurigana(target) {
  const okurigana = (target.match(/[ぁ-ゟ]+$/) || [''])[0];
  const kanjiPart = okurigana ? target.slice(0, -okurigana.length) : target;
  return { kanjiPart, okurigana };
}

// Wraps just the kanji part of the target in a highlight so sentence-mode
// questions show which reading is being quizzed — the okurigana and the
// rest of the sentence stay plain, unstyled context. `kanjiHTML` replaces
// the kanji part's own display (used to swap in furigana once answered).
function highlightTarget(sentence, target, kanjiHTML) {
  const start = sentence.indexOf(target);
  if (start === -1) return sentence;
  const end = start + target.length;
  const { kanjiPart, okurigana } = splitOkurigana(target);
  const highlighted = `<span class="quiz-sentence-target">${kanjiHTML ?? kanjiPart}</span>${okurigana}`;
  return `${sentence.slice(0, start)}${highlighted}${sentence.slice(end)}`;
}

// Ruby annotation over the kanji part of a target, matching how both
// こくご textbooks and くりかえし漢字ドリル print furigana: the reading sits
// above the kanji only. Shown after answering so the learner sees the
// reading attached to the kanji in its sentence, which is the association
// the drill books are built around.
function furiganaHTML(kanjiPart, reading) {
  if (!kanjiPart) return kanjiPart;
  return `<ruby>${kanjiPart}<rt>${reading}</rt></ruby>`;
}

// A reading like "おぼ.える" marks where kanji-derived reading ends and
// okurigana (kana not carried by the kanji itself) begins.
function readingHTML(reading) {
  const dot = reading.indexOf('.');
  if (dot === -1) return reading;
  const core = reading.slice(0, dot);
  const okurigana = reading.slice(dot + 1);
  return `${core}<span class="okurigana">${okurigana}</span>`;
}

// The part of a reading before the okurigana dot, e.g. "まな.ぶ" -> "まな".
// In sentence mode the trailing okurigana is already written out as plain
// kana in the sentence itself (it's not being quizzed, only the kanji's
// reading is), so answer choices only need this core part — unlike
// kanji/word mode, where there's no surrounding sentence to show it.
function coreReading(reading) {
  const dot = reading.indexOf('.');
  return dot === -1 ? reading : reading.slice(0, dot);
}

// Adaptive replacement for the old random weightedSample(): builds a pool of
// {id, entry} candidates (id = ProgressManager's stable question ID) and
// repeatedly asks QuestionSelector for the next best question, removing each
// pick from the remaining pool so a single round never repeats a question
// (QuestionSelector's own recent-history queue additionally keeps picks
// diverse across rounds/retries within the same page session).
// `entry.sourceGrade` rather than a single round-wide grade: in cumulative
// review the pool spans several grades, and a question's progress must stay
// under the grade it actually belongs to (grade2:山 whether it was drilled
// from the grade-2 button or a review round). Keying it any other way would
// fork one kanji's history into two records.
function pickQuestions(itemList, mode, count) {
  const remaining = itemList.map((entry) => ({ id: ProgressManager.getQuestionId(mode, entry.sourceGrade, itemText(entry)), entry }));
  const picked = [];
  while (picked.length < count && remaining.length > 0) {
    const choice = QuestionSelector.select(remaining);
    if (!choice) break;
    picked.push(choice.entry);
    remaining.splice(remaining.findIndex((p) => p.id === choice.id), 1);
  }
  return picked;
}

// Distractor selection is delegated to the Adaptive Learning Engine's
// DistractorGenerator (js/learning/distractors/) instead of a random pick —
// see README "Adaptive Distractor Generation" for how it ranks candidates.
function buildQuestion(target, itemList, mode) {
  const correctReading = shuffle(target.readings)[0];
  const question = {
    id: ProgressManager.getQuestionId(mode, target.sourceGrade, itemText(target)),
    text: itemText(target),
    reading: correctReading,
    meaning: target.meaning,
    // Feeds SimilarityFeatures' grade-proximity term. In a single-grade round
    // every candidate shares one grade, so it contributes a constant and
    // changes no ranking; in review it usefully prefers same-grade wrong
    // answers over ones drawn from a distant grade.
    grade: target.sourceGrade,
    frequency: target.frequency,
  };
  const distractors = DistractorGenerator.generate(question, itemList);

  // Kanji mode keeps the BARE kanji as the prompt (学, not the inflected 学ぶ) —
  // closer to how an ES drill book presents it, and it doesn't leak the
  // okurigana by showing ぶ in the prompt. The reading is quizzed with its
  // okurigana intact (まな.ぶ), which readingHTML renders with the okurigana in
  // red so it reads as "learn 学 = まな, okurigana ぶ". Example words (optional
  // in the data — see tools/fetch-example-words.js) are still revealed after
  // answering to reinforce the kanji -> word association a drill book builds.
  if (mode === 'kanji') {
    return {
      text: question.text,
      sourceGrade: target.sourceGrade,
      meaning: target.meaning,
      correctReading,
      options: shuffle([correctReading, ...distractors]),
      examples: Array.isArray(target.examples) ? target.examples : [],
    };
  }

  const options = shuffle([correctReading, ...distractors]);
  return {
    text: question.text,
    sourceGrade: target.sourceGrade,
    sentence: target.sentence,
    target: target.target,
    // Sentence mode shows a translation of the whole sentence instead of
    // the target's own word/kanji gloss (still used above for `question`,
    // which feeds the distractor engine's meaning-similarity scoring —
    // that stays word-level so it isn't diluted by shared English function
    // words across unrelated sentence translations).
    meaning: mode === 'sentence' ? (target.translation || target.meaning) : target.meaning,
    correctReading,
    options,
  };
}

// Reverse mode loads the same grade files as kanji mode.
// Builds a reverse question: the prompt is a reading + meaning and the four
// options are kanji (one correct, three confusable distractors from
// DistractorGenerator.generateKanji). The correct kanji is stored in the same
// `correctReading` slot the forward modes use for the correct reading, so
// handleAnswer's answer-matching/recording stays mode-agnostic — only the
// rendering and the summary row differ (both branch on state.mode).
function buildReverseQuestion(target, itemList) {
  const kanji = itemText(target);
  const reading = shuffle(target.readings)[0];
  const question = {
    id: ProgressManager.getQuestionId('reverse', target.sourceGrade, kanji),
    text: kanji,
    reading,
    meaning: target.meaning,
    grade: target.sourceGrade,
    frequency: target.frequency,
  };
  const distractors = DistractorGenerator.generateKanji(question, itemList);
  const options = shuffle([kanji, ...distractors]);
  return {
    text: kanji,
    sourceGrade: target.sourceGrade,
    reading,
    meaning: target.meaning,
    correctReading: kanji,
    options,
    isReverse: true,
  };
}

// kanji-data organizes by data domain, not by app — grade/words/sentences
// files each live under a different top-level directory there (kanji/,
// words/, sentences/) with a kyoiku- prefix.
const MODE_FILE = {
  kanji: { dir: 'kanji', prefix: 'kyoiku-grade' },
  reverse: { dir: 'kanji', prefix: 'kyoiku-grade' },
  word: { dir: 'words', prefix: 'kyoiku-words' },
  sentence: { dir: 'sentences', prefix: 'kyoiku-sentences' },
};

// Every entry is tagged with the grade whose file it came from, in both
// single-grade and review rounds, so nothing downstream needs to branch on
// which kind of round it is — see pickQuestions().
async function loadData(mode, grade) {
  const { dir, prefix } = MODE_FILE[mode];
  const file = `${prefix}${grade}`;
  const res = await fetch(`vendor/kanji-data/${dir}/${file}.json`);
  if (!res.ok) throw new Error(`Failed to load ${file} data (HTTP ${res.status})`);
  const entries = await res.json();
  return entries.map((entry) => ({
    ...entry,
    sourceGrade: grade,
    // Sentence answers only quiz the kanji's own reading; the okurigana is
    // already written out in the sentence, so options drop it.
    readings: mode === 'sentence' ? entry.readings.map(coreReading) : entry.readings,
  }));
}

// Grades that both have data for this mode and have actually been drilled.
// This is what makes review *cumulative* rather than a firehose: it pools
// only what you've already started, so it never introduces new material —
// it just stops earlier grades from decaying while you work on a later one.
function studiedGrades(mode) {
  return [...el.gradeButtons]
    .map((btn) => ({ grade: Number(btn.dataset.grade), disabled: !isGradeAvailable(btn, mode) }))
    .filter(({ grade, disabled }) => !disabled && ProgressManager.getGradeStats(mode, grade).answered > 0)
    .map(({ grade }) => grade);
}

function isGradeAvailable(btn, mode) {
  const counts = btn.querySelector('.grade-count');
  return mode !== 'sentence' || parseInt(counts.dataset.sentenceCount, 10) > 0;
}

// Enables/labels the review button for the currently selected mode. Called on
// mode switch and after every round, since finishing a grade for the first
// time is exactly what makes review become available.
function renderReviewButton() {
  const mode = getSelectedMode();
  const grades = studiedGrades(mode);
  el.btnReview.disabled = grades.length === 0;
  el.reviewCount.textContent = grades.length === 0
    ? '学年を1つ終えると使えます'
    : `${grades.map(gradeDisplayName).join('・')}`;
}

async function startGrade(mode, grade) {
  await startSession(mode, { grade, load: () => loadData(mode, grade) });
}

async function startReview(mode) {
  const grades = studiedGrades(mode);
  if (grades.length === 0) return;
  await startSession(mode, {
    grade: null,
    isReview: true,
    load: async () => (await Promise.all(grades.map((g) => loadData(mode, g)))).flat(),
  });
}

async function startSession(mode, { grade, isReview = false, load }) {
  el.loadError.classList.add('hidden');
  try {
    state.mode = mode;
    state.grade = grade;
    state.isReview = isReview;
    state.itemList = await load();
    renderDashboard();
    startRound();
  } catch (err) {
    console.error(err);
    el.loadError.textContent = location.protocol === 'file:'
      ? '読み込みに失敗しました。サーバー経由で開いてください（上の注意を参照）。'
      : '読み込みに失敗しました。ページを再読み込みしてください。';
    el.loadError.classList.remove('hidden');
  }
}

function startRound() {
  const configuredSize = SettingsManager.get('roundSize');
  const roundSize = configuredSize === 'all' ? state.itemList.length : configuredSize;
  const count = Math.min(roundSize, state.itemList.length);
  const picks = pickQuestions(state.itemList, state.mode, count);
  state.questions = picks.map((entry) =>
    state.mode === 'reverse'
      ? buildReverseQuestion(entry, state.itemList)
      : buildQuestion(entry, state.itemList, state.mode));
  state.index = 0;
  state.score = 0;
  state.missed = [];
  state.correctItems = [];
  showScreen('quiz');
  renderQuestion();
}

const INSTRUCTION_TEXT = {
  sentence: ['赤字の読み方は？', 'Choose the reading for the bold red part'],
  reverse: ['この読み方の漢字は？', 'Choose the kanji for this reading'],
};
const DEFAULT_INSTRUCTION = ['正しい読み方は？', 'Choose the correct reading'];

// Bumped every time a question renders. An audio-gated auto-advance captures
// this at answer time and only fires if it still matches — so a spoken reading
// that finishes (or is cancelled) after the learner has moved on, quit, or
// started a new round can't trigger a stray skip.
let renderGen = 0;

function renderQuestion() {
  renderGen++;
  const q = state.questions[state.index];
  const isReverse = state.mode === 'reverse';
  // Cut off any reading still being spoken from the previous question's reveal
  // so audio never bleeds across the auto-advance.
  AudioPlayer.stop();
  // Flagged in review mode: the pool spans grades there, so without this a
  // grade-5 kanji surfacing mid-round just looks like a bug.
  const counter = `${state.index + 1} / ${state.questions.length}`;
  el.quizProgress.textContent = state.isReview ? `ふくしゅう ${counter}` : counter;
  el.quizKanji.classList.toggle('is-word', state.mode === 'word');
  el.quizKanji.classList.toggle('is-sentence', state.mode === 'sentence');
  el.quizKanji.classList.toggle('is-reverse', isReverse);
  // Reverse prompts a reading (rendered through readingHTML so an okurigana
  // dot becomes the styled span); sentence highlights the target in its
  // sentence; kanji and word show the bare kanji / word as-is (the reading,
  // with its okurigana, is quizzed in the options).
  el.quizKanji.innerHTML = isReverse
    ? readingHTML(q.reading)
    : state.mode === 'sentence' ? highlightTarget(q.sentence, q.target) : q.text;
  el.quizMeaning.textContent = q.meaning;
  // A leech (a kanji this learner keeps missing) gets extra scaffolding: its
  // meaning is shown as a hint even when the setting is off, and the card is
  // flagged so a "weak spot" marker appears — mirroring a teacher spending
  // more time on a stubborn kanji.
  const leech = ProgressManager.isLeech(ProgressManager.getQuestionId(state.mode, q.sourceGrade, q.text));
  el.quizLeechBadge.classList.toggle('hidden', !leech);
  // The meaning is what disambiguates homophone kanji in reverse mode, so it
  // is always shown there regardless of the show-meaning preference; forward
  // modes honor the setting — unless the item is a leech, which force-shows it.
  if (isReverse || leech) el.quizMeaning.classList.remove('hidden');
  else applyMeaningVisibility();
  const [instructionMain, instructionSub] = INSTRUCTION_TEXT[state.mode] || DEFAULT_INSTRUCTION;
  el.quizInstruction.innerHTML = `${instructionMain}<span>${instructionSub}</span>`;
  el.quizOptions.classList.toggle('is-reverse', isReverse);
  el.quizOptions.innerHTML = '';
  q.options.forEach((option, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    // In reverse mode the options are kanji; readingHTML leaves a dot-free
    // kanji untouched, so it's safe to route both through it.
    btn.innerHTML = `<span class="key-badge key-badge-corner">${i + 1}</span>${readingHTML(option)}`;
    btn.dataset.reading = option;
    btn.addEventListener('click', () => handleAnswer(option, btn));
    el.quizOptions.appendChild(btn);
  });

  // Example words are revealed only after answering (see handleAnswer) — before
  // that they could give the reading away — so clear/hide them for each new
  // question.
  el.quizExamples.innerHTML = '';
  el.quizExamples.classList.add('hidden');

  // Reverse mode speaks the reading up front (it's already on screen, so this
  // leaks nothing) — mirroring a teacher reading the target aloud before the
  // learner points at the kanji. Forward modes must wait until the answer is
  // revealed (see handleAnswer), since the reading *is* the answer.
  if (isReverse) speakReading(q.reading);

  // Stamped last, once the options are actually on screen, so the measured
  // latency is time-to-answer rather than time-to-answer plus render.
  state.questionShownAt = performance.now();
}

// Arrow-key navigation: each screen exposes an ordered list of button
// groups (each with a column count matching its on-screen grid/row/stack
// layout). Left/Right move within a group's row; Up/Down move within a
// group's column and, at a group's top/bottom edge, jump to the
// neighboring group in the same column. Buttons are real <button>
// elements, so once focused, Enter/Space activate them via native
// browser behavior — no extra handling needed here.
// Disabled buttons are dropped: focus() is a no-op on them, so leaving them
// in a group would strand arrow-key navigation on a dead cell (Sentence mode
// disables every grade that has no sentence data yet).
function enabledItems(items) {
  return [...items].filter((item) => !item.disabled);
}

function getNavGroups() {
  if (state.screen === 'home') {
    const grids = document.querySelectorAll('.grade-grid');
    return [
      // cols tracks the on-screen layout: the mode toggle is a single flex
      // row, so its column count is however many mode buttons there are.
      { items: enabledItems(el.modeButtons), cols: el.modeButtons.length },
      { items: enabledItems(grids[0].children), cols: 2 },
      { items: enabledItems(grids[1].children), cols: 2 },
      // The review row is a single full-width button, and it's disabled until
      // a grade has been studied — so this group is empty on a fresh install
      // and gets dropped below rather than stranding focus on a dead cell.
      { items: enabledItems(grids[2].children), cols: 1 },
    ].filter((group) => group.items.length > 0);
  }
  if (state.screen === 'quiz') {
    return [
      { items: [el.btnQuit], cols: 1 },
      { items: [...el.quizOptions.children], cols: 2 },
    ];
  }
  if (state.screen === 'summary') {
    return [{ items: [el.btnRetry, el.btnHome], cols: 1 }];
  }
  return [];
}

function findFocusPosition(groups) {
  for (let g = 0; g < groups.length; g++) {
    const i = groups[g].items.indexOf(document.activeElement);
    if (i !== -1) return { g, i };
  }
  return null;
}

function navigate(dRow, dCol) {
  const groups = getNavGroups().filter((grp) => grp.items.length > 0);
  if (groups.length === 0) return;

  const pos = findFocusPosition(groups);
  if (!pos) {
    groups[0].items[0].focus();
    return;
  }

  const { g, i } = pos;
  const group = groups[g];
  const row = Math.floor(i / group.cols);
  const col = i % group.cols;

  if (dCol !== 0) {
    const newCol = col + dCol;
    if (newCol < 0 || newCol >= group.cols) return;
    const newIndex = row * group.cols + newCol;
    if (newIndex >= group.items.length) return;
    group.items[newIndex].focus();
    return;
  }

  const newRow = row + dRow;
  const withinIndex = newRow * group.cols + col;
  if (newRow >= 0 && withinIndex < group.items.length) {
    group.items[withinIndex].focus();
    return;
  }

  const targetGroupIndex = g + dRow;
  if (targetGroupIndex < 0 || targetGroupIndex >= groups.length) return;
  const targetGroup = groups[targetGroupIndex];
  let targetIndex;
  if (dRow > 0) {
    targetIndex = Math.min(col, targetGroup.cols - 1, targetGroup.items.length - 1);
  } else {
    const lastRow = Math.floor((targetGroup.items.length - 1) / targetGroup.cols);
    const candidate = lastRow * targetGroup.cols + Math.min(col, targetGroup.cols - 1);
    targetIndex = candidate < targetGroup.items.length ? candidate : targetGroup.items.length - 1;
  }
  targetGroup.items[targetIndex].focus();
}

const ARROW_DELTAS = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

// Keyboard shortcuts, mirrored by the on-screen key-badges: k/w/s/g switch
// mode (kanji/word/sentence/reverse) and 1-9 pick a grade on the home screen,
// 1-4 pick a quiz option (matching the 2x2 grid order) and 0 quits, 1/2 retry
// or return home on the summary screen. Arrow keys move focus between
// on-screen buttons on every screen.
document.addEventListener('keydown', (e) => {
  if (isSettingsOpen()) {
    if (e.key === 'Escape') closeSettings();
    return;
  }

  if (e.ctrlKey || e.metaKey || e.altKey) return;

  // While a revealed answer waits for a manual continue (auto-advance off),
  // →/Enter/Space move on and 0 still quits; other keys are swallowed (the
  // options are already disabled, so there's nothing to navigate to). This is
  // checked before arrow-nav so → advances rather than moving focus.
  if (state.screen === 'quiz' && state.awaitingContinue) {
    if (e.key === '0') { el.btnQuit.click(); return; }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar' || e.key === 'ArrowRight') {
      e.preventDefault();
      advanceQuestion();
    }
    return;
  }

  if (ARROW_DELTAS[e.key]) {
    e.preventDefault();
    navigate(...ARROW_DELTAS[e.key]);
    return;
  }

  if (state.screen === 'home') {
    const key = e.key.toLowerCase();
    if (key === 'k') {
      document.querySelector('.mode-btn[data-mode="kanji"]').click();
      return;
    }
    if (key === 'w') {
      document.querySelector('.mode-btn[data-mode="word"]').click();
      return;
    }
    if (key === 's') {
      document.querySelector('.mode-btn[data-mode="sentence"]').click();
      return;
    }
    if (key === 'g') {
      document.querySelector('.mode-btn[data-mode="reverse"]').click();
      return;
    }
    if (key === 'r') {
      if (!el.btnReview.disabled) el.btnReview.click();
      return;
    }
    const btn = document.querySelector(`.grade-btn[data-grade="${e.key}"]`);
    if (btn) btn.click();
    return;
  }

  if (state.screen === 'quiz') {
    if (e.key === '0') {
      el.btnQuit.click();
      return;
    }
    const index = Number(e.key) - 1;
    if (!(index >= 0 && index < OPTIONS_COUNT)) return;
    const btn = el.quizOptions.children[index];
    if (!btn || btn.disabled) return;
    btn.click();
    return;
  }

  if (state.screen === 'summary') {
    if (e.key === '1') el.btnRetry.click();
    else if (e.key === '2') el.btnHome.click();
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Renders the kanji's example words on the answer reveal (kanji mode only).
// A no-op — hiding the panel — when there are none or the setting is off, so
// kanji that don't yet carry `examples` data simply show nothing (see
// tools/fetch-example-words.js and tools/fetch-examples-kanjialive.js).
function renderExamples(q) {
  const examples = state.mode === 'kanji' && Array.isArray(q.examples) ? q.examples : [];
  if (examples.length === 0 || !SettingsManager.get('showExamples')) {
    el.quizExamples.innerHTML = '';
    el.quizExamples.classList.add('hidden');
    return;
  }
  const rows = examples.map((ex) =>
    `<li><span class="ex-word">${escapeHtml(ex.word)}</span>` +
    `<span class="ex-reading">${escapeHtml(ex.reading || '')}</span>` +
    `<span class="ex-gloss">${escapeHtml(ex.gloss || '')}</span></li>`
  ).join('');
  el.quizExamples.innerHTML =
    `<div class="quiz-examples-label">この漢字を使うことば<span>Words that use this kanji</span></div><ul>${rows}</ul>`;
  el.quizExamples.classList.remove('hidden');
}

function handleAnswer(selected, btnEl) {
  const q = state.questions[state.index];
  const isCorrect = selected === q.correctReading;

  const latencyMs = state.questionShownAt === null ? null : performance.now() - state.questionShownAt;
  state.questionShownAt = null;

  [...el.quizOptions.children].forEach((btn) => {
    btn.disabled = true;
    if (btn.dataset.reading === q.correctReading) btn.classList.add('correct');
    else if (btn === btnEl) btn.classList.add('incorrect');
  });

  if (state.mode === 'sentence') {
    const { kanjiPart } = splitOkurigana(q.target);
    el.quizKanji.innerHTML = highlightTarget(q.sentence, q.target, furiganaHTML(kanjiPart, q.correctReading));
  }

  // Kanji mode reveals the example words that use this kanji, reinforcing the
  // kanji -> word association the way a drill book's 熟語 list does.
  renderExamples(q);

  // q.sourceGrade, not state.grade — in review mode state.grade is null and
  // each question belongs to its own grade's progress record.
  ProgressManager.recordAnswer(state.mode, q.sourceGrade, q.text, isCorrect, selected, latencyMs);
  if (isCorrect) { state.score++; state.correctItems.push(q); }
  else state.missed.push(q);

  renderDashboard();

  // Forward modes speak the reading now that it's revealed (it lives in
  // correctReading — couldn't be spoken earlier without giving the answer
  // away). Reverse mode already spoke it when the question rendered.
  const spokenText = state.mode === 'sentence' ? q.sentence
    : state.mode !== 'reverse' ? q.correctReading
    : '';
  // Length for the reading pause: the whole sentence in sentence mode, the
  // reading otherwise — so longer content gets more time on screen.
  const readText = state.mode === 'sentence' ? q.sentence
    : state.mode === 'reverse' ? q.reading
    : q.correctReading;

  if (SettingsManager.get('autoAdvance')) {
    // A wrong answer gets a longer pause than a correct one: that's the moment
    // the revealed reading actually needs to be read. Length-adaptive so a long
    // compound or sentence gets more time than a single short reading.
    const delay = advanceDelayMs(readText, isCorrect);
    const willSpeak = !!spokenText && audioEnabled() && AudioPlayer.isSupported();
    if (willSpeak) {
      // With audio on, don't cut the spoken reading off: advance only once BOTH
      // the reading pause has elapsed AND the utterance has finished. renderGen
      // + the screen check guard against a late speech callback (from quitting
      // or retrying mid-reading) triggering a stray skip.
      const gen = renderGen;
      let waited = false;
      let spoken = false;
      const maybeAdvance = () => {
        if (waited && spoken && gen === renderGen && state.screen === 'quiz') advanceQuestion();
      };
      state.advanceTimer = setTimeout(() => { state.advanceTimer = null; waited = true; maybeAdvance(); }, delay);
      speakReading(spokenText, () => { spoken = true; maybeAdvance(); });
    } else {
      state.advanceTimer = setTimeout(advanceQuestion, delay);
    }
  } else {
    // Manual advance (the default): speak the reading (forward modes), then let
    // the learner dwell on the revealed answer as long as they like and continue
    // with a tap/click or →/Enter/Space (see the quiz keydown handler).
    if (spokenText) speakReading(spokenText);
    state.awaitingContinue = true;
    el.quizContinue.classList.remove('hidden');
    // Register the click-to-continue listener on the *next* macrotask, so the
    // very click that answered this question doesn't bubble up and instantly
    // advance it — and only if we're still awaiting (a fast keyboard advance
    // may have already moved on). advanceQuestion() removes it, so exactly one
    // listener is ever live; a plain (non-once) listener avoids a keyboard
    // advance leaving a stale once-listener that would swallow the next
    // question's answering click.
    setTimeout(() => {
      if (state.awaitingContinue) document.addEventListener('click', onContinueClick);
    }, 0);
  }
}

// Advances on a click anywhere while a revealed answer waits for manual
// continue. Guarded, though advanceQuestion() also removes it.
function onContinueClick() {
  if (state.awaitingContinue) advanceQuestion();
}

// Moves to the next question (or the summary). The single exit point for both
// the auto-advance timer and a manual continue, so timer/awaiting state and
// the continue hint are always cleared exactly once.
function advanceQuestion() {
  if (state.screen !== 'quiz') return; // guards a late audio callback after quitting
  if (state.advanceTimer !== null) {
    clearTimeout(state.advanceTimer);
    state.advanceTimer = null;
  }
  state.awaitingContinue = false;
  document.removeEventListener('click', onContinueClick);
  el.quizContinue.classList.add('hidden');
  state.index++;
  if (state.index < state.questions.length) renderQuestion();
  else showSummary();
}

// One review row: the prompt, its meaning, and the answer. Reverse mode's
// "answer" is a reading (correctReading holds the kanji there — see
// buildReverseQuestion), so it shows the kanji as the prompt and the reading
// as the answer, the mirror of the forward rows.
function summaryRowHTML(q) {
  if (state.mode === 'reverse') {
    return `<span>${q.text}</span><span class="missed-item-meaning">${q.meaning}</span><span>${readingHTML(q.reading)}</span>`;
  }
  const display = state.mode === 'sentence' ? highlightTarget(q.sentence, q.target) : q.text;
  return `<span>${display}</span><span class="missed-item-meaning">${q.meaning}</span><span>${readingHTML(q.correctReading)}</span>`;
}

function showSummary() {
  showScreen('summary');
  el.summaryScore.innerHTML = `${state.score} / ${state.questions.length} 正解<span>Correct</span>`;
  el.summaryMissed.innerHTML = '';
  if (state.missed.length > 0) {
    const heading = document.createElement('h3');
    heading.textContent = 'まちがえたもの';
    el.summaryMissed.appendChild(heading);
    state.missed.forEach((q) => {
      const row = document.createElement('div');
      row.className = 'missed-item';
      row.innerHTML = summaryRowHTML(q);
      el.summaryMissed.appendChild(row);
    });
  }

  el.summaryCorrect.innerHTML = '';
  if (state.correctItems.length > 0) {
    const details = document.createElement('details');
    details.className = 'summary-correct-details';
    const summary = document.createElement('summary');
    summary.textContent = `せいかいしたもの（${state.correctItems.length}）`;
    details.appendChild(summary);
    state.correctItems.forEach((q) => {
      const row = document.createElement('div');
      row.className = 'missed-item';
      row.innerHTML = summaryRowHTML(q);
      details.appendChild(row);
    });
    el.summaryCorrect.appendChild(details);
  }
}
