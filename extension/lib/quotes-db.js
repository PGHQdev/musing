/**
 * Local Quotes Database
 * Loads quotes from JSON for easy editing and updates
 */

let QUOTES_DB = [];
let quotesLoadPromise = null;

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
 * Find quotes matching given themes
 * @param {string[]} themes - Array of theme names to match
 * @param {number} count - Number of quotes to return
 * @returns {Promise<Object[]>} Array of matching quotes
 */
async function findQuotesByThemes(themes, count = 5) {
  const quotes = await ensureQuotesLoaded();

  if (!themes || themes.length === 0 || quotes.length === 0) {
    // Return random quotes if no themes
    return shuffleArray([...quotes]).slice(0, count);
  }

  const normalizedThemes = themes.map(t => t.toLowerCase());

  // Score quotes by theme overlap
  const scoredQuotes = quotes.map(quote => {
    const quoteThemes = Array.isArray(quote.themes) ? quote.themes : [];
    const matchCount = quoteThemes.filter(t =>
      normalizedThemes.includes(String(t).toLowerCase())
    ).length;
    return { quote, score: matchCount };
  });

  // Filter quotes with at least one match, sort by score
  const matchingQuotes = scoredQuotes
    .filter(sq => sq.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(sq => sq.quote);

  // If we have matching quotes, return them (with some randomization)
  if (matchingQuotes.length > 0) {
    // Take top matches but shuffle within score groups for variety
    const topMatches = matchingQuotes.slice(0, Math.min(count * 2, matchingQuotes.length));
    return shuffleArray(topMatches).slice(0, count);
  }

  // Fallback to random quotes
  return shuffleArray([...quotes]).slice(0, count);
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
