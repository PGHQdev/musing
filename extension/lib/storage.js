/**
 * Store — single owner of the chrome.storage.local namespace.
 *
 * Every key name, default value, and read-modify-write sequence lives here.
 * Callers use the grouped intents below and never see a raw key string.
 *
 * Loaded in three contexts: importScripts (service worker), <script> tags
 * (popup/newtab), and content_scripts (isolated worlds). Each context gets
 * its own instance; the storage area itself is shared.
 */

/**
 * Authoritative platform registry. Every JS consumer (service worker, popup,
 * newtab, content scripts) loads this file, so the id/label/host/url/settings
 * mapping lives here once. manifest.json match lists cannot execute JS and
 * must be kept in agreement by hand.
 */
const PLATFORMS = [
  { id: "claude", label: "Claude.ai", host: "claude.ai", url: "https://claude.ai/", settingsKey: "enableClaude" },
  { id: "chatgpt", label: "ChatGPT", host: "chatgpt.com", url: "https://chatgpt.com/", settingsKey: "enableChatGPT" },
  { id: "gemini", label: "Gemini", host: "gemini.google.com", url: "https://gemini.google.com/app", settingsKey: "enableGemini" },
];

const Store = (() => {
  const K = {
    SETTINGS: "musing_settings",
    AI_SETTINGS: "ai_settings",
    AI_REASON_CACHE: "ai_reason_cache",
    NOTIFICATION_SETTINGS: "notification_settings",
    PENDING_UPDATE: "pending_update",
    NOTIFICATIONS_DISMISSED: "notifications_dismissed",
    LAST_SEEN_VERSION: "last_seen_version",
    HISTORY_SETTINGS: "history_settings",
    QUOTES: "cached_quotes",
    DAILY_QUOTE: "daily_quote_state",
    FAVORITES: "favorite_quotes",
    BLOCKED_THEMES: "blocked_themes",
    EXTRACTED_THEMES: "extracted_themes",
    HISTORY_THEMES: "history_themes",
    SHOWN_QUOTE_IDS: "shown_quote_ids",
    SHOWN_QUOTES_HISTORY: "shown_quotes_history",
    CONVERSATIONS: "recent_conversations",
    LAST_PROCESS: "last_process_timestamp",
    API_CAPTURES: "api_captures",
    SCRAPE_LOG: "scrape_log",
    LAST_SCRAPE: "last_scrape_timestamps",
    SCRAPE_TABS: "background_scrape_tabs",
    LAST_SYNC: "last_sync_timestamp",
    ONBOARDING: "onboarding_complete",
  };

  const SETTINGS_DEFAULTS = {
    enableClaude: true,
    enableChatGPT: true,
    enableGemini: true,
    enableApiCapture: true,
    dailyQuoteEnabled: false,
    showThemeChips: true,
    proactiveScrapeEnabled: false,
  };

  const AI_DEFAULTS = {
    aiEnabled: false,
    aiProvider: "groq",
    aiModel: "llama-3.3-70b-versatile",
    aiApiKeys: { groq: "", claude: "", openai: "" },
  };

  const NOTIFICATION_DEFAULTS = {
    showUpdateNotifications: true,
    showPromotions: true,
  };

  const HISTORY_SETTINGS_DEFAULTS = {
    enableBrowserHistory: false,
    historyDaysBack: 7,
    excludedDomains: [],
  };

  const MAX_CONVERSATIONS = 5;
  const MAX_CONVERSATION_CHARS = 2000;
  const MAX_API_CAPTURES = 10;
  const MAX_SCRAPE_LOG_ENTRIES = 20;
  const MAX_FAVORITES = 200;
  const MAX_BLOCKED_THEMES = 200;
  const MAX_SHOWN_IDS = 20;
  const MAX_SHOWN_HISTORY = 80;
  const MAX_DISMISSED = 20;
  const MAX_CACHED_QUOTES = 30;
  const VALID_PLATFORMS = PLATFORMS.map((p) => p.id);

  // Single internal seam to the backend; tests stub globalThis.chrome.
  const backend = () => chrome.storage.local;

  async function read(key, fallback) {
    // An absent key resolves normally (get returns {}), so only a genuine
    // backend failure reaches the catch. Rethrow it: swallowing here would let
    // a read-modify-write intent persist fallback-derived state over real data,
    // and would defeat callers that must know a load failed (popup's
    // disable-until-loaded guard). Display-only callers that prefer a silent
    // fallback wrap their own read in try/catch.
    const data = await backend().get(key);
    const value = data[key];
    return value === undefined || value === null ? fallback : value;
  }

  async function readArray(key) {
    const value = await read(key, []);
    return Array.isArray(value) ? value : [];
  }

  function write(entries) {
    return backend().set(entries);
  }

  // Every read-modify-write intent runs through this queue so concurrent
  // callers in the same context cannot interleave read → mutate → write.
  // On top of the queue, a Web Lock serializes across extension-origin
  // contexts (newtab, popup, service worker), which share one lock scope.
  // The lock is used only in the chrome-extension origin: a content script's
  // navigator.locks live in the page-origin partition, where a hostile page
  // script could take "musing-rmw" and stall every content-script write, so
  // content scripts keep per-context queueing only. Environments without
  // navigator.locks (e.g. Node tests) also fall back.
  // Serialized tasks must not call other serialized intents (deadlock).
  const isExtensionOrigin =
    typeof location !== "undefined" && location.protocol === "chrome-extension:";
  const runExclusive =
    isExtensionOrigin && typeof navigator !== "undefined" && navigator.locks
      ? (task) => navigator.locks.request("musing-rmw", task)
      : (task) => task();
  let rmwQueue = Promise.resolve();
  function serialize(task) {
    const result = rmwQueue.then(() => runExclusive(task));
    rmwQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  // One global onChanged listener fans out to subscribers; onChanged returns
  // an unsubscribe handle instead of registering a fresh listener per call.
  const settingsChangeCallbacks = new Set();
  let settingsListenerRegistered = false;

  const settings = {
    async get() {
      const raw = await read(K.SETTINGS, {});
      return { ...SETTINGS_DEFAULTS, ...raw };
    },
    set(value) {
      return write({ [K.SETTINGS]: value });
    },
    onChanged(callback) {
      settingsChangeCallbacks.add(callback);
      if (!settingsListenerRegistered) {
        settingsListenerRegistered = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === "local" && changes[K.SETTINGS]) {
            const value = { ...SETTINGS_DEFAULTS, ...(changes[K.SETTINGS].newValue || {}) };
            settingsChangeCallbacks.forEach((cb) => cb(value));
          }
        });
      }
      return () => settingsChangeCallbacks.delete(callback);
    },
  };

  const ai = {
    async get() {
      const raw = await read(K.AI_SETTINGS, {});
      const merged = {
        ...AI_DEFAULTS,
        ...raw,
        aiApiKeys: { ...AI_DEFAULTS.aiApiKeys, ...(raw.aiApiKeys || {}) },
      };
      // Migrate legacy single-key format into the per-provider map
      if (raw.aiApiKey && !raw.aiApiKeys) {
        merged.aiApiKeys = { ...merged.aiApiKeys, [merged.aiProvider]: raw.aiApiKey };
      }
      return merged;
    },
    set(value) {
      return write({ [K.AI_SETTINGS]: value });
    },
    getReasonCache() {
      return read(K.AI_REASON_CACHE, {});
    },
    setReasonCache(cache) {
      return write({ [K.AI_REASON_CACHE]: cache });
    },
  };

  const notifications = {
    async getSettings() {
      const raw = await read(K.NOTIFICATION_SETTINGS, {});
      return { ...NOTIFICATION_DEFAULTS, ...raw };
    },
    setSettings(value) {
      return write({ [K.NOTIFICATION_SETTINGS]: value });
    },
    async getPendingState() {
      const data = await backend().get([K.PENDING_UPDATE, K.NOTIFICATIONS_DISMISSED]);
      return {
        pendingUpdate: data[K.PENDING_UPDATE] || null,
        dismissed: data[K.NOTIFICATIONS_DISMISSED] || [],
      };
    },
    setPendingUpdate(info) {
      return write({ [K.PENDING_UPDATE]: info });
    },
    dismiss(notificationId) {
      return serialize(async () => {
        const dismissed = await readArray(K.NOTIFICATIONS_DISMISSED);
        if (!dismissed.includes(notificationId)) {
          dismissed.push(notificationId);
          await write({ [K.NOTIFICATIONS_DISMISSED]: dismissed.slice(-MAX_DISMISSED) });
        }
        if (notificationId.startsWith("update-")) {
          await backend().remove(K.PENDING_UPDATE);
        }
      });
    },
    getLastSeenVersion() {
      return read(K.LAST_SEEN_VERSION, null);
    },
    setLastSeenVersion(version) {
      return write({ [K.LAST_SEEN_VERSION]: version });
    },
  };

  const historySettings = {
    async get() {
      const raw = await read(K.HISTORY_SETTINGS, {});
      return { ...HISTORY_SETTINGS_DEFAULTS, ...raw };
    },
    set(value) {
      return write({ [K.HISTORY_SETTINGS]: value });
    },
  };

  const quotes = {
    getCache() {
      return readArray(K.QUOTES);
    },
    setCache(list) {
      return write({ [K.QUOTES]: list.slice(0, MAX_CACHED_QUOTES) });
    },
    getDailyState() {
      return read(K.DAILY_QUOTE, null);
    },
    setDailyState(state) {
      return write({ [K.DAILY_QUOTE]: state });
    },
  };

  const favorites = {
    list() {
      return readArray(K.FAVORITES);
    },
    async isFavorite(id) {
      if (!id) return false;
      const list = await favorites.list();
      return list.some((q) => q?.id === id);
    },
    toggle(quote) {
      if (!quote?.id) return Promise.resolve({ favorited: false });
      return serialize(async () => {
        const list = await favorites.list();
        const existingIndex = list.findIndex((q) => q?.id === quote.id);
        if (existingIndex >= 0) {
          list.splice(existingIndex, 1);
          await write({ [K.FAVORITES]: list });
          return { favorited: false };
        }
        const entry = {
          id: quote.id,
          text: quote.text,
          author: quote.author,
          themes: quote.themes || [],
          savedAt: Date.now(),
        };
        await write({ [K.FAVORITES]: [entry, ...list].slice(0, MAX_FAVORITES) });
        return { favorited: true };
      });
    },
    remove(id) {
      if (!id) return Promise.resolve();
      return serialize(async () => {
        const list = await favorites.list();
        await write({ [K.FAVORITES]: list.filter((q) => q?.id !== id) });
      });
    },
    clear() {
      return serialize(() => write({ [K.FAVORITES]: [] }));
    },
  };

  const themes = {
    async blocked() {
      const list = await readArray(K.BLOCKED_THEMES);
      return list.map((t) => String(t).toLowerCase()).filter(Boolean);
    },
    async blockedSet() {
      return new Set(await themes.blocked());
    },
    block(name) {
      const normalized = String(name || "").toLowerCase().trim();
      if (!normalized) return Promise.resolve();
      return serialize(async () => {
        const list = await themes.blocked();
        if (!list.includes(normalized)) {
          await write({ [K.BLOCKED_THEMES]: [normalized, ...list].slice(0, MAX_BLOCKED_THEMES) });
        }
      });
    },
    unblock(name) {
      const normalized = String(name || "").toLowerCase().trim();
      if (!normalized) return Promise.resolve();
      return serialize(async () => {
        const list = await themes.blocked();
        await write({ [K.BLOCKED_THEMES]: list.filter((t) => t !== normalized) });
      });
    },
    clearBlocked() {
      return serialize(() => write({ [K.BLOCKED_THEMES]: [] }));
    },
    getExtracted() {
      return readArray(K.EXTRACTED_THEMES);
    },
    setExtracted(list) {
      return write({ [K.EXTRACTED_THEMES]: list });
    },
    getHistoryThemes() {
      return read(K.HISTORY_THEMES, {});
    },
    setHistoryThemes(data) {
      return write({ [K.HISTORY_THEMES]: data });
    },
  };

  const history = {
    recentIds() {
      return readArray(K.SHOWN_QUOTE_IDS);
    },
    /**
     * Record that a quote was actually shown: updates both anti-repeat
     * mechanisms (recency ids + the history ledger) in one intent.
     */
    async recordShown(quote) {
      if (!quote?.id) return;
      try {
        await serialize(async () => {
          const ids = await history.recentIds();
          const dedupedIds = [quote.id, ...ids.filter((id) => id !== quote.id)].slice(0, MAX_SHOWN_IDS);
          const ledger = await readArray(K.SHOWN_QUOTES_HISTORY);
          const entry = {
            id: quote.id,
            text: quote.text,
            author: quote.author,
            themes: quote.themes || [],
            shownAt: Date.now(),
          };
          const dedupedLedger = [entry, ...ledger.filter((h) => h?.id !== quote.id)].slice(0, MAX_SHOWN_HISTORY);
          await write({
            [K.SHOWN_QUOTE_IDS]: dedupedIds,
            [K.SHOWN_QUOTES_HISTORY]: dedupedLedger,
          });
        });
      } catch {
        // Storage failure here must never block displaying the quote
      }
    },
    resetShownIds() {
      return serialize(() => write({ [K.SHOWN_QUOTE_IDS]: [] }));
    },
  };

  const conversations = {
    list() {
      return readArray(K.CONVERSATIONS);
    },
    add(text) {
      return serialize(async () => {
        const existing = await conversations.list();
        const trimmed = text.slice(0, MAX_CONVERSATION_CHARS);
        await write({ [K.CONVERSATIONS]: [trimmed, ...existing].slice(0, MAX_CONVERSATIONS) });
      });
    },
    lastProcessedAt() {
      return read(K.LAST_PROCESS, 0);
    },
    markProcessed() {
      return write({ [K.LAST_PROCESS]: Date.now() });
    },
    addCapture(capture) {
      return serialize(async () => {
        const existing = await readArray(K.API_CAPTURES);
        await write({ [K.API_CAPTURES]: [capture, ...existing].slice(0, MAX_API_CAPTURES) });
      });
    },
  };

  const scrape = {
    log() {
      return readArray(K.SCRAPE_LOG);
    },
    appendLog(entry) {
      return serialize(async () => {
        const logs = await scrape.log();
        await write({ [K.SCRAPE_LOG]: [entry, ...logs].slice(0, MAX_SCRAPE_LOG_ENTRIES) });
      });
    },
    timestamps() {
      return read(K.LAST_SCRAPE, {});
    },
    markScraped(platform) {
      if (!VALID_PLATFORMS.includes(platform)) return Promise.resolve();
      return serialize(async () => {
        const timestamps = await scrape.timestamps();
        timestamps[platform] = Date.now();
        await write({ [K.LAST_SCRAPE]: timestamps });
      });
    },
    resetTimestamps() {
      return serialize(() => write({ [K.LAST_SCRAPE]: Object.fromEntries(PLATFORMS.map((p) => [p.id, 0])) }));
    },
    /**
     * Background scrape tab registry: { [tabId]: { platform, createdAt } }.
     * Persisted so timeout alarms and onRemoved cleanup survive worker
     * suspension (in-memory Maps do not).
     */
    tabs() {
      return read(K.SCRAPE_TABS, {});
    },
    addTab(tabId, platform) {
      return serialize(async () => {
        const tabs = await read(K.SCRAPE_TABS, {});
        tabs[tabId] = { platform, createdAt: Date.now() };
        await write({ [K.SCRAPE_TABS]: tabs });
      });
    },
    /** Removes and returns the tracked entry, or null if untracked. */
    removeTab(tabId) {
      return serialize(async () => {
        const tabs = await read(K.SCRAPE_TABS, {});
        const info = tabs[tabId] || null;
        if (info) {
          delete tabs[tabId];
          await write({ [K.SCRAPE_TABS]: tabs });
        }
        return info;
      });
    },
  };

  const sync = {
    lastSyncAt() {
      return read(K.LAST_SYNC, null);
    },
    markSynced() {
      return write({ [K.LAST_SYNC]: Date.now() });
    },
  };

  const onboarding = {
    async isDone() {
      return Boolean(await read(K.ONBOARDING, false));
    },
    markDone() {
      return write({ [K.ONBOARDING]: true });
    },
  };

  /** Wipe everything captured from the user's browsing (popup "clear data"). */
  function clearCapturedData() {
    // Serialized so a concurrent conversations.add / appendLog cannot write the
    // just-cleared data back after the remove lands.
    return serialize(() => backend().remove([K.SCRAPE_LOG, K.CONVERSATIONS, K.QUOTES]));
  }

  /** Raw dump of the whole storage area (popup debug view). */
  function dumpAll() {
    return backend().get(null);
  }

  return {
    MAX_SHOWN_IDS,
    settings,
    ai,
    notifications,
    historySettings,
    quotes,
    favorites,
    themes,
    history,
    conversations,
    scrape,
    sync,
    onboarding,
    clearCapturedData,
    dumpAll,
  };
})();

// Export for use in extension
if (typeof module !== "undefined" && module.exports) {
  module.exports = { Store, PLATFORMS };
}
