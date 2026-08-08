# 漢字ドリル — Kanji Drill

The goal of this project is to help learners of Japanese Kanji (漢字) by **mimicking the way Japanese elementary school students are taught**. The main concept is to focus on associating the kanji directly with meaningful words. There are no on'yomi/kun'yomi distinctions (as in elementary school), you will learn which reading is used in which word, and the app will adaptively prioritize kanji you struggle with.

It is a static, browser-only kanji quiz covering all six years of Japanese elementary school and three years of junior high school. Pick a grade, answer multiple-choice reading questions, and the app quietly tracks which kanji you're shaky on so they come up more often next time.

No backend, no build step, no framework — just HTML, CSS, and JavaScript,
designed to run as-is on GitHub Pages.

The app currently has three drill types with focus on reading:  
1. Recognition recall (Kanji)
2. Reading in context (words) 
3. Sentences reading (sentences)  

The main concept is "how kanji is read in particular words" and "how to associate kanji with useful words". 

## Features

- **All 1,026 Kyōiku kanji** (教育漢字), grouped by grade 1 through 6 under the
  2020 curriculum revision (80 / 160 / 200 / 202 / 193 / 191 kanji per grade).
- **Multiple-choice reading quiz** — see a kanji, pick its reading from four
  hiragana options. Wrong answers aren't random: a small adaptive engine
  ranks candidates by reading/meaning similarity so the distractors are
  ones you're actually likely to confuse the answer with.
- **Sentence reading quiz** — the same multiple-choice format, but the
  question is a short original example sentence with one word or inflected
  kanji highlighted (bold, colored), so you practice the reading in context
  instead of in isolation. Currently seeded for grades 1-2 (one sentence per
  kanji, 80 + 160), organized into the same kind of thematic units a real
  kokugo textbook uses — see "Sentence data" below.
- **Reverse quiz (逆引き)** — the mirror direction of the reading quiz: you're
  shown a reading **and** its meaning, and pick the matching kanji from four.
  It drills the same kanji as the reading quiz but exercises the opposite
  recall (sound → glyph), and is tracked as its own skill with an independent
  spaced-repetition schedule (a separate `reverse…` progress namespace, not
  merged with reading-quiz history). Its distractors are chosen for *reverse*
  confusability — homophones sharing the exact reading, then same-first-mora
  and same-meaning kanji — since the meaning on screen is what forces you to
  discriminate between kanji that sound alike. See "Adaptive Distractor
  Generation" below.
