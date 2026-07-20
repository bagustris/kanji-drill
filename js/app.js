const ROUND_SIZE = 10;
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
  quizOptions: document.getElementById('quiz-options'),
  summaryScore: document.getElementById('summary-score'),
  summaryMissed: document.getElementById('summary-missed'),
  fileWarning: document.getElementById('file-protocol-warning'),
  loadError: document.getElementById('load-error-banner'),
  btnResetGrade: document.getElementById('btn-reset-grade'),
};

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
  });
}

function renderDashboard() {
  ProgressView.renderAll(state.mode, state.grade, gradeDisplayName(state.grade));
}

registerTotalQuestionCounts();
ProgressView.init();
renderDashboard();

el.btnResetGrade.addEventListener('click', () => {
  if (!state.grade) return;
  const name = gradeDisplayName(state.grade);
  if (!confirm(`${name}の成績をリセットしますか？\nReset progress for ${name}?`)) return;
  ProgressManager.reset(state.mode, state.grade);
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

// Kanji entries use `kanji`, word entries use `word` — same shape otherwise.
function itemText(entry) {
  return entry.kanji ?? entry.word;
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
  return { text: question.text, meaning: target.meaning, correctReading, options };
}

async function loadData(mode, grade) {
  const file = mode === 'word' ? `words${grade}` : `grade${grade}`;
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
  const count = Math.min(ROUND_SIZE, state.itemList.length);
  const picks = pickQuestions(state.itemList, state.mode, state.grade, count);
  state.questions = picks.map((entry) => buildQuestion(entry, state.itemList, state.mode, state.grade));
  state.index = 0;
  state.score = 0;
  state.missed = [];
  showScreen('quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.index];
  el.quizProgress.textContent = `${state.index + 1} / ${state.questions.length}`;
  el.quizKanji.textContent = q.text;
  el.quizKanji.classList.toggle('is-word', state.mode === 'word');
  el.quizMeaning.textContent = q.meaning;
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
function getNavGroups() {
  if (state.screen === 'home') {
    const grids = document.querySelectorAll('.grade-grid');
    const groups = [
      { items: [...el.modeButtons], cols: 2 },
      { items: [...grids[0].children], cols: 2 },
      { items: [...grids[1].children], cols: 2 },
    ];
    const gradeProgress = document.getElementById('grade-progress');
    if (!gradeProgress.classList.contains('hidden')) {
      groups.push({ items: [el.btnResetGrade], cols: 1 });
    }
    return groups;
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

  ProgressManager.recordAnswer(state.mode, state.grade, q.text, isCorrect, selected);
  if (isCorrect) state.score++;
  else state.missed.push(q);

  renderDashboard();

  setTimeout(() => {
    state.index++;
    if (state.index < state.questions.length) renderQuestion();
    else showSummary();
  }, 700);
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
      row.innerHTML = `<span>${q.text}</span><span class="missed-item-meaning">${q.meaning}</span><span>${readingHTML(q.correctReading)}</span>`;
      el.summaryMissed.appendChild(row);
    });
  }
}

el.modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    el.modeButtons.forEach((b) => b.classList.toggle('active', b === btn));
    const mode = btn.dataset.mode;
    el.gradeCounts.forEach((span) => {
      span.textContent = mode === 'word' ? span.dataset.wordCount : span.dataset.kanjiCount;
    });
    el.gradeButtons.forEach((gbtn) => { gbtn.dataset.mode = mode; });
  });
});

el.gradeButtons.forEach((btn) => {
  btn.dataset.mode = 'kanji';
  btn.addEventListener('click', () => startGrade(btn.dataset.mode, Number(btn.dataset.grade)));
});

el.btnQuit.addEventListener('click', () => showScreen('home'));
el.btnHome.addEventListener('click', () => showScreen('home'));
el.btnRetry.addEventListener('click', () => startRound());
