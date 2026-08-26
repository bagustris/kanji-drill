# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

漢字ドリル (Kanji Drill) — a static, browser-only multiple-choice quiz for
the 1,026 Kyōiku kanji (grades 1–6) plus junior-high kanji (grades 7–9,
data-only "grade" numbers, not part of the official Kyōiku list). Plain
HTML/CSS/JS, **no framework, no build step, no `package.json`**. Designed to
run as-is on GitHub Pages. See `README.md` for full feature documentation
(it's authoritative and detailed — read it before making non-trivial changes
to the learning/distractor engines) and `PLAN.md` for the original design
rationale.

## Commands

There is no build/lint/typecheck tooling — this repo is intentionally
buildless. The two things you'll actually run:

```bash
# Serve locally (required — data is loaded via fetch(), which file:// blocks)
python3 -m http.server 8000
# then open http://localhost:8000

# Run the test suites (Node built-ins only, no deps)
node js/learning/distractors/__tests__/run-tests.js
node js/learning/review/__tests__/run-tests.js
```

Those are the only test suites in the repo. `ReviewScheduler` and
`SpacedRepetitionStrategy` are covered; `QuestionSelector` itself (the
orchestration/randomness layer) still has no automated tests.

## Architecture

### Script loading — order matters, there's no bundler

Every JS file is a plain `<script>` tag in `index.html`, loaded in dependency
order, and everything shares the global scope (`ProgressManager`,
`SettingsManager`, `QuestionSelector`, `DistractorGenerator`, etc. are all
top-level `const`s / IIFEs). When adding a new module:

1. Add its `<script src="...">` tag to `index.html` **before** `js/app.js`
   and after anything it depends on.
2. Add its path to `CORE_ASSETS` in `sw.js` — the service worker precaches
   an explicit file list, not a glob, so a forgotten entry means the file
   silently 404s for users running the installed/offline PWA even though it
   works fine when testing over a live connection. Bump `CACHE_VERSION` in
   `sw.js` when changing any cached file so clients pick up the update.

### Layers

```
index.html            Markup + script load order for all three screens
js/settings.js         SettingsManager — user prefs (localStorage: kanji-drill-settings)
js/progress.js         ProgressManager — learning history (localStorage: kanji-drill-progress)
js/progress-view.js    ProgressView — read-only rendering of ProgressManager data
js/learning/           Adaptive Learning Engine (question ordering) — see below
js/learning/review/    ReviewScheduler — spaced-repetition intervals — see below
js/learning/distractors/  Adaptive Distractor Generator (wrong-answer choice) — see below
js/app.js              Screen navigation, quiz flow, keyboard/arrow nav, DOM wiring
vendor/kanji-data/kanji-drill/data/gradeN.json  Kanji + reading pool per grade (1-9), mode = "kanji"
vendor/kanji-data/kanji-drill/data/wordsN.json  Word + reading pool per grade (1-9), mode = "word"
sw.js                  Service worker; CORE_ASSETS must mirror index.html's script list
```

`ProgressManager` (`js/progress.js`) is the **only** module allowed to touch
`localStorage` for progress data; `SettingsManager` (`js/settings.js`) is the
only one for preferences. `ProgressView` only reads/renders — it computes
nothing. Keep this separation when editing: e.g. a new stat needs a getter
added to `ProgressManager`, not ad-hoc `localStorage` reads elsewhere.

Inside `ProgressManager`, read-only getters use `readSnapshot()` (memoized
parse) and write paths use `load()` (always fresh). That split is load-bearing
for performance, not cosmetic — see README "Progress tracking". The snapshot
is shared: **never return a piece of it uncopied**, and note that a spread is
shallow (`getQuestionStats` copies `latencies`/`confusions` explicitly).

### Cumulative review — the `sourceGrade` invariant

Every entry loaded in `app.js` is tagged with `sourceGrade`, in both
single-grade and review rounds, and progress is always keyed by *that*
grade — never by a round-wide grade. `state.grade` is `null` during a review
round for exactly this reason. If you add a code path that records progress,
key it by `q.sourceGrade`; keying it any other way forks one kanji's history
into two records and corrupts both its schedule and the dashboard totals.

Growing the candidate pool (as review does) also re-exposes the distractor
`maxCandidates` cap — check it, the failure is silent.

