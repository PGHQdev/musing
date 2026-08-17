/**
 * Background Service Worker
 * Handles quote caching and communication with content scripts
 *
 * Local by default - optional BYOK intelligence for Smart Reasons
 */

// Import local modules
importScripts(
  "lib/storage.js",
  "lib/theme-extractor.js",
  "lib/quotes-db.js",
  "lib/ai-reason-generator.js",
  "lib/history-extractor.js"
);

const MIN_CACHE_SIZE = 5;
const DEFAULT_CACHE_SIZE = 15;
const MIN_PROCESS_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes between processing

// What the user is talking about now counts double what they browsed
const CONVERSATION_THEME_WEIGHT = 1;
const HISTORY_THEME_WEIGHT = 0.5;
// Terms carried on the reason line
const MAX_REASON_TERMS = 3;

// Proactive scraping configuration
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const PROACTIVE_SCRAPE_TIMEOUT_MS = 60000; // Chrome's alarm minimum is 1 minute
// Platform ids, hosts, and scrape URLs come from PLATFORMS in lib/storage.js

// Background scrape tabs are tracked in Store.scrape.tabs() (persisted),
// so the timeout alarm and onRemoved cleanup survive worker suspension.

/**
 * Theme name of either shape a caller can hold: a scored `{theme, score,
 * terms}` entry or a plain string from an older stored value.
 * @returns {string} Empty string for any other shape
 */
function themeNameOf(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && typeof entry.theme === "string") return entry.theme;
  return "";
}

/**
 * Drop blocked themes, keeping each entry in the shape it arrived in.
 * @param {Array} themes - `[{theme, score, terms}]` or `string[]`
 * @param {Set<string>} blockedSet - Lowercased blocked theme names
 */
function filterBlockedThemes(themes, blockedSet) {
  if (!Array.isArray(themes) || themes.length === 0) return [];
  return themes.filter((entry) => {
    const name = themeNameOf(entry);
    return name && !blockedSet.has(name.toLowerCase());
  });
}

/**
 * Cache identity: the theme names the cache was built from, lowercased,
 * sorted and joined. A different key means a different topic.
 * @param {Array} themes - `[{theme, score, terms}]` or `string[]`
 * @returns {string}
 */
