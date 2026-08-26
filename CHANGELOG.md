# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version shown in the app's Settings → About panel is read from the latest
entry below (see `loadAppVersion()` in `js/app.js`), so this file is the single
source of truth for the app version.

## [Unreleased]

## [1.2.0] - 2026-08-26

### Changed
- Kanji, word, and sentence data now lives in the shared
  [kanji-data](https://github.com/bagustris/kanji-data) repo (added as the
  `vendor/kanji-data` submodule, organized there by data domain —
  `kanji/`, `words/`, `sentences/` — rather than by app) instead of this
  app's own `data/` directory, so the same JMdict/Kanji Alive-backed
  dataset can be reused by other apps in the family. Deployment switched
  from GitHub Pages' classic "deploy from branch" to a GitHub Actions
  workflow (`.github/workflows/deploy-pages.yml`), since the live site now
  fetches data straight out of the submodule and the branch-deploy
  pipeline doesn't check out submodules.
- Auto-advance can now be combined with "Show words that use this kanji"
  instead of being force-disabled while it's on. The timed pause is held to
  at least 5 seconds whenever the example-word list is showing, giving
  enough time to read it before the quiz moves on.
- Example words on the answer reveal are shown slightly larger, since they
  were hard to read on mobile. Each row now wraps as a whole instead of
  breaking a 熟語 mid-character when it doesn't fit a narrow screen.

### Added
- Kanji-mode quiz prompts now show an animated stroke-order diagram (from
  KanjiVG data mirrored into kanji-data) instead of a static character —
  in the app's accent red, larger than the old plain-character size, and
  drawn in twice as fast as a typical stroke-order reference diagram since
  this is a quiz prompt, not a lookup view. Tap/click it to replay. Falls
  back to a plain accent-red character (not bold — a bold system-font
  glyph next to the KanjiVG brush-stroke look read as two mismatched
  fonts) for kanji without stroke data. Word, sentence, and reverse-mode
  prompts are unchanged.
- A second example sentence for every kanji in sentence mode (grades 1-9), each
  using a different common word for the same kanji so it appears in two
  contexts (e.g. 出 via 出発 and 出かける). Sentence counts roughly double per
  grade. New `validate-sentences.js` (now in the kanji-data submodule's
  `scripts/kyoiku/`) checks the structural invariants (target is a
  substring of its sentence, readings are valid kana, sentences are unique
  per grade, the second word differs from the first).

## [1.1.1] - 2026-08-12

### Fixed
- Sentence mode now reads the whole example sentence aloud instead of only the
  target kanji's reading, so the audio matches the sentence shown on screen.

## [1.1.0] - 2026-08-11

### Added
- Example words ("この漢字を使うことば / Words that use this kanji") revealed on
  the kanji-mode answer, backfilled for ~1,230 kanji from the
  [Kanji alive](https://kanjialive.com) dataset (CC BY 4.0) via the new
  `tools/fetch-examples-kanjialive.js`; attribution added to `CREDITS.md`.
- Settings toggle **この漢字を使うことばを表示 / Show words that use this kanji**
  (on by default) to hide that panel.

### Fixed
- Auto-advance could hang forever on browsers whose speech-synthesis engine
  silently accepts an utterance but never fires `onend`/`onerror` (notably some
  older Android/Chrome builds): with audio on, the advance waited on a speech
  callback that never arrived. `js/audio.js` now falls back to a length-based
  timeout so the reading always resolves.

### Changed
- Auto-advance is now suppressed whenever "Show words that use this kanji" is
  on — its timed pause is sized for the reading alone and would cut the example
  list off before it can be read. The Settings toggle is disabled in that case
  and the quiz waits for a manual continue; the underlying auto-advance
  preference is preserved and resumes once examples are turned back off.

## [1.0.0] - 2026-08-09

### Added
- Multiple-choice reading quiz for the 1,026 Kyōiku kanji (grades 1–6) plus
  junior-high kanji (grades 7–9), with an adaptive distractor engine that ranks
  wrong answers by reading/meaning similarity and past confusions.
- Sentence reading quiz (grades 1–2) and reverse quiz (逆引き: reading + meaning
  → kanji), the latter tracked as its own spaced-repetition skill.
- Optional spoken readings (読み上げ) via the browser's speech synthesis, and
  auto-advance (自動で次へ) with a length-adaptive reveal pause.
- Adaptive learning engine (spaced repetition with per-kanji intervals, answer
  latency awareness, leech scaffolding for weak spots) and cumulative review
  (ふくしゅう) pooling every studied grade.
- Progress dashboard and per-question/per-grade history in `localStorage`.
- Installable, offline-capable PWA via a precaching service worker.
- Settings panel (show meaning, spoken readings, auto-advance, round size) and
  an About section.
