const ROUND_SIZE = 10;
const OPTIONS_COUNT = 4;

const state = {
  grade: null,
  kanjiList: [],
  questions: [],
  index: 0,
  score: 0,
  missed: [],
};

const el = {
  screens: {
    home: document.getElementById('screen-home'),
    quiz: document.getElementById('screen-quiz'),
    summary: document.getElementById('screen-summary'),
  },
  gradeButtons: document.querySelectorAll('.grade-btn'),
  btnQuit: document.getElementById('btn-quit'),
  btnRetry: document.getElementById('btn-retry'),
  btnHome: document.getElementById('btn-home'),
  quizProgress: document.getElementById('quiz-progress'),
  quizKanji: document.getElementById('quiz-kanji'),
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

function weightedSample(kanjiList, grade, count) {
  const pool = [];
  kanjiList.forEach((entry) => {
    const weight = Storage.weightFor(grade, entry.kanji);
    for (let i = 0; i < weight; i++) pool.push(entry);
  });
  const shuffled = shuffle(pool);
  const picked = [];
  const seen = new Set();
  for (const entry of shuffled) {
    if (seen.has(entry.kanji)) continue;
    seen.add(entry.kanji);
    picked.push(entry);
    if (picked.length === count) break;
  }
  return picked;
}

function buildQuestion(target, kanjiList) {
  const correctReading = shuffle(target.readings)[0];
  const otherReadings = new Set(
    kanjiList
      .filter((e) => e.kanji !== target.kanji)
      .flatMap((e) => e.readings)
      .filter((r) => r !== correctReading)
  );
  const distractors = shuffle([...otherReadings]).slice(0, OPTIONS_COUNT - 1);
  const options = shuffle([correctReading, ...distractors]);
  return { kanji: target.kanji, correctReading, options };
}

async function loadGrade(grade) {
  const res = await fetch(`data/grade${grade}.json`);
  if (!res.ok) throw new Error(`Failed to load grade ${grade} data (HTTP ${res.status})`);
  return res.json();
}

async function startGrade(grade) {
  el.loadError.classList.add('hidden');
  try {
    state.grade = grade;
    state.kanjiList = await loadGrade(grade);
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
  const count = Math.min(ROUND_SIZE, state.kanjiList.length);
  const picks = weightedSample(state.kanjiList, state.grade, count);
  state.questions = picks.map((entry) => buildQuestion(entry, state.kanjiList));
  state.index = 0;
  state.score = 0;
  state.missed = [];
  showScreen('quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.index];
  el.quizProgress.textContent = `${state.index + 1} / ${state.questions.length}`;
  el.quizKanji.textContent = q.kanji;
  el.quizOptions.innerHTML = '';
  q.options.forEach((reading) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = reading;
    btn.addEventListener('click', () => handleAnswer(reading, btn));
    el.quizOptions.appendChild(btn);
  });
}

function handleAnswer(selected, btnEl) {
  const q = state.questions[state.index];
  const isCorrect = selected === q.correctReading;

  [...el.quizOptions.children].forEach((btn) => {
    btn.disabled = true;
    if (btn.textContent === q.correctReading) btn.classList.add('correct');
    else if (btn === btnEl) btn.classList.add('incorrect');
  });

  Storage.recordAnswer(state.grade, q.kanji, isCorrect);
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
  el.summaryScore.textContent = `${state.score} / ${state.questions.length} 正解`;
  el.summaryMissed.innerHTML = '';
  if (state.missed.length > 0) {
    const heading = document.createElement('h3');
    heading.textContent = 'まちがえた漢字';
    el.summaryMissed.appendChild(heading);
    state.missed.forEach((q) => {
      const row = document.createElement('div');
      row.className = 'missed-item';
      row.innerHTML = `<span>${q.kanji}</span><span>${q.correctReading}</span>`;
      el.summaryMissed.appendChild(row);
    });
  }
}

el.gradeButtons.forEach((btn) => {
  btn.addEventListener('click', () => startGrade(Number(btn.dataset.grade)));
});

el.btnQuit.addEventListener('click', () => showScreen('home'));
el.btnHome.addEventListener('click', () => showScreen('home'));
el.btnRetry.addEventListener('click', () => startRound());
