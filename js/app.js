const OPTIONS_COUNT = 4;

const state = {
  mode: 'kanji',
  grade: null,
  itemList: [],
  questions: [],
  index: 0,
  score: 0,
  missed: [],
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
  summaryScore: document.getElementById('summary-score'),
  summaryMissed: document.getElementById('summary-missed'),
  fileWarning: document.getElementById('file-protocol-warning'),
  loadError: document.getElementById('load-error-banner'),
  gradeProgressList: document.getElementById('grade-progress-list'),
  btnSettings: document.getElementById('btn-settings'),
  btnSettingsClose: document.getElementById('btn-settings-close'),
  settingsOverlay: document.getElementById('settings-overlay'),
  settingShowMeaning: document.getElementById('setting-show-meaning'),
  settingRoundSizeButtons: document.querySelectorAll('#setting-round-size .segmented-btn'),
  installButton: document.getElementById('btn-install'),
  installHint: document.getElementById('settings-install-hint'),
};

// Core screen navigation is wired up first, before dashboard rendering or
// any other setup below — so a bug (or a stale-cache version mismatch
// between index.html and this script, see js/sw.js's CACHE_VERSION) in
// that later code can never leave the grade/mode buttons unresponsive.

// data-*-count attributes hold the exact label text to display (e.g.
// "80字"); sentence-count instead reads "準備中" (not ready yet) for grades
// that don't have sentence data (only grade 1 does, for now — see
// data/sentences1.json), which parseInt() naturally turns into NaN/falsy
// everywhere a total is checked, so those grades just show "no total" —
// see registerTotalQuestionCounts() below.
const COUNT_ATTR = { kanji: 'kanjiCount', word: 'wordCount', sentence: 'sentenceCount' };

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
      const counts = gbtn.querySelector('.grade-count');
      const available = mode !== 'sentence' || parseInt(counts.dataset.sentenceCount, 10) > 0;
      gbtn.disabled = !available;
    });
    renderDashboard();
  });
});

el.gradeButtons.forEach((btn) => {
  btn.dataset.mode = 'kanji';
  btn.addEventListener('click', () => startGrade(btn.dataset.mode, Number(btn.dataset.grade)));
});

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
}

// Settings dialog: a plain modal (backdrop click / Escape / close button
// dismiss it) rather than something wired into the arrow-key nav groups —
// it's reached by mouse/touch or Tab, matching how a native <dialog> would
// behave, without the added complexity of a full focus trap.
function applyMeaningVisibility() {
  el.quizMeaning.classList.toggle('hidden', !SettingsManager.get('showMeaning'));
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

initSettingsPanel();
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
function pickQuestions(itemList, mode, grade, count) {
  const remaining = itemList.map((entry) => ({ id: ProgressManager.getQuestionId(mode, grade, itemText(entry)), entry }));
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
function buildQuestion(target, itemList, mode, grade) {
  const correctReading = shuffle(target.readings)[0];
  const question = {
    id: ProgressManager.getQuestionId(mode, grade, itemText(target)),
    text: itemText(target),
    reading: correctReading,
    meaning: target.meaning,
    grade: target.grade,
    frequency: target.frequency,
  };
  const distractors = DistractorGenerator.generate(question, itemList);
  const options = shuffle([correctReading, ...distractors]);
  return {
    text: question.text,
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

const MODE_FILE_PREFIX = { kanji: 'grade', word: 'words', sentence: 'sentences' };

async function loadData(mode, grade) {
  const file = `${MODE_FILE_PREFIX[mode]}${grade}`;
  const res = await fetch(`data/${file}.json`);
  if (!res.ok) throw new Error(`Failed to load ${file} data (HTTP ${res.status})`);
  return res.json();
}

async function startGrade(mode, grade) {
  el.loadError.classList.add('hidden');
  try {
    state.mode = mode;
    state.grade = grade;
    state.itemList = await loadData(mode, grade);
    if (mode === 'sentence') {
      state.itemList = state.itemList.map((entry) => ({ ...entry, readings: entry.readings.map(coreReading) }));
    }
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
  const picks = pickQuestions(state.itemList, state.mode, state.grade, count);
  state.questions = picks.map((entry) => buildQuestion(entry, state.itemList, state.mode, state.grade));
  state.index = 0;
  state.score = 0;
  state.missed = [];
  showScreen('quiz');
  renderQuestion();
}

const INSTRUCTION_TEXT = {
  sentence: ['赤字の読み方は？', 'Choose the reading for the bold red part'],
};
const DEFAULT_INSTRUCTION = ['正しい読み方は？', 'Choose the correct reading'];

function renderQuestion() {
  const q = state.questions[state.index];
  el.quizProgress.textContent = `${state.index + 1} / ${state.questions.length}`;
  el.quizKanji.classList.toggle('is-word', state.mode === 'word');
  el.quizKanji.classList.toggle('is-sentence', state.mode === 'sentence');
  el.quizKanji.innerHTML = state.mode === 'sentence' ? highlightTarget(q.sentence, q.target) : q.text;
  el.quizMeaning.textContent = q.meaning;
  const [instructionMain, instructionSub] = INSTRUCTION_TEXT[state.mode] || DEFAULT_INSTRUCTION;
  el.quizInstruction.innerHTML = `${instructionMain}<span>${instructionSub}</span>`;
  el.quizOptions.innerHTML = '';
  q.options.forEach((reading, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<span class="key-badge key-badge-corner">${i + 1}</span>${readingHTML(reading)}`;
    btn.dataset.reading = reading;
    btn.addEventListener('click', () => handleAnswer(reading, btn));
    el.quizOptions.appendChild(btn);
  });
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
    ];
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

// Keyboard shortcuts, mirrored by the on-screen key-badges: k/w switch mode
// and 1-9 pick a grade on the home screen, 1-4 pick a quiz option (matching
// the 2x2 grid order) and 0 quits, 1/2 retry or return home on the summary
// screen. Arrow keys move focus between on-screen buttons on every screen.
document.addEventListener('keydown', (e) => {
  if (isSettingsOpen()) {
    if (e.key === 'Escape') closeSettings();
    return;
  }

  if (e.ctrlKey || e.metaKey || e.altKey) return;

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

function handleAnswer(selected, btnEl) {
  const q = state.questions[state.index];
  const isCorrect = selected === q.correctReading;

  [...el.quizOptions.children].forEach((btn) => {
    btn.disabled = true;
    if (btn.dataset.reading === q.correctReading) btn.classList.add('correct');
    else if (btn === btnEl) btn.classList.add('incorrect');
  });

  if (state.mode === 'sentence') {
    const { kanjiPart } = splitOkurigana(q.target);
    el.quizKanji.innerHTML = highlightTarget(q.sentence, q.target, furiganaHTML(kanjiPart, q.correctReading));
  }

  ProgressManager.recordAnswer(state.mode, state.grade, q.text, isCorrect, selected);
  if (isCorrect) state.score++;
  else state.missed.push(q);

  renderDashboard();

  // A wrong answer gets a longer pause than a correct one: that's the moment
  // the revealed reading actually needs to be read, and it mirrors how the
  // drill books give extra repetitions to the kanji you missed.
  setTimeout(() => {
    state.index++;
    if (state.index < state.questions.length) renderQuestion();
    else showSummary();
  }, isCorrect ? 700 : 1800);
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
      const display = state.mode === 'sentence' ? highlightTarget(q.sentence, q.target) : q.text;
      row.innerHTML = `<span>${display}</span><span class="missed-item-meaning">${q.meaning}</span><span>${readingHTML(q.correctReading)}</span>`;
      el.summaryMissed.appendChild(row);
    });
  }
}