function buildThemeKey(themes) {
  return (Array.isArray(themes) ? themes : [])
    .map((entry) => themeNameOf(entry).toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
}

/**
 * Merge conversation themes and history themes into one scored list.
 *
 * Each source is scaled against its own top score before the source weight is
 * applied. Extractor scores are ratios whose size depends on the keyword list
 * behind the theme, so two independently extracted sets are not comparable as
 * they stand, and a legacy stored list normalizes to a flat score of 1. After
 * scaling, the top conversation theme sits at 1.0 and the top history theme at
 * 0.5, so history can lift a theme but never outrank the leading conversation
 * theme. Scores sum by theme name, so a theme in both sources outranks the
 * same theme from either source alone.
 * @param {Array} conversationThemes
 * @param {Array} historyThemes
 * @returns {{theme: string, score: number, terms: string[]}[]} Descending
 */
function combineThemes(conversationThemes, historyThemes) {
  const merged = new Map();

  const absorb = (entries, weight) => {
    const list = (Array.isArray(entries) ? entries : [])
      .map((entry) => ({
        name: themeNameOf(entry).toLowerCase(),
        score: typeof entry?.score === "number" ? entry.score : 1,
        terms: Array.isArray(entry?.terms) ? entry.terms : [],
      }))
      .filter((entry) => entry.name);

    const top = list.reduce((max, entry) => Math.max(max, entry.score), 0);
    const scale = top > 0 ? weight / top : weight;

    for (const entry of list) {
      const score = entry.score * scale;
      const existing = merged.get(entry.name);
      if (existing) {
        existing.score += score;
        for (const term of entry.terms) {
          if (!existing.terms.includes(term)) existing.terms.push(term);
        }
      } else {
        merged.set(entry.name, { theme: entry.name, score, terms: [...entry.terms] });
      }
    }
  };

  absorb(conversationThemes, CONVERSATION_THEME_WEIGHT);
  absorb(historyThemes, HISTORY_THEME_WEIGHT);

  return [...merged.values()].sort((a, b) => b.score - a.score);
}

/**
 * Sample one scored entry with probability proportional to score squared.
 * Rank counts, and variety holds. When every candidate scores 0 the pick is
 * uniform, which is the honest fallback: nothing earned its place.
 * @param {{quote: Object, score: number}[]} scored
 * @returns {{quote: Object, score: number}|null} Null for an empty list
 */
function weightedPick(scored) {
  if (!Array.isArray(scored) || scored.length === 0) return null;

  const weights = scored.map((entry) => (entry.score > 0 ? entry.score * entry.score : 0));
  const total = weights.reduce((sum, w) => sum + w, 0);

  if (total <= 0) return scored[Math.floor(Math.random() * scored.length)];

  let threshold = Math.random() * total;
  for (let i = 0; i < scored.length; i++) {
    threshold -= weights[i];
    if (threshold < 0) return scored[i];
  }
  return scored[scored.length - 1];
}

function quoteIsBlocked(quote, blockedSet) {
  const themes = quote?.themes || [];
  return Array.isArray(themes) && themes.some((t) => blockedSet.has(String(t).toLowerCase()));
}

// Note: Quotes are now sourced from lib/quotes-db.js (QUOTES_DB)
// No fallback needed - local database always available

// Alarms are registered on every worker start: an install-only registration
// does not survive extension updates.
async function ensureAlarms() {
  const existing = await chrome.alarms.get("check-stale-scrapes");
  if (!existing) {
    chrome.alarms.create("check-stale-scrapes", { periodInMinutes: 6 * 60 });
  }
}
ensureAlarms();

// Fresh-install init, retried on every worker start until the version marker
// lands: MV3 gives the onInstalled listener no completion guarantee.
async function ensureInstallInit() {
  try {
    const lastSeen = await Store.notifications.getLastSeenVersion();
    if (lastSeen) return;

    console.log("[Musing] Fresh install - fully local mode");

    // Initialize scrape timestamps
    await Store.scrape.resetTimestamps();

    // Initialize with quotes from local database
    await refreshLocalQuoteCache();

    // Persist the fully-defaulted settings shape
    await Store.settings.set(await Store.settings.get());

    // Version marker last: its presence means init completed
    await Store.notifications.setLastSeenVersion(chrome.runtime.getManifest().version);
  } catch (error) {
    console.error("[Musing] Install init failed, will retry on next worker start:", error);
  }
}
ensureInstallInit();

// Reconcile the persisted scrape-tab registry on every worker start: a browser
// crash can leave stale entries, and Chrome recycles tab ids, so a past-due
// scrape-timeout alarm could otherwise close an unrelated user tab. Drop any
// entry whose tab no longer exists or whose host no longer matches the
// recorded platform, and clear its timeout alarm, before any alarm can act.
async function reconcileScrapeTabs() {
  const tracked = await Store.scrape.tabs();
  for (const key of Object.keys(tracked)) {
    const tabId = parseInt(key, 10);
    const info = tracked[key];
    let valid = false;
    try {
      const tab = await chrome.tabs.get(tabId);
      valid = detectPlatformFromUrl(tab.url || "") === info.platform;
    } catch {
      valid = false; // Tab no longer exists
    }
    if (!valid) {
      await Store.scrape.removeTab(tabId);
      chrome.alarms.clear(`scrape-timeout-${tabId}`);
    }
  }
}
reconcileScrapeTabs();

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    const currentVersion = chrome.runtime.getManifest().version;
    console.log("[Musing] Extension event:", details.reason, "version:", currentVersion);

    if (details.reason === "install") {
      await ensureInstallInit();
    } else if (details.reason === "update") {
      const previousVersion = details.previousVersion;
      console.log("[Musing] Extension updated from", previousVersion, "to", currentVersion);

      const notificationSettings = await Store.notifications.getSettings();

      if (notificationSettings.showUpdateNotifications && previousVersion !== currentVersion) {
        await Store.notifications.setPendingUpdate({
          previousVersion,
          currentVersion,
          timestamp: Date.now(),
        });
        console.log("[Musing] Stored pending update notification");
      }

      // Update stored version
      await Store.notifications.setLastSeenVersion(currentVersion);
    }
  } catch (error) {
    console.error("[Musing] onInstalled handling failed:", error);
  }
});

