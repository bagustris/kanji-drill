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
  kanji underlined, so you practice the reading in context instead of in
  isolation. Currently seeded for grade 1 only (80 sentences, one per
  grade-1 kanji) as a pilot — see "Sentence data" below.
- **Adaptive review** — kanji you get wrong (or haven't seen yet) are weighted
  to show up more often in later rounds; progress is saved per kanji in
  `localStorage`, so it persists across sessions on the same device.
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
js/learning/         Adaptive Learning Engine (question selection, distractor generation)
data/grade1.json … grade9.json      Kanji + reading data, one file per grade
data/words1.json … words9.json     Word + reading data, one file per grade
data/sentences1.json                Sentence + reading data (grade 1 only so far)
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
{ "sentence": "学校へいく。", "target": "学校", "readings": ["がっこう"], "meaning": "school" }
```

`target` is the exact substring of `sentence` being quizzed — either a bare
kanji, a kanji plus its okurigana (e.g. `"立てる"` with reading `"た.てる"`), or
a two-kanji word — and gets underlined in the quiz card. Every other word in
the sentence is plain hiragana (or another already-covered kanji used as
natural context), keeping each sentence readable at that grade level.

> [!NOTE]
> These are original example sentences written for this project, not
> excerpts from any commercial textbook (e.g. くりかえし漢字ドリル or こくご) —
> reproducing copyrighted textbook text wasn't an option, so each sentence
> was written from scratch to exercise the same kanji/reading in a similarly
> simple, everyday context. Only grade 1 is populated right now (80
> sentences, one per grade-1 kanji); grades 2-9 show "準備中" (not ready) and
> their grade buttons are disabled while Sentence mode is selected, until
> more sentence data is added.

## Progress tracking

Your answer history is saved automatically after every question, entirely in
your browser — there's no backend or account, so it works the same on
GitHub Pages as it does locally.

- Everything is stored under a single `localStorage` key:
  **`kanji-drill-progress`**. It holds per-question stats (times seen,
  correct/wrong, last seen, and which wrong readings you've actually picked
  before) and per-grade totals (answered/correct), used both for the
  "Progress" summary on the home screen, to prioritize kanji you're shaky on
  in later rounds, and to steer which wrong answers show up as multiple-choice
  distractors (see "Adaptive Distractor Generation" below).
- All reads/writes go through the `ProgressManager` module
  (`js/progress.js`) — no other file touches `localStorage` directly.
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
config.strategy.score(question, stats, config)    js/learning/strategies/WeightedScoreStrategy.js
  ↓
rank candidates → keep top N% → pick one at random (avoiding recent repeats)
  ↓
return the next question
```

- **`js/learning/QuestionSelector.js`** — the only file that touches
  `ProgressManager`, and it owns both randomness and the "recently shown"
  queue. It builds each
  question's stats (adding a precomputed `daysSinceLastSeen` so the strategy
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
- **`js/learning/strategies/WeightedScoreStrategy.js`** — the default,
  deterministic strategy. For each candidate:

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
  | `strategy` | The active `QuestionSelectionStrategy` implementation (`WeightedScoreStrategy` by default). |
  | `weights.unseen` | Multiplier prioritizing never-answered questions. |
  | `weights.recentMistake` | Multiplier boosting a question missed on its last attempt. |
  | `weights.errorRate` | Multiplier scaling with a question's wrong/seen ratio. |
  | `weights.reviewDelay` | Multiplier scaling with time since the question was last seen (spaced review). |
  | `weights.masteryPenalty` | Multiplier reducing the score of well-known (high correct/seen) questions. |
  | `selection.topCandidateRatio` | Fraction of ranked candidates eligible for the final random pick (e.g. `0.20` = top 20%). |
  | `selection.recentHistorySize` | Size of the in-memory "recently shown" queue `QuestionSelector` avoids repeating. |
  | `normalization.reviewDelayDays` | Number of days considered "one review cycle" when normalizing review delay. |
  | `normalization.maxReviewDelayFactor` | Caps the normalized review-delay term so long-untouched questions don't dominate scoring indefinitely. |

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
- `review/` — a `ReviewScheduler` could own spaced-repetition due dates
  (SM-2/FSRS-style), letting `QuestionSelector` ask "what's due today?"
  instead of computing `reviewDelay` inline.
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

## Deployment

The app only uses relative paths, so it can be served from a project subpath
without any changes. To publish on GitHub Pages: push to a repo, then enable
Pages for the branch/root in the repo settings — no build step required.

## Roadmap

Only the multiple-choice reading quiz is built today. Other drill types were
scoped out but not started:

- Flashcard mode (flip card: kanji ⇄ reading)
- Typing/input quiz (type the reading instead of picking it)
- Matching/memory grid game
- Meaning drills alongside reading
- Stroke order practice

See [PLAN.md](PLAN.md) for the original implementation plan and the
reasoning behind these calls.
