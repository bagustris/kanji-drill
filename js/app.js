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
};

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

function weightedSample(itemList, mode, grade, count) {
  const pool = [];
  itemList.forEach((entry) => {
    const weight = Storage.weightFor(mode, grade, itemText(entry));
    for (let i = 0; i < weight; i++) pool.push(entry);
  });
  const shuffled = shuffle(pool);
  const picked = [];
  const seen = new Set();
  for (const entry of shuffled) {
    const key = itemText(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(entry);
    if (picked.length === count) break;
  }
  return picked;
}

function buildQuestion(target, itemList) {
  const correctReading = shuffle(target.readings)[0];
  const otherReadings = new Set(
    itemList
      .filter((e) => itemText(e) !== itemText(target))
      .flatMap((e) => e.readings)
      .filter((r) => r !== correctReading)
  );
  const distractors = shuffle([...otherReadings]).slice(0, OPTIONS_COUNT - 1);
  const options = shuffle([correctReading, ...distractors]);
  return { text: itemText(target), meaning: target.meaning, correctReading, options };
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
  const picks = weightedSample(state.itemList, state.mode, state.grade, count);
  state.questions = picks.map((entry) => buildQuestion(entry, state.itemList));
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

// Keyboard shortcuts, mirrored by the on-screen key-badges: k/w switch mode
// and 1-9 pick a grade on the home screen, 1-4 pick a quiz option (matching
// the 2x2 grid order) and 0 quits, 1/2 retry or return home on the summary
// screen.
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;

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

  Storage.recordAnswer(state.mode, state.grade, q.text, isCorrect);
  if (isCorrect) state.score++;
  else state.missed.push(q);

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
    heading.innerHTML = 'まちがえたもの<span>Words you missed</span>';
    el.summaryMissed.appendChild(heading);
    state.missed.forEach((q) => {
      const row = document.createElement('div');
      row.className = 'missed-item';
      row.innerHTML = `<span>${q.text}</span><span>${readingHTML(q.correctReading)}</span>`;
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