async function getProactiveScrapeEnabled() {
  const settings = await Store.settings.get();
  return settings.proactiveScrapeEnabled;
}

// Check for stale scrapes on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log("[Musing] Extension startup - checking for stale scrapes");
  await reconcileScrapeTabs();
  await checkAndTriggerProactiveScrapes();
});

// Handle alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (alarm.name === "check-stale-scrapes") {
      console.log("[Musing] Checking for stale scrapes");
      await checkAndTriggerProactiveScrapes();
    }
    if (alarm.name === "process-pending-conversations") {
      console.log("[Musing] Processing conversations deferred by rate limit");
      await processConversationsLocally();
    }
    // Proactive scrape timeout; closeBackgroundScrapeTab re-reads tracked
    // tabs from storage, so this works in a fresh worker instance
    if (alarm.name.startsWith("scrape-timeout-")) {
      const tabId = parseInt(alarm.name.replace("scrape-timeout-", ""), 10);
      console.log("[Musing] Scrape timeout for tab", tabId);
      await closeBackgroundScrapeTab(tabId);
    }
  } catch (error) {
    console.error("[Musing] Alarm handling failed:", alarm.name, error);
  }
});

// Clean up tracking and the timeout alarm when a scrape tab is closed manually
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // Cheap guard: every tab closed anywhere fires this, but the registry is
  // usually empty. A plain read avoids waking the lock-serialized RMW unless
  // the closed tab is actually tracked.
  const tracked = await Store.scrape.tabs();
  if (!tracked[tabId]) return;

  const info = await Store.scrape.removeTab(tabId);
  if (info) {
    chrome.alarms.clear(`scrape-timeout-${tabId}`);
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate sender is from this extension
  if (sender.id !== chrome.runtime.id) {
    console.warn("[Musing] Message from unknown sender:", sender.id);
    sendResponse({ error: "Unauthorized" });
    return false;
  }

  if (!message || typeof message.type !== "string") {
    sendResponse({ error: "Invalid message" });
    return false;
  }

  // Responding async (return true) keeps the open message port alive, which
  // keeps the worker alive until the handler's storage writes land.
  const respondWith = (promise) => {
    promise
      .then(sendResponse)
      .catch((error) => {
        console.error("[Musing] Message handler failed:", message.type, error);
        sendResponse({ success: false, error: error?.message });
      });
    return true;
  };

  switch (message.type) {
    case "CONVERSATION_UPDATE":
      return respondWith(handleConversationUpdate(message.data, sender).then(() => ({ success: true })));
    case "API_CAPTURE":
      return respondWith(handleApiCapture(message.data, sender).then(() => ({ success: true })));
    case "SCRAPE_COMPLETE":
      return respondWith(handleScrapeComplete(message.data, sender).then(() => ({ success: true })));
    case "GET_QUOTE":
      return respondWith(getQuoteForDisplay());
    case "FORCE_SYNC":
      return respondWith(handleForceSync());
    case "GET_PENDING_NOTIFICATIONS":
      return respondWith(getPendingNotifications());
    case "DISMISS_NOTIFICATION":
      return respondWith(dismissNotification(message.notificationId));
    case "PROCESS_HISTORY":
      return respondWith(processHistoryThemes());
    default:
      sendResponse({ error: `Unknown message type: ${message.type}` });
      return false;
  }
});

