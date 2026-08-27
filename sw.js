const CACHE_VERSION = 'kanji-drill-v35';

const CORE_ASSETS = [
  '.',
  'index.html',
  'style.css',
  'manifest.json',
  'CHANGELOG.md',
  'js/settings.js',
  'js/audio.js',
  'js/progress.js',
  'js/progress-view.js',
  'js/learning/QuestionSelectionStrategy.js',
  'js/learning/review/ReviewSchedulerConfig.js',
  'js/learning/review/ReviewScheduler.js',
  'js/learning/strategies/WeightedScoreStrategy.js',
  'js/learning/strategies/SpacedRepetitionStrategy.js',
  'js/learning/QuestionSelectorConfig.js',
  'js/learning/QuestionSelector.js',
  'js/learning/distractors/DistractorStrategy.js',
  'js/learning/distractors/features/SimilarityFeatures.js',
  'js/learning/distractors/strategies/WeightedDistractorStrategy.js',
  'js/learning/distractors/DistractorConfig.js',
  'js/learning/distractors/DistractorGenerator.js',
  'js/app.js',
  'vendor/kanji-data/kanji/kyoiku-grade1.json',
  'vendor/kanji-data/kanji/kyoiku-grade2.json',
  'vendor/kanji-data/kanji/kyoiku-grade3.json',
  'vendor/kanji-data/kanji/kyoiku-grade4.json',
  'vendor/kanji-data/kanji/kyoiku-grade5.json',
  'vendor/kanji-data/kanji/kyoiku-grade6.json',
  'vendor/kanji-data/kanji/kyoiku-grade7.json',
  'vendor/kanji-data/kanji/kyoiku-grade8.json',
  'vendor/kanji-data/kanji/kyoiku-grade9.json',
  'vendor/kanji-data/words/kyoiku-words1.json',
  'vendor/kanji-data/words/kyoiku-words2.json',
  'vendor/kanji-data/words/kyoiku-words3.json',
  'vendor/kanji-data/words/kyoiku-words4.json',
  'vendor/kanji-data/words/kyoiku-words5.json',
  'vendor/kanji-data/words/kyoiku-words6.json',
  'vendor/kanji-data/words/kyoiku-words7.json',
  'vendor/kanji-data/words/kyoiku-words8.json',
  'vendor/kanji-data/words/kyoiku-words9.json',
  'vendor/kanji-data/sentences/kyoiku-sentences1.json',
  'vendor/kanji-data/sentences/kyoiku-sentences2.json',
  'vendor/kanji-data/sentences/kyoiku-sentences3.json',
  'vendor/kanji-data/sentences/kyoiku-sentences4.json',
  'vendor/kanji-data/sentences/kyoiku-sentences5.json',
  'vendor/kanji-data/sentences/kyoiku-sentences6.json',
  'vendor/kanji-data/sentences/kyoiku-sentences7.json',
  'vendor/kanji-data/sentences/kyoiku-sentences8.json',
  'vendor/kanji-data/sentences/kyoiku-sentences9.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Stale-while-revalidate: serve from cache instantly, then refresh the
// cache in the background so the app works fully offline while still
// picking up updates whenever the network is available.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
