# 漢字ドリル — Kanji Drill

A static, browser-only kanji quiz covering all six years of Japanese elementary
school. Pick a grade, answer multiple-choice reading questions, and the app
quietly tracks which kanji you're shaky on so they come up more often next
time.

No backend, no build step, no framework — just HTML, CSS, and JavaScript,
designed to run as-is on GitHub Pages.

## Features

- **All 1,026 Kyōiku kanji** (教育漢字), grouped by grade 1 through 6 under the
  2020 curriculum revision (80 / 160 / 200 / 202 / 193 / 191 kanji per grade).
- **Multiple-choice reading quiz** — see a kanji, pick its reading from four
  hiragana options pulled from the same grade for realistic distractors.
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
data/grade1.json … grade6.json   Kanji + reading data, one file per grade
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

## Progress tracking

Your answer history is saved automatically after every question, entirely in
your browser — there's no backend or account, so it works the same on
GitHub Pages as it does locally.

- Everything is stored under a single `localStorage` key:
  **`kanji-drill-progress`**. It holds per-question stats (times seen,
  correct/wrong, last seen) and per-grade totals (answered/correct), used
  both for the "Progress" summary on the home screen and to prioritize kanji
  you're shaky on in later rounds.
- All reads/writes go through the `ProgressManager` module
  (`js/progress.js`) — no other file touches `localStorage` directly.
- **To reset your progress**, open your browser's DevTools console on this
  site and run:

  ```js
  localStorage.removeItem('kanji-drill-progress')
  ```

  (or clear all site data for this domain from your browser settings). The
  app will start with a clean slate on the next reload.

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
