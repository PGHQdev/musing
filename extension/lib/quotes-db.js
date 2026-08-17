/**
 * Local Quotes Database
 * Loads quotes from JSON for easy editing and updates
 */

let QUOTES_DB = [];
let quotesLoadPromise = null;

// Inverse-frequency table: theme -> number of bank quotes tagged with it.
// Rebuilt every time QUOTES_DB is (re)loaded, so it never drifts from the
// bank it scores against.
let themeCounts = new Map();

/**
 * Count how many quotes carry each theme tag.
 * @param {Object[]} quotes
 * @returns {Map<string, number>}
 */
function buildThemeCounts(quotes) {
  const counts = new Map();
  for (const quote of quotes) {
    const quoteThemes = Array.isArray(quote.themes) ? quote.themes : [];
    for (const raw of quoteThemes) {
      const theme = String(raw).toLowerCase();
      counts.set(theme, (counts.get(theme) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Inverse-frequency weight for a single theme.
 * A theme absent from the bank scores as if 0 quotes carried it (the
 * highest possible weight for the current bank size), rather than throwing.
 * @param {string} theme
 * @returns {number}
 */
function themeIdf(theme) {
  const key = String(theme).toLowerCase();
  const count = themeCounts.get(key) || 0;
  const n = QUOTES_DB.length;
  return Math.max(0.1, Math.log(n / (1 + count)));
}

/**
 * Load quotes from JSON file.
 * Promise-memoized: concurrent callers share one fetch; a failed load
 * resets the memo so the next call retries.
 */
function loadQuotes() {
  if (!quotesLoadPromise) {
    quotesLoadPromise = (async () => {
      const response = await fetch(chrome.runtime.getURL("data/quotes.json"));
      const data = await response.json();
      QUOTES_DB = data.quotes || [];
      themeCounts = buildThemeCounts(QUOTES_DB);
      console.log(`[Musing] Loaded ${QUOTES_DB.length} quotes from local database`);
      return QUOTES_DB;
    })().catch((error) => {
      console.error("[Musing] Failed to load quotes:", error);
      quotesLoadPromise = null;
      return QUOTES_DB;
    });
  }
  return quotesLoadPromise;
}

/**
 * Ensure quotes are loaded before use
 */
function ensureQuotesLoaded() {
  return loadQuotes();
}

/**
 * Normalize a caller-supplied theme list into a theme -> userScore map.
 * Accepts `[{theme, score}]` (used as given) or `string[]` (score defaults
 * to 1). Any other entry shape is dropped rather than thrown on.
 * @param {Array} themes
 * @returns {Map<string, number>}
 */
function themeScoreMap(themes) {
  const map = new Map();
  if (!Array.isArray(themes)) return map;
  for (const entry of themes) {
    let theme;
    let score;
    if (typeof entry === "string") {
      theme = entry;
      score = 1;
    } else if (entry && typeof entry === "object" && typeof entry.theme === "string") {
      theme = entry.theme;
      score = typeof entry.score === "number" ? entry.score : 1;
    } else {
      continue;
    }
    const key = theme.toLowerCase();
    if (!map.has(key)) map.set(key, score);
  }
  return map;
}

/**
 * Score an arbitrary list of quote objects against a theme set.
 *   quoteScore = SUM over matched tags [ userScore(tag) * idf(tag) ] / sqrt(quote.themes.length)
 * Unmatched quote tags contribute nothing; the sqrt divisor removes the
 * reward for a quote carrying many tags.
 * @param {Object[]} quotes
 * @param {Array} themes - `[{theme, score}]` or `string[]`
 * @returns {{quote: Object, score: number}[]} Sorted score descending
 */
function scoreQuotes(quotes, themes) {
  const scores = themeScoreMap(themes);
  const list = Array.isArray(quotes) ? quotes : [];

  const scored = list.map((quote) => {
    const quoteThemes = Array.isArray(quote.themes) ? quote.themes : [];
    let sum = 0;
    for (const raw of quoteThemes) {
      const userScore = scores.get(String(raw).toLowerCase());
      if (userScore === undefined) continue;
      sum += userScore * themeIdf(raw);
    }
    const score = quoteThemes.length > 0 ? sum / Math.sqrt(quoteThemes.length) : 0;
    return { quote, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Find quotes matching given themes, ranked by inverse-frequency score.
 * @param {Array} themes - `[{theme, score}]` or `string[]`
 * @param {number} count - Number of results to return
 * @returns {Promise<{quote: Object, score: number}[]>} Sorted score
 *   descending, at most `count` entries. Falls back to `count` random
 *   quotes at `score: 0` when nothing scores above zero (or no themes were
 *   given), so a caller reads `score > 0` to know the pick was earned.
 */
async function findQuotesByThemes(themes, count = 5) {
  const quotes = await ensureQuotesLoaded();
  const scores = themeScoreMap(themes);

  if (scores.size === 0 || quotes.length === 0) {
    return shuffleArray([...quotes])
      .slice(0, count)
      .map((quote) => ({ quote, score: 0 }));
  }

  const ranked = scoreQuotes(quotes, themes).filter((sq) => sq.score > 0);

  if (ranked.length === 0) {
    return shuffleArray([...quotes])
      .slice(0, count)
      .map((quote) => ({ quote, score: 0 }));
  }

  return ranked.slice(0, count);
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Load quotes immediately when script loads
loadQuotes();

// Export for Node (scripts, tests). Browser contexts (importScripts and
// <script> tags) never define module, so this is a no-op there; the
// function declarations above already attach to self as globals.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    loadQuotes,
    ensureQuotesLoaded,
    findQuotesByThemes,
    scoreQuotes,
    themeIdf,
  };
}