### Adaptive Learning Engine (`js/learning/`)

Picks *which* question comes next (instead of plain random), via a
strategy-pattern pipeline: `QuestionSelector` → reads stats from
`ProgressManager` → scores candidates through a pluggable
`QuestionSelectionStrategy` (default: `SpacedRepetitionStrategy`, config in
`QuestionSelectorConfig.js`) → ranks → picks randomly from the top slice,
avoiding recent repeats. Strategies must be pure functions (no
`localStorage`/`ProgressManager` access, no randomness, deterministic) — so
anything clock-derived (`daysSinceLastSeen`, `daysUntilDue`) or aggregated
(`medianLatencyMs`) is precomputed in `QuestionSelector.buildStats()` and
passed in via `stats`.

### Review scheduling (`js/learning/review/`)

`ReviewScheduler.nextIntervalDays(stats, isCorrect, latencyMs, config)` owns
the SM-2-style interval ladder (wrong → 0/due-now; first correct → 1 day;
correct → `× 2.5`, or `× 1.2` if slower than `slowAnswerMs`; capped at
`maxIntervalDays`). It's pure and returns an *interval*, never a due date —
`ProgressManager.recordAnswer()` stamps `dueAt = lastSeen + interval` and
persists `interval`/`dueAt`/`latencies` on the question stat. That call is
guarded by `typeof ReviewScheduler !== 'undefined'` because the distractor
test harness loads `progress.js` without the learning modules; don't remove
the guard.

Answer latency is measured in `app.js` (`performance.now()` stamped at the
end of `renderQuestion`, read in `handleAnswer`). Samples over 30s are
**dropped, not clamped** — clamping would record a fake 30-second answer.

### Adaptive Distractor Generator (`js/learning/distractors/`)

Picks *which wrong answers* appear alongside the correct reading, via the
same pattern: `DistractorGenerator` → builds a candidate pool from the
current grade/mode's other items → `SimilarityFeatures.compute()` (pure
feature extraction: reading similarity, first-mora match, this learner's
past confusions on this exact question, meaning overlap, etc.) →
`DistractorStrategy` (default: `WeightedDistractorStrategy`, config in
`DistractorConfig.js`) → top N unique readings. `DistractorConfig.weights`
and `selection.maxCandidates` matter more than they look — see README's
"Known bug fixed: distractor diversity collapse" for why `maxCandidates`
must exceed the largest real data pool (~560 candidates at grade 9).

Both engines follow the same extension recipe: add a new strategy module,
add its `<script>` tag before `js/app.js`, point the relevant `Config.js` at
it — no changes needed to `QuestionSelector.js` / `DistractorGenerator.js`
themselves.

### Data lives in a submodule

`vendor/kanji-data` (submodule, https://github.com/bagustris/kanji-data)
holds this app's `data/` and `tools/` under `kanji-drill/` — run
`git submodule update --init` after cloning, or `loadData()`'s `fetch()`
calls 404. Because the live site fetches this at runtime (not a
pre-generated committed copy), GitHub Pages deploys via
`.github/workflows/deploy-pages.yml` (explicit `submodules: true` checkout)
instead of the classic branch-deploy source, which does not check out
submodules — don't switch Pages back to "deploy from a branch" without
first moving `data/` back to a plain committed directory.

### Data shape

`data/gradeN.json` (kanji mode): `{ "kanji": "口", "readings": ["くち"], "meaning": "..." }`
`data/wordsN.json` (word mode): same shape but `"word"` instead of `"kanji"`.
`readings` is almost always length 1; a few (notably 一〜十) carry two. Grade
files 1–6 are the official Kyōiku set; 7–9 are junior-high kanji, editorially
curated (not copied from an official answer key) — see README's "Progress
tracking" / data section before assuming a reading is wrong.

### Progress/settings storage keys

- `kanji-drill-progress` — per-question stats, per-grade totals, answer
  history, per-question confusion counts (used by both engines above).
- `kanji-drill-settings` — `showMeaning`, `roundSize`.

Both are versioned, defensively-parsed JSON blobs (see `load()` in each
file) — preserve that pattern (never assume a key exists) when extending
either shape, since older localStorage data must keep loading without a
migration step.
