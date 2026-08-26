# Copilot Instructions — Kanji Drill

## Project overview

Static, browser-only kanji/vocabulary quiz app. **No backend, no build step, no framework, no dependencies.** Served as plain HTML/CSS/JS on GitHub Pages.

## Running locally

Must be served over HTTP (not opened as `file://`) because data files are loaded with `fetch()`:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works (`npx serve`, `php -S localhost:8000`, etc.). There are no tests, no build commands, and no linter.

## Architecture

Single-page app with three screens (`home`, `quiz`, `summary`) managed entirely via a CSS `hidden` class — no routing, no framework. Everything is plain JS loaded via `<script>` tags at the bottom of `index.html`:

- **`js/progress.js`** — `ProgressManager` IIFE module. Sole owner of the `kanji-drill-progress` localStorage key; no other file touches `localStorage` directly. Exposes `recordAnswer`, `mastery`, `reset`, `resetAll`, `getQuestionId`, `getQuestionStats`, `isSeen`, `getSeenCount`, `getCorrectCount`, `getWrongCount`, `getLastSeen`, `getErrorRate`, `getMastery`, `getGradeStats`, `getOverallStats`, `getOverallStatsByMode`, `getAccuracy`, `getAnswered`, `setTotalQuestions`/`getTotalQuestions`, `getGradeProgressPercent`, `getMasteryBreakdown`, `getRecentHistory`. Progress data also stores a capped `history` array (last 30 correct/incorrect booleans) for the dashboard sparkline, and each question stat includes `lastCorrect` (used by adaptive selection).
- **`js/progress-view.js`** — `ProgressView` IIFE module. Renders the Progress Dashboard at the bottom of the home screen (overall stats + per-mode breakdown + recent-history sparkline, and current-grade stats + completion bar + mastery breakdown) purely from `ProgressManager` data; does no calculation itself.
- **`js/learning/`** — Adaptive Learning Engine (question selection), see below.
- **`js/app.js`** — everything else: global `state` object, screen transitions (`showScreen`), data loading (`loadData`), question building (`buildQuestion`), adaptive question picking (`pickQuestions`, delegating to `QuestionSelector`), answer handling, dashboard wiring (`renderDashboard`, `registerTotalQuestionCounts`, `gradeDisplayName`), and keyboard shortcuts.

The files are loaded in dependency order: `progress.js`, `progress-view.js`, then the `js/learning/` module (`QuestionSelectionStrategy.js`, `strategies/WeightedScoreStrategy.js`, `QuestionSelectorConfig.js`, `QuestionSelector.js`), then `app.js`.

## Adaptive Learning Engine (`js/learning/`)

Question order within a round is chosen adaptively rather than randomly. This project has no `src/` directory, so the module lives under `js/learning/` instead of `src/learning/`, but keeps the same internal layout:

- **`QuestionSelector.js`** — orchestrator IIFE. The only file here that calls `ProgressManager` or generates randomness; also owns an in-memory (never persisted) "recently shown" queue for session-level diversity. Exposes `select(pool, options)` (`pool` = array of `{ id, ... }`; `options.random` is an injectable RNG for deterministic tests) and `resetSession()`.
- **`QuestionSelectionStrategy.js`** — JSDoc-documented contract every strategy must implement (`score(question, stats, config) -> number`, pure/deterministic, no side effects), plus a tiny runtime `isValid(strategy)` check. `QuestionSelector` depends only on this contract, never a specific strategy.
- **`strategies/WeightedScoreStrategy.js`** — default strategy; pure function combining `unseen`, `recentMistake`, `errorRate`, `reviewDelay`, and `mastery` terms per `QuestionSelectorConfig.weights`. Never touches `Date.now()`, `ProgressManager`, or `localStorage` — `QuestionSelector` precomputes `daysSinceLastSeen` and passes it in via `stats`.
- **`QuestionSelectorConfig.js`** — configuration only (weights, `selection.topCandidateRatio`/`recentHistorySize`, `normalization.reviewDelayDays`/`maxReviewDelayFactor`, and the active `strategy`). No logic; no magic numbers should appear in `QuestionSelector.js` or the strategies.

`app.js`'s `pickQuestions()` builds the candidate pool with `ProgressManager.getQuestionId(mode, grade, itemText(entry))` as each item's `id`, then repeatedly calls `QuestionSelector.select()`, removing each pick from the pool so a single round never repeats a question. See the README's "Adaptive Learning Engine" section for the full data-flow diagram and how to add a new strategy.

## Data

Two quiz modes, each with a separate set of JSON files:

| Mode | Files | Entry shape |
|------|-------|-------------|
| Kanji (`mode: 'kanji'`) | `data/grade1.json` … `data/grade9.json` | `{ "kanji": "口", "readings": ["くち"] }` |
| Word (`mode: 'word'`) | `data/words1.json` … `data/words9.json` | `{ "word": "学校", "readings": ["がっこう"], "meaning": "school" }` |

Grades 1–6 are elementary school (小学校); grades 7–9 are junior high (中学校). `readings` is always an array (usually length 1; occasionally 2 for kanji taught with two readings from the start, e.g. numbers).

**Okurigana notation:** a dot in a reading like `"おぼ.える"` marks where the kanji-derived reading ends and okurigana begins. `readingHTML()` in `app.js` renders the tail as `<span class="okurigana">`.

## Key conventions

**`itemText(entry)`** — canonical accessor for the display text of an entry; returns `entry.kanji ?? entry.word`. Use this everywhere instead of accessing `.kanji` or `.word` directly, so both modes are handled uniformly.

**localStorage:** everything lives under one key, `kanji-drill-progress`, holding `{ version, lastUpdated, grades, questions, history }`. Grade keys reuse the old `grade{N}` / `words{N}` naming as a namespace; question IDs are `${gradeKey}:${text}` (text = `itemText(entry)`), so no new identifier scheme was invented — see `js/progress.js`'s `getQuestionId`/`questionId`.

**Mastery levels (qualitative, used by the Progress Dashboard's mastery breakdown):**

| Mastery | Condition |
|---------|-----------|
| `new` | never seen |
| `learning` | accuracy < 50% |
| `familiar` | seen, accuracy ≥ 50% |
| `mastered` | seen ≥ 3 times, accuracy ≥ 90% |

`ProgressManager.mastery(stat)` returns these buckets; `ProgressManager.getMastery(id)` is a separate, numeric `correct/seen` ratio (0–1) used by the Adaptive Learning Engine's scoring strategy — don't conflate the two.

**Screen names** used in `state.screen` and `showScreen()`: `'home'`, `'quiz'`, `'summary'`. Keyboard shortcuts mirror the `key-badge` labels shown on buttons in the UI (k/w = mode toggle, 1–9 = grade, 1–4 = answer option, 0 = quit).

**File naming for new grades:** follow the existing pattern — `data/grade{N}.json` / `data/words{N}.json` and load via `loadData(mode, grade)` which constructs the filename automatically.