- **Spoken readings (読み上げ)** — an optional setting (**off by default**)
  that reads the reading aloud via the browser's built-in speech synthesis (no
  network, no bundled audio), adding the auditory channel an elementary
  classroom leans on. Forward modes speak the reading once it's revealed; the
  reverse quiz speaks it up front (it's already on screen). Turn it on in
  Settings; degrades to silence wherever no Japanese voice exists.
- **Auto-advance by default (自動で次へ)** — after you answer, the quiz reveals
  the reading and moves on after a short timed pause. Turn the setting **off**
  to advance manually instead (tap/click, or → / Enter / Space), giving
  unlimited time to read what you missed.
- **Extra help on weak spots (にがて)** — a kanji you keep missing (seen ≥ 3
  times, right less than half) is flagged a *leech* and gets scaffolding: its
  meaning is shown as a hint even when "show meaning" is off, and a small
  weak-spot marker appears — mirroring a teacher spending more time on a
  stubborn kanji. (The distractor engine already resurfaces your past wrong
  answers for the same item.)
- **Spaced repetition** — every kanji carries its own review interval that
  grows as you answer it correctly (1 → 2.5 → 6.25 → 15.6 days …) and resets
  when you miss it, so you spend your time on what you're about to forget
  rather than re-drilling what you already own. Progress is saved per kanji in
  `localStorage`, so it persists across sessions on the same device.
- **Fluency-aware, not just accuracy-aware** — answer latency is tracked per
  kanji. A reading you get right but have to *think* about earns a much
  smaller interval bump than one you read instantly, and keeps coming back
  until it's automatic — which is the actual goal of drilling.
- **Cumulative review (ふくしゅう)** — a round that pools every grade you've
  already studied, instead of drilling one grade in isolation. Real schooling
  never drops earlier kanji; this is what keeps grade 1-2 from decaying while
  you work through grade 5. It introduces **no new material** — only grades
  you've already started are pooled — so it stays a review, not a firehose.
- **Mobile-first UI** — a single quiz card and a two-column answer grid that
  works comfortably on a phone.

> [!NOTE]
> Progress is stored in your browser's `localStorage`, per device. There's no
> account or sync — clearing site data (or switching browsers) resets it.

## Getting started

This is a static site with no dependencies to install. The only requirement
is serving it over HTTP rather than opening `index.html` directly, since the
kanji data is loaded with `fetch()`, which browsers block on the `file://`
protocol.

```bash
git clone <this-repo>
cd kanji-drill
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser. Any static file server works
just as well — `npx serve`, `php -S localhost:8000`, etc.

If port 8000 is already in use (`OSError: [Errno 98] Address already in
use`), find and stop whatever's holding it:

```bash
lsof -i :8000 -sTCP:LISTEN -P -n   # shows the PID
kill <PID>                         # or `kill -9 <PID>` if it won't stop
```

Or just serve on a different port with `python3 -m http.server 8001`.

## Project structure

```
index.html        Markup for the three screens (grade picker, quiz, summary)
style.css          Layout and theming
js/app.js          Screen navigation, question generation, quiz flow
js/progress.js      Progress tracking (localStorage), via ProgressManager
js/progress-view.js Renders the Progress Dashboard from ProgressManager data
js/learning/         Adaptive Learning Engine (question selection, review scheduling, distractor generation)
data/grade1.json … grade9.json      Kanji + reading data, one file per grade
data/words1.json … words9.json     Word + reading data, one file per grade
data/sentences1.json, sentences2.json  Sentence + reading data (grades 1-2 so far)
```

Each entry in a `data/gradeN.json` file looks like:

```json
{ "kanji": "口", "readings": ["くち"] }
```

`readings` is almost always a single hiragana reading — the one a kid at that
grade would encounter first, not necessarily the "primary" dictionary reading
(so 生 is せい as in 先生, not its kun'yomi). A small number of kanji list two
readings, most notably the numbers 一〜十, which are taught as both a digit
reading and a counting word (一 → いち / ひとつ) from day one.

> [!WARNING]
> Readings were chosen by editorial judgment call, cross-referenced against
> multiple kanji reference sites — not copied verbatim from an official MEXT
> answer key. If you spot one that feels off for a given grade, the JSON
> files are plain data and easy to hand-edit.

### Sentence data

Each entry in `data/sentencesN.json` looks like:

```json
{ "sentence": "学校へいく。", "target": "学校", "readings": ["がっこう"], "meaning": "school", "translation": "I go to school." }
```

`target` is the exact substring of `sentence` being quizzed — either a bare
kanji, a kanji plus its okurigana (e.g. `"立てる"` with reading `"た.てる"`), or
a two-kanji word — and gets colored (not underlined) in the quiz card. Every
other word in the sentence is plain hiragana (or another already-covered
kanji used as natural context), keeping each sentence readable at that grade
level.

Two fields carry different kinds of "meaning" on purpose:

- `meaning` is the target's own word/kanji gloss (e.g. `"school"`) — same as
  in `data/gradeN.json`/`data/wordsN.json` — and is what the distractor
  engine's meaning-similarity scoring uses under the hood, so it stays
  word-level instead of being diluted by English function words shared
  across unrelated sentence translations.
- `translation` is an English translation of the whole `sentence`, and is
  what's actually shown on the quiz card (the "Show meaning" setting
  displays this instead of `meaning` when in Sentence mode).

For a `target` with okurigana (a dot-notation reading like `"た.てる"`),
Sentence mode's answer choices only show the part before the dot (`"た"`) —
the trailing okurigana kana is already written out in the sentence itself,
so only the kanji's own reading is actually being quizzed, the same way
furigana only annotates the kanji portion of an inflected word.

Once a sentence question is answered, the reading is revealed as **furigana
in place** (ruby text over the kanji, okurigana left plain beside it), and a
wrong answer holds that reveal on screen noticeably longer than a correct
one. Both mirror how くりかえし漢字ドリル and こくご work: readings are printed
above the kanji inside a real sentence, and the kanji you miss are the ones
you spend more time on.

> [!NOTE]
> These are original example sentences written for this project, not
> excerpts from any commercial textbook (e.g. くりかえし漢字ドリル or こくご) —
> reproducing copyrighted textbook text wasn't an option, so each sentence
> was written from scratch to exercise the same kanji/reading in a similarly
> simple, everyday context. The ordering of entries within each
> `sentencesN.json` is grouped into thematic units (new term & school life,
> family & body, spring/weather, then a broader sweep of nature/town/number
> kanji) rather than dictionary order — inspired by how a real kokugo
> textbook sequences vocabulary by theme and season, without copying its
> actual text. Grades 1-2 are populated so far (80 + 160 sentences); grades
> 3-9 show "準備中" (not ready) and their grade buttons are disabled while
> Sentence mode is selected, until more sentence data is added.

## Progress tracking

Your answer history is saved automatically after every question, entirely in
your browser — there's no backend or account, so it works the same on
GitHub Pages as it does locally.

- Everything is stored under a single `localStorage` key:
  **`kanji-drill-progress`**. It holds per-question stats (times seen,
  correct/wrong, last seen, which wrong readings you've actually picked
  before, the current review interval and due date, and a rolling window of
  your last 5 answer latencies) and per-grade totals (answered/correct), used
  both for the
  "Progress" summary on the home screen, to prioritize kanji you're shaky on
  in later rounds, and to steer which wrong answers show up as multiple-choice
  distractors (see "Adaptive Distractor Generation" below).
- All reads/writes go through the `ProgressManager` module
  (`js/progress.js`) — no other file touches `localStorage` directly.
- Read-only getters go through a memoized snapshot (`readSnapshot()`), while
  the write paths (`recordAnswer`/`reset`) always parse fresh via `load()`.
  This isn't a micro-optimization: `QuestionSelector` asks for stats once per
  candidate per question, and re-parsing the whole blob each time made a
  cumulative round over grades 1-9 (2,136 candidates × 10 questions against a
  ~250KB blob) take **~34 seconds**. Memoizing the parse brought the same
  round to ~230ms. The cache is invalidated by comparing the raw stored
  string, so a write from another tab is picked up automatically.
- The snapshot is **shared and must never be mutated**. Getters copy what they
  hand out, including nested `latencies`/`confusions` — a bare spread is
  shallow, and aliasing those would let a caller silently corrupt the cache.
- **To reset your progress**, open your browser's DevTools console on this
  site and run:

  ```js
  localStorage.removeItem('kanji-drill-progress')
  ```

  (or clear all site data for this domain from your browser settings). The
  app will start with a clean slate on the next reload.

## Progress Dashboard

The bottom of the home screen (below the grade picker) shows a small
dashboard, powered entirely by the data `ProgressManager` already tracks —
no extra storage or network calls:

- **Overall** — total questions answered, correct answers, and accuracy
  across every grade and mode you've played, plus a breakdown split by quiz
  mode (kanji vs. word vs. sentence) and a "Recent" sparkline of your last 20
  answers (green = correct, red = incorrect).
- **Progress by Grade** — one row per grade for the currently selected mode
  (kanji, word, or sentence), each with a completion bar (questions answered
  at least once ÷ total questions in that grade's pool), the completion percentage,
  and accuracy so far. A colored dot per row shows the grade's status — new
  (gray, untouched), learning (red, accuracy below 50% — needs more
  practice), familiar (yellow), or mastered (green, high completion and
  accuracy) — the same levels the Adaptive Learning Engine uses to
  prioritize questions, now surfaced per grade so you can spot which grades
  need work at a glance instead of only seeing whichever grade you played
  most recently. A small **×** button on each row resets progress for just
  that grade/mode, after a confirmation prompt.

Both sections update immediately (no reload needed) whenever you answer a
question or pick a new grade, and stay accurate across reloads since they're
just a read-only view over the same `kanji-drill-progress` localStorage
data described above. Rendering lives in `js/progress-view.js`
(`ProgressView`), which only displays numbers computed by `ProgressManager`
— it does no calculation of its own.

## Adaptive Learning Engine

Question order within a round is no longer plain random — it's chosen by a
small **Adaptive Learning Engine** that lives under `js/learning/` (this
project has no `src/` directory, so the module is nested there instead, but
its internal layout follows the `src/learning/...` structure you'd expect
from a plain-JS strategy-pattern module). Everything runs client-side, reads
only from `ProgressManager`, and adds no new storage or network calls.

```
Quiz (js/app.js)
  ↓
QuestionSelector.select(pool)                    js/learning/QuestionSelector.js
  ↓
ProgressManager.getQuestionStats(question.id)     js/progress.js
  ↓
config.strategy.score(question, stats, config)    js/learning/strategies/SpacedRepetitionStrategy.js
  ↓
rank candidates → keep top N% → pick one at random (avoiding recent repeats)
  ↓
return the next question
```

- **`js/learning/QuestionSelector.js`** — the only file that touches
  `ProgressManager`, and it owns both randomness and the "recently shown"
  queue. It builds each
  question's stats (adding precomputed `daysSinceLastSeen`, `daysUntilDue`,
  and `medianLatencyMs` so the strategy
  itself never needs the system clock), scores every candidate through the
  configured strategy, ranks them, keeps the top
  `selection.topCandidateRatio` slice, and picks randomly from that slice —
  skipping questions shown in the last `selection.recentHistorySize` picks
  when enough other candidates remain. That in-memory "recent" queue is
  session-only and is never persisted. `app.js` additionally excludes
  already-picked questions from the pool between calls within one 10-question
  round, so a single round never repeats a question, while the selector's own
  queue keeps things varied across rounds/retries in the same visit.
- **`js/learning/QuestionSelectionStrategy.js`** — the formal contract every
  strategy must implement (documented with JSDoc, since the project is plain
  JavaScript with no build step or TypeScript), plus a tiny
  `isValid(strategy)` runtime check. `QuestionSelector` depends only on this
  contract, never on a specific strategy implementation:

  ```js
  score(question, stats, config) -> number
  ```

  A conforming strategy must be a **pure function**: no `ProgressManager` or
  `localStorage` access, no randomness, no mutating its arguments, and
  identical inputs always produce the identical output. That's what makes it
  independently unit-testable, benchmarkable, and swappable.
- **`js/learning/strategies/SpacedRepetitionStrategy.js`** — the **default**
  strategy. Instead of nudging questions up as time passes, it asks the
  spaced-repetition question — *is this due?* — where every question carries
  its own interval, set by `ReviewScheduler` (see "Review scheduling" below).
  For each candidate:

  ```
  score = weights.unseen  (flat, for never-answered questions — no other term applies)

  score = weights.due           * dueness
        + weights.recentMistake * recentMistake
        + weights.errorRate     * errorRate
        + weights.hesitancy     * hesitancy
  ```

  `dueness` is `-daysUntilDue / interval`, clamped to
  `[normalization.minDuenessFactor, normalization.maxOverdueFactor]` — so it's
  positive once a question is overdue, scaled by how overdue it is *relative
  to the interval it had earned*, and negative when it isn't due yet. Being
  five days late matters far more for a 1-day interval than a 60-day one.
  `hesitancy` scales 0→1 as the question's median answer latency runs from
  `normalization.fluentAnswerMs` to `normalization.hesitantAnswerMs`, so a
  reading you get right but have to *think* about keeps coming back.

  With the default weights that yields the ordering:

  ```
  heavily overdue (240)  >  unseen (100)  >  just due (0)  >  not yet due (-60)
  ```

  Overdue material deliberately outranks new material: rescuing a kanji
  you're about to forget beats stacking another one on top of it.

  Questions with no `dueAt` (progress saved before scheduling existed) are
  treated as due now, so old `localStorage` data migrates itself simply by
  being answered once — there's no migration step.
- **`js/learning/strategies/WeightedScoreStrategy.js`** — the previous
  default, kept as a swappable alternative. For each candidate:

  ```
  score = weights.unseen        * unseen
        + weights.recentMistake * recentMistake
        + weights.errorRate     * errorRate
        + weights.reviewDelay   * reviewDelay
        - weights.masteryPenalty * mastery
  ```

  where `unseen` is 1 for a never-answered question, `recentMistake` is 1 if
  the last attempt was wrong, `errorRate` is `wrong / seen`, `mastery` is
  `correct / seen`, and `reviewDelay` is `daysSinceLastSeen` normalized by
  `normalization.reviewDelayDays` and clamped to
  `normalization.maxReviewDelayFactor` (all 0 for a never-seen question, and
  never divides by zero).
- **`js/learning/QuestionSelectorConfig.js`** — configuration only, no logic.
  Every tunable value the selector/strategy use lives here so there are no
  magic numbers in the implementation:

  | Key | Meaning |
  | --- | --- |
  Both bundled strategies read from the same `weights`/`normalization`
  objects, so switching `strategy` needs no other edit. Keys used by only one
  of them are marked.

  | Key | Meaning |
  | --- | --- |
  | `strategy` | The active `QuestionSelectionStrategy` implementation (`SpacedRepetitionStrategy` by default). |
  | `weights.unseen` | Multiplier prioritizing never-answered questions. |
  | `weights.recentMistake` | Multiplier boosting a question missed on its last attempt. |
  | `weights.errorRate` | Multiplier scaling with a question's wrong/seen ratio. |
  | `weights.due` | *(SpacedRepetition)* Multiplier on the dueness factor. |
  | `weights.hesitancy` | *(SpacedRepetition)* Multiplier boosting questions answered correctly but slowly. |
  | `weights.reviewDelay` | *(WeightedScore)* Multiplier scaling with time since the question was last seen. |
  | `weights.masteryPenalty` | *(WeightedScore)* Multiplier reducing the score of well-known (high correct/seen) questions. |
  | `selection.topCandidateRatio` | Fraction of ranked candidates eligible for the final random pick (e.g. `0.20` = top 20%). |
  | `selection.recentHistorySize` | Size of the in-memory "recently shown" queue `QuestionSelector` avoids repeating. |
  | `normalization.maxOverdueFactor` | *(SpacedRepetition)* Caps dueness so long-untouched questions don't dominate indefinitely. |
  | `normalization.minDuenessFactor` | *(SpacedRepetition)* Floors dueness for questions that aren't due yet. |
  | `normalization.fluentAnswerMs` | *(SpacedRepetition)* At or below this median latency, hesitancy is 0. |
  | `normalization.hesitantAnswerMs` | *(SpacedRepetition)* At or above this median latency, hesitancy is 1. |
  | `normalization.reviewDelayDays` | *(WeightedScore)* Number of days considered "one review cycle". |
  | `normalization.maxReviewDelayFactor` | *(WeightedScore)* Caps the normalized review-delay term. |

### Review scheduling

**`js/learning/review/ReviewScheduler.js`** decides *when* a question comes
back, using an SM-2-style ladder minus the per-item ease adjustment. It's pure
in the same way strategies are: it returns an **interval in days**, never a
due date, so it never reads the system clock. Stamping
`dueAt = lastSeen + interval` is `ProgressManager.recordAnswer`'s job — which
is what keeps the scheduler independently testable.

| Answer | Next interval |
| --- | --- |
| Wrong | `lapseIntervalDays` (0 — due immediately, back in rotation now) |
| First correct | `graduatingIntervalDays` (1 day) |
| Correct, fluent | `previous × easeFactor` (2.5×) |
| Correct, slower than `slowAnswerMs` | `previous × hesitantEaseFactor` (1.2×) |

capped at `maxIntervalDays`. So a kanji answered fluently four times running
climbs 1 → 2.5 → 6.25 → 15.6 days and stays out of your way, while one you
keep hesitating over creeps up at 1.2× and stays in rotation.

Latency carries the signal that per-item ease would otherwise carry: the goal
here is *reading fluency*, not just accuracy, so a correct-but-slow answer is
treated as weaker evidence than a fluent one. Tunables live in
`js/learning/review/ReviewSchedulerConfig.js`.

Answer latency is measured in `js/app.js` (a `performance.now()` stamp taken
once the options are on screen, so it's time-to-answer rather than
time-to-render) and stored by `ProgressManager` as a rolling window of the
last 5 samples per question. Two deliberate choices there:

- **Median, not mean** — one answer interrupted by a phone call shouldn't make
  a kanji look permanently shaky.
- **Samples over 30s are dropped, not clamped** — past that the learner almost
  certainly switched tabs, and that isn't a measurement of anything. Clamping
  would silently record a fake 30-second "answer".

### Cumulative review

The **ふくしゅう** button under the grade pickers starts a round pooling every
grade you've already drilled in the current mode (it stays disabled, showing
`学年を1つ終えると使えます`, until at least one grade has progress; once
enabled it lists which grades it will cover, e.g. `1年生・3年生`).

Only *studied* grades are pooled, deliberately. Pooling all nine would flood a
beginner: unseen questions score `weights.unseen` (100), so a grade-1 learner
would get a round of mostly never-seen junior-high kanji. Restricting the pool
to grades already started means review introduces nothing new — it only stops
what you've learned from decaying, which is the thing single-grade drilling
can't do.

**The invariant to preserve:** every loaded entry is tagged with
`sourceGrade` (the grade whose file it came from), and a question's progress
is always keyed by *its own* grade — `grade2:山` whether it was drilled from
the grade-2 button or surfaced in a review round. `state.grade` is `null`
during review precisely so nothing accidentally keys progress by "the round's
grade", which doesn't exist there. Key it any other way and one kanji's
history forks into two records, splitting its review schedule and corrupting
the per-grade dashboard totals.

Because `sourceGrade` is applied in **both** kinds of round, nothing
downstream branches on which kind it is — `pickQuestions()` and
`buildQuestion()` just read `entry.sourceGrade`.

> [!NOTE]
> A cumulative pool also feeds the distractor engine, which is what made
> `DistractorConfig.selection.maxCandidates` bite a second time — see "Known
> bug fixed: distractor diversity collapse".

### Implementing a new strategy

Add a module (e.g. `js/learning/strategies/LeitnerStrategy.js`) exporting an
object with a `score(question, stats, config)` function that follows the
`QuestionSelectionStrategy` contract above, add its `<script>` tag to
`index.html` before `js/app.js`, and point
`QuestionSelectorConfig.strategy` at it. `QuestionSelector` needs no changes
— it only ever calls `config.strategy.score(...)`.

### Roadmap for future learning components

`js/learning/` is scoped to leave room for more adaptive-learning pieces
without restructuring the project — each would be an independent, pure
module the selector or quiz can call into:

- `strategies/` — alternative scoring algorithms such as **SM-2**, **FSRS**,
  or **Leitner**-style box scheduling can each be added as a sibling to
  `WeightedScoreStrategy.js` and swapped in via `QuestionSelectorConfig`
  without touching `QuestionSelector.js`.
- `mastery/` — a `MasteryEstimator` could replace the simple `correct/seen`
  ratio with a more principled per-question mastery model feeding both the
  dashboard and the selector.
- ~~`review/` — a `ReviewScheduler` could own spaced-repetition due dates~~
  **Built** — see "Review scheduling" above.
- `recommendation/` — a `RecommendationEngine` could suggest which grade or
  mode to study next based on overall progress, sitting above
  `QuestionSelector` rather than replacing it.

## Adaptive Distractor Generation

Multiple-choice wrong answers are no longer a random pick from the grade's
other readings — they're chosen by a **DistractorGenerator** that lives
under `js/learning/distractors/`, sitting alongside the question-selection
engine described above. Same rules apply: everything runs client-side, adds
no new storage beyond one small addition to the existing `ProgressManager`
record (below), and touches nothing but the data already loaded for the
current grade/mode.

It's deliberately **not** built around linguistic categories like on'yomi/
kun'yomi or JLPT level — a kid in Japanese elementary or junior high school
doesn't review kanji by reasoning "is this the on'yomi or the kun'yomi
reading?"; that's a foreign-learner/dictionary framing. What actually
mirrors how a teacher (or a flashcard deck) targets review is: does this
reading *look and sound* like the right answer, does it *mean* something
similar, and — most powerfully — has *this specific learner* actually
confused these two before. That last signal is why the engine now also
draws on the same per-question history `ProgressManager` already tracks.

```
buildQuestion() (js/app.js)
  ↓
DistractorGenerator.generate(question, itemList)      js/learning/distractors/DistractorGenerator.js
  ↓
ProgressManager.getConfusions(question.id)             js/progress.js — this learner's past wrong picks for this question
  ↓
build candidate pool: every other item's readings, excluding the correct answer, tagged with confusion counts
  ↓
SimilarityFeatures.compute(question, candidate)       js/learning/distractors/features/SimilarityFeatures.js
  ↓
config.strategy.score(features, config)               js/learning/distractors/strategies/WeightedDistractorStrategy.js
  ↓
rank candidates → drop duplicate readings → keep top N
  ↓
return distractors → buildQuestion() shuffles them in with the correct answer
```

- **`js/learning/distractors/DistractorGenerator.js`** — the orchestrator,
  and the only file in this module that touches `ProgressManager` (mirroring
  `QuestionSelector`'s role in the question-selection engine above). Every
  reading belonging to every *other* item in the current grade/mode pool is
  a candidate (except the correct answer itself), tagged with its source
  item's metadata plus how many times this learner has actually picked that
  reading wrong for this exact question before
  (`ProgressManager.getConfusions(question.id)`, `{}` when `question.id`
  isn't supplied). It computes similarity features and a score for each
  candidate, sorts descending, then walks the ranking keeping the first
  (best) occurrence of each distinct reading string until it has
  `config.selection.distractorCount` — which is what guarantees no
  duplicate readings, no duplicate answer choices, and the correct answer
  never reappearing as a distractor. If the pool runs out early (a very
  small or repetitive item list), it simply returns fewer distractors
  rather than throwing; `buildQuestion()` shuffles whatever comes back in
  with the correct answer, same as before.

  The same file also exposes **`generateKanji(question, itemList)`** for the
  reverse quiz, which returns distractor *kanji* instead of readings. It
  reuses `SimilarityFeatures` but scores for reverse confusability with a
  separate `config.reverseWeights` block, because reversing the direction
  inverts what a *graded* reading similarity means: forward, せい-vs-せき is a
  hard distractor (you must know the exact reading); reverse, a candidate
  whose reading is せき is trivially eliminable once you half-know the prompt
  reading せい. So only an **exact** homophone counts as a hard reading match
  (a binary flag, not the Levenshtein gradient), alongside meaning overlap (a
  same-meaning kanji is hard precisely because the meaning is on screen), the
  learner's past wrong kanji picks, and a mild same-first-mora nudge. A tiny
  deterministic per-`(question, kanji)` tiebreak keeps the many exact-tie
  candidates (common at grade 1, where true homophones are sparse) from
  collapsing to file order — otherwise 一二三… would surface as the same
  filler in every question and be learnable by elimination.
- **`js/learning/distractors/features/SimilarityFeatures.js`** — pure
  feature extraction, nothing else: no weighting, no ranking, no selection,
  no side effects, no `ProgressManager`/`localStorage` access of its own
  (confusion counts arrive pre-computed on `candidate.confusionCount`, the
  same way meaning/grade/frequency arrive on the candidate object).
  `compute(question, candidate)` returns six independent similarity scores
  in `[0, 1]`:

  | Feature | What it measures |
  | --- | --- |
  | `exactReadingSimilarity` | Whole-reading string similarity (Levenshtein-based), so a near-miss like きょう vs きょく scores high without being a literal duplicate. |
  | `firstMoraSimilarity` | `1` if the candidate's reading starts with the same character/mora as the correct answer, else `0`. |
  | `confusionSimilarity` | Scales toward `1` as this learner has more often picked this exact reading wrong for this exact question before (caps at 3 past mistakes). `0` for a learner who's never gotten this one wrong. |
  | `meaningSimilarity` | Token-overlap (Jaccard) similarity between the English gloss strings, e.g. `"sky; empty"` vs `"heaven; sky"`. |
  | `gradeSimilarity` | Closeness of school grade, once items carry a `grade` field. |
  | `frequencySimilarity` | Closeness of corpus frequency rank, once items carry a `frequency` field. |

  `data/*.json` entries today only carry `kanji`/`word`, `readings`, and
  `meaning` — so `exactReadingSimilarity`, `firstMoraSimilarity`,
  `meaningSimilarity`, and (once a learner has some history)
  `confusionSimilarity` are the features with real signal. `gradeSimilarity`
  and `frequencySimilarity` stay at `0` until matching fields exist on the
  data — `compute()` never throws on a missing field, it just treats it as
  "unavailable" and scores it `0`. `buildQuestion()` already reads
  `grade`/`frequency` generically off each item alongside
  `readings`/`meaning`, so the moment either field lands in `data/*.json`,
  its feature and weight activate with no code changes.
- **`js/learning/distractors/DistractorStrategy.js`** — the formal contract
  every distractor-scoring strategy must implement (JSDoc, same reasoning
  as `QuestionSelectionStrategy`), plus a tiny `isValid(strategy)` runtime
  check. `DistractorGenerator` depends only on this contract, never on a
  specific strategy:

  ```js
  score(features, config) -> number
  ```

  A conforming strategy must be a **pure function**: no `localStorage`,
  `ProgressManager`, or DOM access, no randomness, no mutating its
  arguments, and identical inputs always produce the identical output.
- **`js/learning/distractors/strategies/WeightedDistractorStrategy.js`** —
  the default, deterministic strategy. It's a plain weighted sum of the
  six features above:

  ```
  score = weights.exactReading * exactReadingSimilarity
        + weights.firstMora    * firstMoraSimilarity
        + weights.confusion    * confusionSimilarity
        + weights.meaning      * meaningSimilarity
        + weights.grade        * gradeSimilarity
        + weights.frequency    * frequencySimilarity
  ```

  No hard-coded priorities — every term's influence comes entirely from
  `DistractorConfig.weights`.
- **`js/learning/distractors/DistractorConfig.js`** — configuration only, no
  logic, same spirit as `QuestionSelectorConfig`:

  | Key | Meaning |
  | --- | --- |
  | `strategy` | The active `DistractorStrategy` implementation (`WeightedDistractorStrategy` by default). |
  | `weights.exactReading` | Multiplier for whole-reading string similarity. |
  | `weights.firstMora` | Multiplier for sharing the correct answer's first character/mora. |
  | `weights.confusion` | Multiplier for this learner's own past mix-ups on this question — weighted almost as heavily as `exactReading` since a real, personal mistake is stronger evidence than a generic phonetic heuristic. |
  | `weights.meaning` | Multiplier for English-gloss token overlap. |
  | `weights.grade` | Multiplier for grade closeness (dormant until the data has a per-item `grade` field). |
  | `weights.frequency` | Multiplier for corpus-frequency closeness (dormant until the data has a `frequency` field). |
  | `selection.distractorCount` | Number of wrong options to generate (`3`, matching `app.js`'s `OPTIONS_COUNT - 1`). |
  | `selection.maxCandidates` | Safety cap on how many candidates get scored per question, set comfortably above the largest real pool (~560) so it never truncates today's data — see "Known bug fixed" below. |

### Learner-confusion tracking

`ProgressManager.recordAnswer(mode, grade, text, isCorrect, selectedReading)`
takes one new optional argument: the reading the learner actually clicked.
When the answer is wrong, it's tallied into that question's stat record as
`confusions: { [reading]: timesPicked }` — fully backward-compatible with
progress saved before this existed (a record with no `confusions` key is
just treated as "no history yet"). `ProgressManager.getConfusions(id)`
reads it back as a fresh `{}`-defaulted object. `js/app.js`'s
`handleAnswer()` passes the clicked reading through, and `buildQuestion()`
attaches the question's stable ID (`ProgressManager.getQuestionId(...)`, the
same ID `QuestionSelector` already uses) so `DistractorGenerator` can look
up that question's history. Resetting a grade/mode
(`ProgressManager.reset()`) already deletes the whole per-question record,
so confusion history clears right along with everything else — no separate
handling needed.

### Implementing a new distractor strategy

Add a module (e.g. `js/learning/distractors/strategies/VisualSimilarityStrategy.js`)
exporting an object with a `score(features, config)` function that follows
the `DistractorStrategy` contract above, add its `<script>` tag to
`index.html` before `js/app.js`, and point `DistractorConfig.strategy` at
it. `DistractorGenerator` needs no changes — it only ever calls
`config.strategy.score(...)`.

### Adding a new similarity feature

Adding a new signal (radicals, stroke count, visual similarity, phonetic
component, semantic category, corpus occurrence, ...) is meant to take
exactly two small edits, with no changes to `DistractorGenerator.js`:

1. Add one computed field to the object `SimilarityFeatures.compute()`
   returns (reading it off `question`/`candidate`, defaulting to `0` when
   the data doesn't have it yet).
2. Add one matching weight to `DistractorConfig.weights` and reference it in
   `WeightedDistractorStrategy.score()`'s sum.

`DistractorGenerator` iterates the config-driven weighted sum generically,
so it automatically benefits from any new feature/weight pair without
needing to know it exists.

### Switching strategies

Point `DistractorConfig.strategy` at a different conforming module — that's
the only edit required. Because `DistractorGenerator` and
`WeightedDistractorStrategy` never see each other directly (only through
the `DistractorStrategy` contract), a future
`ReadingSimilarityStrategy`/`SemanticSimilarityStrategy`/`VisualSimilarityStrategy`/
`StrokeSimilarityStrategy` can drop in as a sibling of
`WeightedDistractorStrategy.js` with no other file changing.

### Known bug fixed: distractor diversity collapse

An earlier version set `selection.maxCandidates: 50` and sliced the
candidate pool to that size *before* scoring. Candidates are built by
iterating `itemList` in its fixed file order, so a low cap always scored
roughly the same early slice of the file regardless of which kanji was
being quizzed. Measured on `data/grade7.json` (370 kanji, 536 readings):
only **48 distinct readings ever appeared as a distractor across all 370
questions**, so the same handful of wrong answers kept resurfacing no
matter what was being asked. Raising `maxCandidates` to comfortably exceed
the largest real pool (grade 9 tops out around 560 candidates) fixed it —
the same measurement now shows 327 distinct readings offered. This matches
the spec's own performance guidance ("the dataset is sufficiently small to
evaluate every candidate — favor readability over optimization");
`maxCandidates` remains as a safety valve for a future, much larger pool
rather than a routine filter.

**It recurred once, exactly as predicted.** Cumulative review (below) pools
several grades into one candidate list — up to 2,136 kanji across grades 1-9,
well past the then-current cap of 1,000. The same collapse reappeared: a
30-question cumulative round offered only 24 distinct distractors. Raising
`maxCandidates` to 5,000 restored it to 30/30. The lesson generalizes: any
change that grows the candidate pool must check this cap, because the failure
is silent — distractors still look plausible, there are just far fewer
distinct ones.

### Testing

`js/learning/distractors/__tests__/run-tests.js` is a small, dependency-free
test harness (Node's built-in `vm`/`assert` only — no framework, no
`package.json`, nothing added to the browser bundle) that loads the real,
unmodified `progress.js` plus the distractors module in the same
shared-global-scope order as `index.html`'s `<script>` tags (with a tiny
in-memory `localStorage` stub so `ProgressManager` runs under Node), then
verifies: distractors are unique, the correct answer appears exactly once,
`WeightedDistractorStrategy.score()` is deterministic and side-effect-free,
`DistractorGenerator` works with an arbitrary conforming strategy, changing
weights changes which candidate ranks first, missing metadata never throws,
and — using `ProgressManager.recordAnswer()` to seed real confusion
history — a reading the learner has actually mixed up before outranks an
otherwise-stronger candidate. Run it with:

```bash
node js/learning/distractors/__tests__/run-tests.js
```

`js/learning/review/__tests__/run-tests.js` follows the same pattern for the
spaced-repetition modules. Both modules under test are pure, so it needs no
`localStorage` stub and no fake clock — `ReviewScheduler` returns an interval
rather than a due date, and `SpacedRepetitionStrategy` receives
`daysUntilDue` precomputed. It verifies the interval ladder (graduate, grow,
lapse, cap), that a slow correct answer grows less than a fluent one, that
missing latency data is never punished, that dueness is measured relative to
each question's own interval, that pre-scheduling progress is treated as due
now, and that both modules are deterministic and non-mutating. Run it with:

```bash
node js/learning/review/__tests__/run-tests.js
```

## Deployment

The app only uses relative paths, so it can be served from a project subpath
without any changes. To publish on GitHub Pages: push to a repo, then enable
Pages for the branch/root in the repo settings — no build step required.

## Roadmap

Only the multiple-choice reading quiz is built today. Other drill types were
scoped out but not started:

- Flashcard mode (flip card: kanji ⇄ reading)
- Matching/memory grid game
- Meaning drills alongside reading

See [PLAN.md](PLAN.md) for the original implementation plan and the
reasoning behind these calls.
