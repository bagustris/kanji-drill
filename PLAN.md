# Kanji Drill — Implementation Plan

## Summary

A static, browser-only kanji drill game covering Japanese elementary school
grades 1–6 (the Kyōiku Kanji / 教育漢字 list, ~1006 kanji total). No backend —
built with plain HTML/CSS/JS so it can be hosted directly on GitHub Pages.

**Decisions locked in from Q&A:**
- **Stack:** plain HTML/CSS/JS, no build step, no framework.
- **Game type (v1):** multiple choice quiz only. Other game types (flashcards,
  typing input, matching/memory) are noted as possible future phases below,
  but are **out of scope** unless explicitly requested later.
- **Drill focus:** reading only. Each kanji has **one primary reading** as
  taught at that grade level (hiragana), matching how Japanese elementary
  schools actually teach it — no on'yomi/kun'yomi split. A small number of
  kanji legitimately have two commonly-taught readings (e.g. rare cases),
  which is fine. Examples: 口→くち, 赤→あか.
- **Deployment:** GitHub Pages (static hosting) → no backend, no server-side
  storage. Progress therefore uses **browser localStorage** (per-device,
  no login/sync). This is the simplest option consistent with static hosting.
- **Grades:** 1 through 6, selectable independently (drill one grade at a
  time, not all mixed together, at least for v1).

## Open items to confirm before/while building (ask if still unclear)

- Quiz direction: show **kanji → pick correct reading** (4 hiragana options)
  is the primary mode. A reverse mode (show reading → pick correct kanji) is
  cheap to add with the same dataset — build it as a toggle in Chunk 3 unless
  told to skip it.
- Number of choices per question: default to 4 options (1 correct + 3
  distractors, preferably distractors from the *same grade* to keep
  difficulty appropriate).
- Distractor pairing quality is only as good as reading similarity — flag any
  kanji where good distractors are hard to generate automatically.

---

## Chunks

Each chunk should be implemented and verified (open `index.html` in a
browser / serve locally) before moving to the next.

### Chunk 1 — Kanji dataset

- Compile the Kyōiku Kanji list for grades 1–6 into structured data.
- File layout: `data/grade1.json` … `data/grade6.json` (or one
  `data/kanji.json` with a `grade` field per entry — pick whichever is
  simpler to load without a build step).
- Each entry: `{ kanji: "口", reading: "くち", readings: ["くち"] }` — use a
  `readings` array (usually length 1, occasionally 2) rather than hardcoding
  singular fields, so the quiz logic doesn't need special-casing later.
- Sanity-check counts against the known official totals per grade (80, 160,
  200, 200, 185, 181 for grades 1–6 respectively — 1006 total) so nothing was
  dropped or duplicated.

### Chunk 2 — App shell & navigation

- `index.html`, `style.css`, `app.js` (or `main.js`), no build tooling.
- Landing screen: pick a grade (1–6).
- Quiz screen: placeholder layout (question area, 4 answer buttons, score/
  progress indicator, "next" flow).
- Basic responsive styling (mobile-friendly, since kanji drilling is often
  done on a phone).

### Chunk 3 — Multiple choice quiz logic

- Load the selected grade's kanji set, shuffle question order.
- For each question: pick a target kanji, generate 3 plausible wrong-reading
  distractors from the same grade's pool, shuffle all 4 options.
- Handle answer selection: correct/incorrect feedback, move to next question.
- End-of-round summary screen (score, list of missed kanji).
- (Optional per "open items" above) reading→kanji reverse mode toggle.

### Chunk 4 — Progress tracking (localStorage)

- Track per-kanji stats: times seen, times correct, last result.
- Derive a simple mastery signal (e.g. "learning" / "familiar" / "mastered")
  per kanji, per grade.
- Persist to `localStorage`, reload on app start.
- Surface it: e.g. a small stats view per grade, and prioritize
  previously-missed kanji more often in later rounds ("review weak kanji").
- Add a way to reset progress (per grade or fully).

### Chunk 5 — Polish & GitHub Pages deploy

- Cross-check mobile layout, keyboard accessibility (enter/number keys to
  answer), and basic a11y (aria labels on buttons, contrast check).
- Add a simple favicon/title.
- Verify the app runs correctly when served from a GitHub Pages subpath
  (relative paths only, no absolute `/...` asset references).
- Write a short `README.md` (usage + how it's hosted) — only if requested,
  otherwise skip per default no-unsolicited-docs policy.

---

## Possible future phases (not started unless requested)

- Flashcard mode (flip card: kanji ⇄ reading).
- Typing/input quiz (type the reading in hiragana, stricter recall).
- Matching/memory grid game.
- Meaning drills (English meaning) alongside reading.
- Stroke order practice/animation (would need stroke order data — much
  bigger scope).
- Mixed-grade drilling / adaptive difficulty across grades.
