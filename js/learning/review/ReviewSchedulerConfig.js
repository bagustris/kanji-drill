// Configuration for the spaced-repetition scheduler. Configuration only — no
// scheduling logic lives here. ReviewScheduler must read every tunable value
// from this object; nothing should be a magic number in its implementation.
//
// Units: intervals are in days, latencies in milliseconds.

const ReviewSchedulerConfig = {
  // Interval granted the first time a question is answered correctly.
  // Anything below 1 would make it due again the same day, which defeats the
  // point of spacing it out at all.
  graduatingIntervalDays: 1,

  // Multiplier applied to the previous interval on a fluent correct answer.
  // 2.5 is SM-2's default ease factor.
  easeFactor: 2.5,

  // Multiplier used instead of easeFactor when the answer was correct but
  // slow (see slowAnswerMs). The goal here is reading fluency, not just
  // accuracy, so a hesitant correct answer earns a much smaller interval
  // bump — you recalled it, but you didn't *know* it.
  hesitantEaseFactor: 1.2,

  // A correct answer slower than this counts as hesitant rather than fluent.
  // ~4s is well past recognition speed for a reading you actually own; a
  // fluent reader answers in well under two.
  slowAnswerMs: 4000,

  // Interval a wrong answer resets to. 0 means "due immediately" — the
  // question goes back into rotation right away rather than waiting a day.
  lapseIntervalDays: 0,

  // Upper bound on interval growth. Past a few months the app can't
  // distinguish "mastered" from "abandoned", and the Kyōiku set is small
  // enough that capping keeps everything in slow rotation instead of letting
  // items disappear for years.
  maxIntervalDays: 180,

  // --- Flashcard (Learn) self-grading -------------------------------------
  // Learn mode has no distractor options to force an honest answer, so it
  // asks the learner to self-grade instead (Again/Hard/Good/Easy, mirroring
  // Anki). These multipliers only apply to nextIntervalDaysForGrade below —
  // the quiz's binary nextIntervalDays is untouched.

  // "Hard": recalled correctly but it took real effort. Same multiplier as
  // hesitantEaseFactor above (both describe "correct but shaky"), kept as a
  // separate knob since the two grading paths may want to diverge later.
  hardEaseFactor: 1.2,

  // "Easy": recalled instantly with no effort — grows the interval beyond
  // what a plain "Good" would, so a truly known item stops coming back as
  // often as one that merely wasn't wrong.
  easyBonus: 1.3,
};
