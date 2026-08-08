// Renders the Progress Dashboard (home screen). Display-only: every number
// shown here comes from ProgressManager — no stats are computed in this file.

const ProgressView = (() => {
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
      gradeList: document.getElementById('grade-progress-list'),
    };
  }

  function renderOverall() {
    const stats = ProgressManager.getOverallStats();
    els.answered.textContent = stats.answered;
    els.correct.textContent = stats.correct;
    els.accuracy.textContent = `${stats.accuracy}%`;

    els.modeBreakdown.innerHTML = '';
    [['kanji', '漢字', 'Kanji'], ['word', '言葉', 'Word'], ['sentence', '文章', 'Sentence'], ['reverse', '逆引き', 'Reverse']].forEach(([mode, label, title]) => {
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

  // One row per grade (in the order given), instead of just the grade the
  // learner last played, so weak grades are visible at a glance. `grades` is
  // [{grade, name}, ...] with `name` resolved by the caller (e.g. "3年生")
  // so this module doesn't need to know about grade-button markup.
  function renderGradeList(mode, grades) {
    els.gradeList.innerHTML = '';
    grades.forEach(({ grade, name }) => {
      const stats = ProgressManager.getGradeStats(mode, grade);
      const percent = ProgressManager.getGradeProgressPercent(mode, grade);
      const status = ProgressManager.getGradeStatus(mode, grade);

      const row = document.createElement('div');
      row.className = 'grade-row';
      row.dataset.status = status;
      row.innerHTML = `
        <span class="mastery-dot mastery-${status}" title="${MASTERY_TITLE[status]} / ${MASTERY_LABEL[status]}"></span>
        <span class="grade-row-name">${name}</span>
        <div class="progress-bar"><div class="progress-bar-fill" style="width: ${percent ?? 0}%"></div></div>
        <span class="grade-row-percent">${percent === null ? '—' : `${percent}%`}</span>
        <span class="grade-row-accuracy">${stats.answered > 0 ? `${stats.accuracy}%` : '—'}</span>
        <button type="button" class="grade-row-reset" data-grade="${grade}" aria-label="Reset ${name} progress">&times;</button>
      `;
      els.gradeList.appendChild(row);
    });
  }

  function renderAll(mode, grades) {
    renderOverall();
    renderHistory();
    renderGradeList(mode, grades);
  }

  return { init, renderOverall, renderHistory, renderGradeList, renderAll };
})();
