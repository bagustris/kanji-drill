// Renders the Progress Dashboard (home screen). Display-only: every number
// shown here comes from ProgressManager — no stats are computed in this file.

const ProgressView = (() => {
  const MASTERY_ORDER = ['new', 'learning', 'familiar', 'mastered'];
  const MASTERY_LABEL = { new: '新規', learning: '要復習', familiar: '定着中', mastered: 'マスター' };
  const MASTERY_TITLE = { new: 'New', learning: 'Learning', familiar: 'Familiar', mastered: 'Mastered' };

  let els = null;

  function init() {
    els = {
      answered: document.getElementById('progress-answered'),
      correct: document.getElementById('progress-correct'),
      accuracy: document.getElementById('progress-accuracy'),
      modeBreakdown: document.getElementById('progress-mode-breakdown'),
      history: document.getElementById('progress-history-bar'),
      gradeSection: document.getElementById('grade-progress'),
      gradeName: document.getElementById('grade-progress-name'),
      gradeAnswered: document.getElementById('grade-progress-answered'),
      gradeCorrect: document.getElementById('grade-progress-correct'),
      gradeAccuracy: document.getElementById('grade-progress-accuracy'),
      gradeBarFill: document.getElementById('grade-progress-bar-fill'),
      gradePercent: document.getElementById('grade-progress-percent'),
      gradeMastery: document.getElementById('grade-mastery-breakdown'),
    };
  }

  function renderOverall() {
    const stats = ProgressManager.getOverallStats();
    els.answered.textContent = stats.answered;
    els.correct.textContent = stats.correct;
    els.accuracy.textContent = `${stats.accuracy}%`;

    els.modeBreakdown.innerHTML = '';
    [['kanji', '漢字', 'Kanji'], ['word', '言葉', 'Word']].forEach(([mode, label, title]) => {
      const modeStats = ProgressManager.getOverallStatsByMode(mode);
      const row = document.createElement('div');
      row.className = 'progress-mode-row';
      row.innerHTML = `<span class="progress-mode-label" title="${title}">${label}</span>` +
        `<span>${modeStats.answered}問</span><span>${modeStats.accuracy}%</span>`;
      els.modeBreakdown.appendChild(row);
    });
  }

  // Recent answers as a compact row of dots, oldest to newest (left to right).
  function renderHistory() {
    const history = ProgressManager.getRecentHistory(20);
    els.history.innerHTML = '';
    if (history.length === 0) {
      els.history.classList.add('is-empty');
      return;
    }
    els.history.classList.remove('is-empty');
    history.forEach((isCorrect) => {
      const dot = document.createElement('span');
      dot.className = `history-dot ${isCorrect ? 'correct' : 'wrong'}`;
      els.history.appendChild(dot);
    });
  }

  // gradeName is the display label for the currently selected grade (e.g.
  // "3年生"), resolved by the caller so this module doesn't need to know
  // about grade-button markup.
  function renderGrade(mode, grade, gradeName) {
    if (!grade) {
      els.gradeSection.classList.add('hidden');
      return;
    }
    els.gradeSection.classList.remove('hidden');

    const stats = ProgressManager.getGradeStats(mode, grade);
    els.gradeName.textContent = gradeName;
    els.gradeAnswered.textContent = stats.answered;
    els.gradeCorrect.textContent = stats.correct;
    els.gradeAccuracy.textContent = `${stats.accuracy}%`;

    const percent = ProgressManager.getGradeProgressPercent(mode, grade);
    els.gradeBarFill.style.width = `${percent ?? 0}%`;
    els.gradePercent.classList.toggle('hidden', percent === null);
    if (percent !== null) els.gradePercent.textContent = `${percent}%`;

    const breakdown = ProgressManager.getMasteryBreakdown(mode, grade);
    els.gradeMastery.innerHTML = '';
    MASTERY_ORDER.forEach((level) => {
      const chip = document.createElement('span');
      chip.className = 'mastery-chip';
      chip.title = MASTERY_TITLE[level];
      chip.innerHTML = `<span class="mastery-dot mastery-${level}"></span>${MASTERY_LABEL[level]} ${breakdown[level]}`;
      els.gradeMastery.appendChild(chip);
    });
  }

  function renderAll(mode, grade, gradeName) {
    renderOverall();
    renderHistory();
    renderGrade(mode, grade, gradeName);
  }

  return { init, renderOverall, renderHistory, renderGrade, renderAll };
})();