/**
 * Get pending notifications for the new tab page
 */
async function getPendingNotifications() {
  const [{ pendingUpdate, dismissed }, settings] = await Promise.all([
    Store.notifications.getPendingState(),
    Store.notifications.getSettings(),
  ]);

  const notifications = [];

  // Check for update notification
  if (pendingUpdate && settings.showUpdateNotifications) {
    const notificationId = `update-${pendingUpdate.currentVersion}`;
    if (!dismissed.includes(notificationId)) {
      notifications.push({
        id: notificationId,
        type: "update",
        title: `Updated to v${pendingUpdate.currentVersion}`,
        previousVersion: pendingUpdate.previousVersion,
        currentVersion: pendingUpdate.currentVersion,
        timestamp: pendingUpdate.timestamp,
      });
    }
  }

  return { notifications };
}

/**
 * Dismiss a notification
 */
async function dismissNotification(notificationId) {
  await Store.notifications.dismiss(notificationId);
  console.log("[Musing] Notification dismissed:", notificationId);
  return { success: true };
}

/**
 * Process browser history to extract themes
 * Uses the history-extractor module
 */
async function processHistoryThemes() {
  try {
    const settings = await Store.historySettings.get();

    if (!settings.enableBrowserHistory) {
      console.log("[Musing] History processing skipped - not enabled");
      return { success: true, skipped: true };
    }

    // Extract themes from history using the history-extractor module
    const result = await extractHistoryThemes(settings);

    if (result.themes && result.themes.length > 0) {
      await Store.themes.setHistoryThemes({
        themes: result.themes,
        extractedAt: Date.now(),
        sourceCount: result.sourceCount,
        titleCount: result.titleCount || 0,
      });

      console.log("[Musing] History themes extracted:", result.themes.length, "themes from", result.sourceCount, "sources");

      // Refresh quote cache with combined themes
      await refreshQuoteCacheWithHistoryThemes();
    }

    return { success: true, themes: result.themes, sourceCount: result.sourceCount };
  } catch (error) {
    console.error("[Musing] History processing failed:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Refresh quote cache combining conversation themes and history themes
 */
async function refreshQuoteCacheWithHistoryThemes() {
  const [conversationThemes, historyData] = await Promise.all([
    Store.themes.getExtracted(),
    Store.themes.getHistoryThemes(),
  ]);

  const historyThemes = historyData.themes || [];

  // Combine themes, weighting conversation themes above history themes
  const combinedThemes = combineThemes(conversationThemes, historyThemes);

  // Refresh quote cache with combined themes
  await refreshLocalQuoteCache(combinedThemes);
}

/**
 * Handle manual sync from popup
 * Refreshes local quote cache and updates sync timestamp
 */
async function handleForceSync() {
  try {
    await processConversationsLocally();
    await Store.sync.markSynced();
    console.log("[Musing] Manual sync completed");
    return { success: true };
  } catch (error) {
    console.error("[Musing] Sync failed:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle conversation data from content scripts
 * All processing is done locally - no data sent to external servers
 */
async function handleConversationUpdate(conversationText, sender) {
  await Store.conversations.add(conversationText);

  // Update scrape timestamp for this platform
  const platform = detectPlatformFromUrl(sender?.tab?.url || "");
  if (platform) {
    await Store.scrape.markScraped(platform);
  }

  // Process locally with rate limiting
  const lastProcess = await Store.conversations.lastProcessedAt();
  const timeSinceLastProcess = Date.now() - lastProcess;

  if (timeSinceLastProcess > MIN_PROCESS_INTERVAL_MS) {
    console.log("[Musing] Processing conversation locally");
    await processConversationsLocally();
  } else {
    // Catch-up: conversations that arrive inside the rate-limit window are
    // processed once the window ends
    const remainingMs = MIN_PROCESS_INTERVAL_MS - timeSinceLastProcess;
    chrome.alarms.create("process-pending-conversations", {
      delayInMinutes: Math.max(1, Math.ceil(remainingMs / 60000)),
    });
  }
}

/**
 * Handle API capture from injector
 */
async function handleApiCapture(data, sender) {
  const { platform, text, source } = data;

  console.log("[Musing] API capture received:", platform, "length:", text?.length);

  if (!text || text.length < 20) return;

  // Store API captures separately (more structured data)
  await Store.conversations.addCapture({
    platform,
    text: text.slice(0, 2000),
    source,
    timestamp: Date.now(),
    url: sender?.tab?.url,
  });

  // Also add to conversations for quote generation
  await handleConversationUpdate(text, sender);
}

/**
 * Handle scrape complete signal from content scripts
 */
async function handleScrapeComplete(data, sender) {
  const { platform, sidebar } = data;
  const tabId = sender?.tab?.id;

  console.log("[Musing] Scrape complete:", platform, "sidebar items:", sidebar?.length);

  // Update scrape timestamp
  if (platform) {
    await Store.scrape.markScraped(platform);
  }

  // Store sidebar data if provided
  if (sidebar && sidebar.length > 0) {
    const sidebarText = sidebar.slice(0, 20).join("\n");
    await handleConversationUpdate(sidebarText, sender);
  }

  // If this was a background scrape tab, close it (no-op for user tabs)
  if (tabId) {
    await closeBackgroundScrapeTab(tabId);
  }
}

/**
 * Detect platform from URL
 */
function detectPlatformFromUrl(url) {
  if (!url) return null;
  const platform = PLATFORMS.find((p) => url.includes(p.host));
  return platform ? platform.id : null;
}

/**
 * Check for stale scrapes and trigger proactive scraping
 */
async function checkAndTriggerProactiveScrapes() {
  if (!(await getProactiveScrapeEnabled())) {
    return;
  }

  const timestamps = await Store.scrape.timestamps();
  const now = Date.now();

  for (const { id: platform, url } of PLATFORMS) {
    const lastScrape = timestamps[platform] || 0;
    const timeSinceLastScrape = now - lastScrape;

    if (timeSinceLastScrape > STALE_THRESHOLD_MS) {
      console.log(`[Musing] ${platform} scrape is stale, triggering proactive scrape`);
      // Every stale platform gets a tab; a break here would let one
      // permanently-stale platform (e.g. signed out) starve the others
      await createBackgroundScrapeTab(platform, url);
    }
  }
}

/**
 * Create a background tab for proactive scraping
 */
async function createBackgroundScrapeTab(platform, url) {
  // Check if we already have a background tab for this platform
  const tracked = await Store.scrape.tabs();
  if (Object.values(tracked).some((info) => info.platform === platform)) {
    console.log(`[Musing] Background tab already exists for ${platform}`);
    return;
  }

  try {
    const tab = await chrome.tabs.create({
      url,
      active: false, // Open in background
    });

    await Store.scrape.addTab(tab.id, platform);

    // Set timeout to close tab if scrape doesn't complete
    chrome.alarms.create(`scrape-timeout-${tab.id}`, {
      delayInMinutes: PROACTIVE_SCRAPE_TIMEOUT_MS / 60000,
    });

    console.log(`[Musing] Created background scrape tab for ${platform}:`, tab.id);
  } catch (error) {
    console.error(`[Musing] Failed to create background tab for ${platform}:`, error);
  }
}

/**
 * Close a background scrape tab
 */
async function closeBackgroundScrapeTab(tabId) {
  const info = await Store.scrape.removeTab(tabId);
  if (!info) return; // Not a tracked scrape tab

  // Clear the timeout alarm
  chrome.alarms.clear(`scrape-timeout-${tabId}`);

  // Re-validate before removing: Chrome recycles tab ids, so this id could now
  // point at an unrelated user tab. Only remove a tab whose host still matches
  // the recorded platform; otherwise forget the entry without touching the tab.
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return; // Tab no longer exists; nothing to close
  }
  if (detectPlatformFromUrl(tab.url || "") !== info.platform) {
    console.warn(`[Musing] Scrape tab ${tabId} host no longer matches ${info.platform}; not closing`);
    return;
  }

  try {
    await chrome.tabs.remove(tabId);
    console.log(`[Musing] Closed background scrape tab for ${info.platform}:`, tabId);
  } catch (error) {
    // Tab might already be closed
    console.debug(`[Musing] Tab ${tabId} already closed or error:`, error.message);
  }
}

/**
 * Process conversations locally to extract themes and update quote cache
 * FULLY LOCAL - No network requests
 */
async function processConversationsLocally() {
  const conversations = await Store.conversations.list();

  const combinedText = conversations.join("\n\n");

  // Extract themes using local keyword matching
  const themes = extractThemes(combinedText, 5);
  const blockedSet = await Store.themes.blockedSet();
  const filteredThemes = filterBlockedThemes(themes, blockedSet);

  console.log(
    "[Musing] Extracted themes locally:",
    filteredThemes.map((t) => `${t.theme} ${t.score.toFixed(2)}`)
  );

  // Store extracted themes
  await Store.themes.setExtracted(filteredThemes);
  await Store.conversations.markProcessed();

  // Refresh through the combined path, so the cache is keyed on the same theme
  // set getQuoteForDisplay ranks with. Keying on conversation themes alone
  // would flip the key on every history extraction and rebuild each time.
  await refreshQuoteCacheWithHistoryThemes();
}

/**
 * Refresh the local quote cache based on themes
 * Uses the bundled quotes database - no network requests
 */
async function refreshLocalQuoteCache(themes = []) {
  const blockedSet = await Store.themes.blockedSet();
  const filteredThemes = filterBlockedThemes(themes, blockedSet);
  const themeKey = buildThemeKey(filteredThemes);

  // Ranked matches from the local database (async); the cache holds plain
  // quote objects, so the scores are used for ordering only
  const matchingQuotes = await findQuotesByThemes(filteredThemes, DEFAULT_CACHE_SIZE);
  const unblockedMatching = matchingQuotes
    .map((match) => match.quote)
    .filter((q) => !quoteIsBlocked(q, blockedSet));

  const previousKey = await Store.quotes.getThemeKey();
  let nextCache;

  if (previousKey !== themeKey) {
    // Topic changed: rebuild from the ranked matches so a past topic stops
    // feeding today's quotes
    nextCache = unblockedMatching;
    console.log("[Musing] Theme key changed, rebuilding cache:", previousKey, "->", themeKey);
  } else {
    // Same topic: keep the pool, dropping quotes whose themes have since been
    // blocked; new themed quotes first, Store.quotes.setCache caps the size
    const existing = await Store.quotes.getCache();
    const keptExisting = existing.filter((q) => !quoteIsBlocked(q, blockedSet));
    const existingIds = new Set(keptExisting.map((q) => q.id));
    const newQuotes = unblockedMatching.filter((q) => !existingIds.has(q.id));
    nextCache = [...newQuotes, ...keptExisting];
  }

  await Store.quotes.setCache(nextCache);
  await Store.quotes.setThemeKey(themeKey);
  console.log("[Musing] Local cache updated, total quotes:", nextCache.length, "themes:", themeKey);
}

/**
 * Get a quote to display, avoiding recently shown ones
 * Uses local quote database - no network requests for base functionality
 * Optionally uses AI API for personalized reasons if enabled
 *
 * Shown-quote tracking happens at display time (newtab calls
 * Store.history.recordShown), not here.
 */
async function getQuoteForDisplay() {
  const [quotes, shownIds, themes, conversations, aiSettings, historyData, blockedSet] =
    await Promise.all([
      Store.quotes.getCache(),
      Store.history.recentIds(),
      Store.themes.getExtracted(),
      Store.conversations.list(),
      Store.ai.get(),
      Store.themes.getHistoryThemes(),
      Store.themes.blockedSet(),
    ]);

  // Combine conversation themes with history themes, then drop blocked ones
  const historyThemes = historyData.themes || [];
  const combinedThemes = filterBlockedThemes(combineThemes(themes, historyThemes), blockedSet);

  // Ensure quotes are loaded from JSON
  await ensureQuotesLoaded();

  // Use cached quotes if available, otherwise get from local database
  let availableQuotes = quotes.length > 0 ? quotes : QUOTES_DB;

  // If cache is low, refresh from local database with combined themes
  if (quotes.length < MIN_CACHE_SIZE) {
    availableQuotes = (await findQuotesByThemes(combinedThemes, DEFAULT_CACHE_SIZE)).map((m) => m.quote);
  }

  // Filter out recently shown quotes; Store owns the anti-repeat window size
  const recentlyShown = new Set(shownIds.slice(0, Store.MAX_SHOWN_IDS));
  let available = availableQuotes.filter((q) => !recentlyShown.has(q.id)).filter((q) => !quoteIsBlocked(q, blockedSet));

  // If all have been shown, reset and get fresh quotes
  if (available.length === 0) {
    available = (await findQuotesByThemes(combinedThemes, DEFAULT_CACHE_SIZE))
      .map((m) => m.quote)
      .filter((q) => !quoteIsBlocked(q, blockedSet));
    await Store.history.resetShownIds();
  }

  // Rank the survivors against the combined themes, then sample by score
  // squared. Cache order is not trusted: it can hold quotes from a merge.
  const picked = weightedPick(scoreQuotes(available, combinedThemes));

  // Can still be empty if quotes.json failed to load or every candidate is
  // theme-blocked — newtab falls back on a null response
  const quote = picked?.quote;
  if (!quote) {
    console.warn("[Musing] No quotes available to display");
    return null;
  }

  // Matched themes, sorted by what each contributed to the pick, so the first
  // entry is the theme that drove it
  const userThemes = new Map(combinedThemes.map((t) => [t.theme.toLowerCase(), t]));
  const contributions = (quote.themes || [])
    .map((name) => ({ name: String(name), entry: userThemes.get(String(name).toLowerCase()) }))
    .filter((m) => m.entry)
    .map((m) => ({ ...m, contribution: m.entry.score * themeIdf(m.name) }))
    .sort((a, b) => b.contribution - a.contribution);
  const matchedThemes = contributions.map((m) => m.name);

  // A fallback pick earned no reason; sending one would imply causation
  const driver = picked.score > 0 ? contributions[0] : null;
  const origin = driver ? "matched" : "fallback";
  const reason = {
    theme: driver ? driver.name : null,
    terms: driver ? (driver.entry.terms || []).slice(0, MAX_REASON_TERMS) : [],
    origin,
  };

  // Try to generate AI reason if enabled
  let aiReason = null;
  const apiKey = aiSettings.aiApiKeys[aiSettings.aiProvider];
  if (aiSettings.aiEnabled && apiKey && conversations.length > 0) {
    try {
      aiReason = await generateAIReason(quote, conversations, aiSettings);
      console.log("[Musing] AI reason generated:", aiReason ? "success" : "fallback to themes");
    } catch (error) {
      console.warn("[Musing] AI reason generation error:", error.message);
    }
  }

  return {
    ...quote,
    matchedThemes: matchedThemes.length > 0 ? matchedThemes : null,
    origin,
    reason,
    aiReason: aiReason,
  };
}
