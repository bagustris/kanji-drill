// Renders the Progress Dashboard (home screen). Display-only: every number
// shown here comes from ProgressManager — no stats are computed in this file.

const ProgressView = (() => {
  let els = null;

  function init() {
    els = {
      answered: document.getElementById('progress-answered'),
      correct: document.getElementById('progress-correct'),
      accuracy: document.getElementById('progress-accuracy'),
      gradeSection: document.getElementById('grade-progress'),
      gradeName: document.getElementById('grade-progress-name'),
      gradeAnswered: document.getElementById('grade-progress-answered'),
      gradeCorrect: document.getElementById('grade-progress-correct'),
      gradeAccuracy: document.getElementById('grade-progress-accuracy'),
      gradeBarFill: document.getElementById('grade-progress-bar-fill'),
      gradePercent: document.getElementById('grade-progress-percent'),
    };
  }

  function renderOverall() {
    const stats = ProgressManager.getOverallStats();
    els.answered.textContent = stats.answered;
    els.correct.textContent = stats.correct;
    els.accuracy.textContent = `${stats.accuracy}%`;
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
  }

  return { init, renderOverall, renderGrade };
})();
