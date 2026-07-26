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

# Run the distractor-engine test suite (Node built-ins only, no deps)
node js/learning/distractors/__tests__/run-tests.js
```

There is no other test suite in the repo — the question-selection engine
(`js/learning/`, non-distractor parts) currently has no automated tests.

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
js/learning/distractors/  Adaptive Distractor Generator (wrong-answer choice) — see below
js/app.js              Screen navigation, quiz flow, keyboard/arrow nav, DOM wiring
data/gradeN.json       Kanji + reading pool per grade (1-9), mode = "kanji"
data/wordsN.json       Word + reading pool per grade (1-9), mode = "word"
sw.js                  Service worker; CORE_ASSETS must mirror index.html's script list
```

`ProgressManager` (`js/progress.js`) is the **only** module allowed to touch
`localStorage` for progress data; `SettingsManager` (`js/settings.js`) is the
only one for preferences. `ProgressView` only reads/renders — it computes
nothing. Keep this separation when editing: e.g. a new stat needs a getter
added to `ProgressManager`, not ad-hoc `localStorage` reads elsewhere.

### Adaptive Learning Engine (`js/learning/`)

Picks *which* question comes next (instead of plain random), via a
strategy-pattern pipeline: `QuestionSelector` → reads stats from
`ProgressManager` → scores candidates through a pluggable
`QuestionSelectionStrategy` (default: `WeightedScoreStrategy`, config in
`QuestionSelectorConfig.js`) → ranks → picks randomly from the top slice,
avoiding recent repeats. Strategies must be pure functions (no
`localStorage`/`ProgressManager` access, no randomness, deterministic).

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
