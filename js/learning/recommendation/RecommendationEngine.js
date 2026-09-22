// Turns the per-grade/にがて numbers ProgressManager already tracks into a
// single "what to do next" nudge for the home screen — the `recommendation/`
// piece named in README's "Roadmap for future learning components", sitting
// above QuestionSelector rather than replacing it. Pure: takes the stats it
// needs as arguments and touches neither ProgressManager nor the DOM, the
// same contract the scoring strategies under js/learning/ follow.

const RecommendationEngine = (() => {
  // Below this accuracy (with at least one answer logged) a grade counts as
  // struggling — mirrors ProgressManager.getGradeStatus's own 'learning'
  // threshold, so this recommendation and the grade-row status dot never
  // disagree about which grades are weak.
  const WEAK_GRADE_ACCURACY = 50;

  // `grades`: every grade for the current mode, in ascending grade-number
  // order (the order the grade buttons render in — see renderDashboard),
  // as { grade, name, answered, accuracy }. `leechCount`:
  // ProgressManager.getLeechCount(mode) for that same mode.
  //
  // Priority mirrors how a teacher would triage a learner's progress: fix a
  // grade that's actively struggling before tidying up scattered weak spots,
  // only suggest moving forward once both are clear, and fall back to
  // maintenance review once nothing is currently weak.
  function recommend({ grades, leechCount }) {
    const studied = grades.filter((g) => g.answered > 0);

    const weakestGrade = studied
      .filter((g) => g.accuracy < WEAK_GRADE_ACCURACY)
      .sort((a, b) => a.accuracy - b.accuracy)[0];
    if (weakestGrade) {
      return {
        type: 'grade',
        grade: weakestGrade.grade,
        text: `${weakestGrade.name}の正答率が下がっています`,
        sub: `Accuracy in ${weakestGrade.name} has dropped — drill it again`,
      };
    }

    if (leechCount > 0) {
      return {
        type: 'weak',
        text: `にがてが${leechCount}問たまっています`,
        sub: `${leechCount} weak spot${leechCount === 1 ? '' : 's'} waiting for review`,
      };
    }

    const nextGrade = grades.find((g) => g.answered === 0);
    if (nextGrade) {
      return {
        type: 'grade',
        grade: nextGrade.grade,
        text: studied.length === 0 ? `${nextGrade.name}から始めましょう` : `${nextGrade.name}に進みましょう`,
        sub: studied.length === 0 ? `Start with ${nextGrade.name}` : `Move on to ${nextGrade.name}`,
      };
    }

    return {
      type: 'review',
      text: '全学年が定着中です。復習で維持しましょう',
      sub: 'Everything looks solid — keep it fresh with cumulative review',
    };
  }

  return { recommend };
})();
