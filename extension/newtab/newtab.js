/**
 * New Tab Page Script
 * Displays cached quotes instantly
 */

(function () {
  "use strict";

  // Contextual reasons for each theme - explains why a quote was recommended.
  // `lead` is the full sentence clause (unchanged from before). `phrase` is the
  // same clause with the pronoun opener removed, for use beside matched terms.
  const THEME_REASONS = {
    programming: { lead: "you've been writing code", phrase: "writing code" },
    debugging: { lead: "you've been troubleshooting code", phrase: "troubleshooting code" },
    architecture: { lead: "you've been designing systems", phrase: "designing systems" },
    algorithms: { lead: "you've been working on algorithms", phrase: "working on algorithms" },
    learning: { lead: "you're exploring new concepts", phrase: "exploring new concepts" },
    growth: { lead: "you're focused on self-improvement", phrase: "focused on self-improvement" },
    frustration: { lead: "you've been working through a challenge", phrase: "working through a challenge" },
    curiosity: { lead: "you're exploring something new", phrase: "exploring something new" },
    excitement: { lead: "you've had a breakthrough", phrase: "having a breakthrough" },
    anxiety: { lead: "you're navigating uncertainty", phrase: "navigating uncertainty" },
    career: { lead: "you're thinking about your career", phrase: "thinking about your career" },
    relationships: { lead: "you're thinking about relationships", phrase: "thinking about relationships" },
    health: { lead: "you're focused on wellbeing", phrase: "focused on wellbeing" },
    finance: { lead: "you're thinking about finances", phrase: "thinking about finances" },
    persistence: { lead: "you're pushing through difficulty", phrase: "pushing through difficulty" },
    patience: { lead: "you're playing the long game", phrase: "playing the long game" },
    simplicity: { lead: "you're simplifying things", phrase: "simplifying things" },
    complexity: { lead: "you're tackling something complex", phrase: "tackling something complex" },
    wisdom: { lead: "you're seeking deeper understanding", phrase: "seeking deeper understanding" },
    productivity: { lead: "you're optimizing your workflow", phrase: "optimizing your workflow" },
    motivation: { lead: "you're looking for inspiration", phrase: "looking for inspiration" },
    writing: { lead: "you've been writing", phrase: "writing" },
    creativity: { lead: "you're brainstorming ideas", phrase: "brainstorming ideas" },
    "decision-making": { lead: "you're weighing options", phrase: "weighing options" },
    uncertainty: { lead: "you're navigating the unknown", phrase: "navigating the unknown" },
    "problem-solving": { lead: "you're solving problems", phrase: "solving problems" },
    success: { lead: "you're chasing goals", phrase: "chasing goals" },
    failure: { lead: "you're learning from setbacks", phrase: "learning from setbacks" },
    time: { lead: "you're managing your time", phrase: "managing your time" },
    communication: { lead: "you're working on communication", phrase: "working on communication" },
    change: { lead: "you're navigating change", phrase: "navigating change" },
    philosophy: { lead: "you're reflecting on life", phrase: "reflecting on life" },
    courage: { lead: "you're facing something difficult", phrase: "facing something difficult" },
    fear: { lead: "you're confronting fears", phrase: "confronting fears" },
  };

  // Version changelog - keyed by version number
  // Add entries when releasing new versions
  const VERSION_CHANGELOG = {
    "1.2.4": {
      icon: "🔧",
      title: "What's New in v1.2.4",
      items: [
        { icon: "🪟", text: "Fixed the settings popup sometimes opening oversized" },
      ],
    },
    "1.2.3": {
      icon: "⭐",
      title: "What's New in v1.2.3",
      items: [
        { icon: "✨", text: "Small quality-of-life polish" },
      ],
    },
    "1.2.2": {
      icon: "🛡️",
      title: "What's New in v1.2.2",
      items: [
        { icon: "⚡", text: "Quotes load reliably even after the browser sleeps the extension" },
        { icon: "💬", text: "Gemini chats are now captured in full, prompts and replies" },
        { icon: "🔒", text: "Turning a site off stops capture right away" },
        { icon: "🙈", text: "Browser-history matching again skips email, banking, and health sites" },
      ],
    },
    "1.2.0": {
      icon: "🔧",
      title: "What's New in v1.2.0",
      items: [
        { icon: "⚙️", text: "Settings now behave consistently across the popup, new tab, and background" },
        { icon: "🔁", text: "Fixed the proactive refresh toggle acting differently than shown" },
        { icon: "📚", text: "Daily quotes now count toward no-repeat tracking" },
      ],
    },
    "1.1.0": {
      icon: "✨",
      title: "What's New in v1.1.0",
      items: [
        { icon: "⭐", text: "Save favorite quotes and export them anytime" },
        { icon: "�️", text: "Daily quote mode for a calmer new tab" },
        { icon: "🏷️", text: "Theme chips with “less like this” controls" },
        { icon: "�", text: "Quote history plus one-click copy" },
        { icon: "🔕", text: "New proactive refresh toggle to avoid surprise tabs" },
      ],
    },
    // Add more versions as needed
  };

  // Local fallback quotes (used when service worker is unavailable). Every
  // line here is carried by data/quotes.json, so this list holds the same
  // sourced attributions the bank does.
  const LOCAL_FALLBACKS = [
    { text: "The unexamined life is not worth living.", author: "Socrates" },
    { text: "All men by nature desire to know.", author: "Aristotle" },
    { text: "Time is what we want most, but what we use worst.", author: "William Penn" },
    { text: "It is hard to fail, but it is worse never to have tried to succeed.", author: "Theodore Roosevelt" },
    { text: "Chance favors the prepared mind.", author: "Louis Pasteur" },
  ];

  /**
   * Theme copy for a reason line, with a fallback for a theme the table
   * doesn't carry (an extractor theme added after this table was written).
   */
  function getThemeCopy(theme) {
    return THEME_REASONS[theme] || { lead: `you're exploring ${theme}`, phrase: `exploring ${theme}` };
  }

  // Suffix list, longest first. Stemming strips at most one: the first entry
  // in this order the word ends with, falling back to a trailing "e" when
  // none matches ("change" has no listed suffix, but ends in "e").
  const STEM_SUFFIXES = ["ation", "ness", "ing", "ers", "est", "ion", "ed", "es", "er", "ly", "ic", "s"];

  function stem(word) {
    for (const suffix of STEM_SUFFIXES) {
      if (word.length > suffix.length && word.endsWith(suffix)) {
        return word.slice(0, -suffix.length);
      }
    }
    if (word.length > 1 && word.endsWith("e")) {
      return word.slice(0, -1);
    }
    return word;
  }

  /**
   * Two words share a root when their stems are equal ("writer"/"writing"
   * both stem to "writ"), or one stem is a prefix of the other by at least 4
   * characters ("simplest" stems to "simpl", a prefix of "simplify", the
   * stem of "simplifying"). A prefix-length ratio was tried first and
   * dropped: it divides by the shorter word, so an inflected term a
   * character or two longer than the bare keyword ("solved" against
   * "solving") became the shorter side and diluted the ratio below any
   * fixed floor even though the root was identical.
   */
  function sharesRoot(a, b) {
    const stemA = stem(a);
    const stemB = stem(b);
    if (stemA === stemB) return true;
    const shorter = stemA.length <= stemB.length ? stemA : stemB;
    const longer = stemA.length <= stemB.length ? stemB : stemA;
    return shorter.length >= 4 && longer.startsWith(shorter);
  }

  /**
   * Drop any term that already appears in the phrase, so the reason line
   * carries evidence instead of repeating the theme label. A term is dropped
   * when the phrase contains it outright ("complex" inside "tackling
   * something complex", cheap and catches multi-word phrases), or when it
   * shares a root with a phrase word of 4+ characters ("writer" and
   * "writing", "solved" and "solving"). Short phrase words ("on", "the")
   * are excluded so they can't zero out an unrelated term.
   */
  function filterRedundantTerms(phrase, terms) {
    const lowerPhrase = String(phrase).toLowerCase();
    const phraseWords = lowerPhrase.split(/\s+/).filter((w) => w.length >= 4);
    return terms.filter((term) => {
      const lowerTerm = String(term).toLowerCase();
      if (lowerPhrase.includes(lowerTerm)) return false;
      return !phraseWords.some((w) => lowerTerm.includes(w) || sharesRoot(w, lowerTerm));
    });
  }

  /**
   * Compose the recommendation-reason text for a quote payload. Pure function
   * (no DOM), so it can be exercised directly outside the page.
   *
   * Priority: quote.aiReason; then quote.reason when present (fallback origin
   * or no theme renders nothing; matched terms, filtered against the phrase
   * and capped at 2, render beside the phrase; otherwise the plain lead);
   * then, only when quote.reason is absent altogether (a daily quote pinned
   * before this task shipped), quote.matchedThemes[0]'s lead, matching what
   * the page showed before this task. Returns null when no reason should show.
   */
  function composeReason(quote) {
    if (quote && quote.aiReason) return quote.aiReason;

    const reason = quote && quote.reason;
    if (reason) {
      if (reason.origin === "fallback" || !reason.theme) return null;
      const copy = getThemeCopy(reason.theme);
      const rawTerms = Array.isArray(reason.terms) ? reason.terms.filter(Boolean) : [];
      const terms = filterRedundantTerms(copy.phrase, rawTerms).slice(0, 2);
      if (terms.length > 0) {
        const shown = terms.map((t) => `"${t}"`).join(", ");
        return `${copy.phrase} · ${shown}`;
      }
      return copy.lead;
    }

    // No `reason` key at all: a legacy daily-quote record stored before this
    // task shipped. Render what the old code rendered so an upgrading user
    // doesn't lose the reason line for the rest of the day.
    if (Array.isArray(quote?.matchedThemes) && quote.matchedThemes.length > 0) {
      return getThemeCopy(quote.matchedThemes[0]).lead;
    }
    return null;
  }

  const quoteEl = document.getElementById("quote");
  const authorEl = document.getElementById("author");
  const reasonEl = document.getElementById("recommendation-reason");
  const containerEl = document.getElementById("container");
  const refreshEl = document.getElementById("refresh");
  const loadingEl = document.getElementById("loading-indicator");
  const toastEl = document.getElementById("toast");
  const copyQuoteEl = document.getElementById("copy-quote");
  const favoriteQuoteEl = document.getElementById("favorite-quote");
  const favoriteQuoteLabelEl = document.getElementById("favorite-quote-label");
  const ratingPromptEl = document.getElementById("rating-prompt");
  const ratingRateEl = document.getElementById("rating-rate");
  const ratingDismissEl = document.getElementById("rating-dismiss");
  const themeChipsEl = document.getElementById("theme-chips");

  // Notification elements
  const notificationBannerEl = document.getElementById("notification-banner");
  const notificationIconEl = document.getElementById("notification-icon");
  const notificationTitleEl = document.getElementById("notification-title");
  const notificationSubtitleEl = document.getElementById("notification-subtitle");
  const notificationViewBtnEl = document.getElementById("notification-view");
  const notificationDismissBtnEl = document.getElementById("notification-dismiss");

  // What's New modal elements
  const whatsNewEl = document.getElementById("whats-new");
  const whatsNewIconEl = document.getElementById("whats-new-icon");
  const whatsNewTitleEl = document.getElementById("whats-new-title");
  const whatsNewVersionEl = document.getElementById("whats-new-version");
  const whatsNewListEl = document.getElementById("whats-new-list");
  const whatsNewCloseBtnEl = document.getElementById("whats-new-close");

  let isInitialized = false;
  let currentNotification = null;
  let currentQuote = null;
  let toastTimeout = null;
  let dailyQuoteEnabled = false;
  let showThemeChips = true;
  // Incremented per loadQuote call; stale calls bail out when the token moves on
  let loadQuoteToken = 0;
  const GET_QUOTE_TIMEOUT_MS = 3000;
  // Smart Reasons lets the background spend up to its AI budget (10s) before it
  // returns the quote+aiReason. Extend the deadline to cover that budget so the
  // billed reason is shown instead of discarded; only applied when AI is on.
  const GET_QUOTE_AI_TIMEOUT_MS = 12000;
  const GET_QUOTE_TIMED_OUT = Symbol("get-quote-timeout");

  // Rating nudge: never on day one, re-ask far later after a dismiss, then stop.
  const RATING_MIN_OPENS = 15;
  const RATING_RESNOOZE_OPENS = 40;
  const RATING_MAX_DISMISSALS = 2;

  /**
   * Show loading state
   */
  function showLoading() {
    containerEl.classList.add("loading");
    if (loadingEl) {
      loadingEl.classList.add("show");
    }
  }

  /**
   * Hide loading state
   */
  function hideLoading() {
    containerEl.classList.remove("loading");
    if (loadingEl) {
      loadingEl.classList.remove("show");
    }
  }

  /**
   * Display a quote
   */
  function displayQuote(quote, options = {}) {
    const record = options.record !== false;
    if (!quote || !quote.text) {
      quote = getRandomFallback();
    }

    currentQuote = quote;
    quoteEl.textContent = quote.text;
    authorEl.textContent = quote.author;

    // Display recommendation reason - AI reason wins, else the matched terms
    // beside the theme phrase, else the theme lead; a fallback pick shows none.
    const reasonText = composeReason(quote);
    if (reasonText) {
      reasonEl.textContent = reasonText;
      reasonEl.classList.add("show");
    } else {
      reasonEl.textContent = "";
      reasonEl.classList.remove("show");
    }

    hideLoading();
    renderThemeChips(quote);
    updateFavoriteButtonState();
    // A provisional cache paint passes record:false; only the final quote is
    // recorded, so a paint-then-swap never inflates no-repeat history.
    if (record) {
      Store.history.recordShown(quote);
    }
  }

  function showToast(message) {
    if (!toastEl) return;
    if (toastTimeout) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }
    toastEl.textContent = message;
    toastEl.classList.add("show");
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 1600);
  }

  async function copyCurrentQuote() {
    if (!currentQuote || !currentQuote.text) return;
    const text = `"${currentQuote.text}" — ${currentQuote.author || ""}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied");
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.setAttribute("readonly", "true");
        el.style.position = "fixed";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        el.remove();
        showToast("Copied");
      } catch {
        showToast("Copy failed");
      }
    }
  }

  async function updateFavoriteButtonState() {
    if (!favoriteQuoteEl) return;
    // Id-less quotes (local fallbacks) must clear state left by the previous quote
    const isFavorited = currentQuote?.id ? await Store.favorites.isFavorite(currentQuote.id) : false;
    favoriteQuoteEl.classList.toggle("selected", isFavorited);
    favoriteQuoteEl.setAttribute("aria-pressed", isFavorited ? "true" : "false");
    if (favoriteQuoteLabelEl) {
      favoriteQuoteLabelEl.textContent = isFavorited ? "Saved" : "Save";
    }
  }

  async function toggleFavorite() {
    if (!currentQuote || !currentQuote.id) return;
    const { favorited } = await Store.favorites.toggle(currentQuote);
    showToast(favorited ? "Saved" : "Removed");
    updateFavoriteButtonState();
  }

  async function blockTheme(theme) {
    await Store.themes.block(theme);
    showToast("Less like this");
    loadQuote({ forceNew: true });
  }

  function renderThemeChips(quote) {
    if (!themeChipsEl) return;
    themeChipsEl.replaceChildren();
    if (!showThemeChips) return;
    const themes = Array.isArray(quote?.matchedThemes) ? quote.matchedThemes : [];
    if (themes.length === 0) return;

    Store.themes.blocked().catch(() => []).then((blocked) => {
      const visibleThemes = themes.map((t) => String(t)).filter((t) => t && !blocked.includes(t.toLowerCase()));
      if (visibleThemes.length === 0) return;
      visibleThemes.slice(0, 6).forEach((theme) => {
        const chip = document.createElement("div");
        chip.className = "theme-chip";

        const name = document.createElement("span");
        name.className = "theme-chip-name";
        name.textContent = theme;
        chip.appendChild(name);

        const less = document.createElement("button");
        less.className = "theme-chip-less";
        less.type = "button";
        less.setAttribute("aria-label", `Less like ${theme}`);
        const svgNS = "http://www.w3.org/2000/svg";
        const icon = document.createElementNS(svgNS, "svg");
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("fill", "none");
        icon.setAttribute("stroke", "currentColor");
        icon.setAttribute("stroke-width", "2");
        icon.setAttribute("stroke-linecap", "round");
        icon.setAttribute("stroke-linejoin", "round");
        [["18", "6", "6", "18"], ["6", "6", "18", "18"]].forEach(([x1, y1, x2, y2]) => {
          const line = document.createElementNS(svgNS, "line");
          line.setAttribute("x1", x1);
          line.setAttribute("y1", y1);
          line.setAttribute("x2", x2);
          line.setAttribute("y2", y2);
          icon.appendChild(line);
        });
        less.appendChild(icon);
        less.addEventListener("click", () => blockTheme(theme));
        chip.appendChild(less);

        themeChipsEl.appendChild(chip);
      });
    });
  }

  function getLocalDateKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function getDailyQuoteIfAvailable() {
    if (!dailyQuoteEnabled) return null;
    const state = await Store.quotes.getDailyState();
    if (!state || !state.dateKey || !state.quote) return null;
    if (state.dateKey !== getLocalDateKey()) return null;
    return state.quote;
  }

  async function setDailyQuote(quote) {
    if (!dailyQuoteEnabled || !quote?.text) return;
    await Store.quotes.setDailyState({
      dateKey: getLocalDateKey(),
      quote: {
        id: quote.id,
        text: quote.text,
        author: quote.author,
        themes: quote.themes || [],
        matchedThemes: quote.matchedThemes || null,
        aiReason: quote.aiReason || null,
        reason: quote.reason || null,
      },
    });
  }

  /**
   * Get a random fallback quote
   */
  function getRandomFallback() {
    return LOCAL_FALLBACKS[Math.floor(Math.random() * LOCAL_FALLBACKS.length)];
  }

  /**
   * Check if extension context is valid
   */
  function isExtensionContextValid() {
    try {
      return chrome.runtime && chrome.runtime.id;
    } catch {
      return false;
    }
  }

  /**
   * Load quote directly from storage (doesn't require service worker)
   */
  async function loadQuoteFromStorage() {
    try {
      const [quotes, blockedSet, recentIds] = await Promise.all([
        Store.quotes.getCache(),
        Store.themes.blockedSet(),
        Store.history.recentIds(),
      ]);
      const notBlocked = quotes.filter(
        (q) => !(Array.isArray(q?.themes) && q.themes.some((t) => blockedSet.has(String(t).toLowerCase())))
      );
      const recent = new Set(recentIds);
      const fresh = notBlocked.filter((q) => !q?.id || !recent.has(q.id));
      // When every unblocked quote was recently shown, repeats beat fallbacks
      const pool = fresh.length > 0 ? fresh : notBlocked;
      if (pool.length > 0) {
        return pool[Math.floor(Math.random() * pool.length)];
      }
    } catch (error) {
      console.warn("[Musing] Could not read from storage:", error);
    }
    return null;
  }

  /**
   * Fetch quote from background worker (with storage fallback)
   */
  async function loadQuote(options = {}) {
    const token = ++loadQuoteToken;
    showLoading();
    const forceNew = options.forceNew === true;

    if (!forceNew) {
      try {
        const daily = await getDailyQuoteIfAvailable();
        if (token !== loadQuoteToken) return;
        if (daily && daily.text) {
          displayQuote(daily);
          return;
        }
      } catch {
        // ignore
      }
    }

    // Paint a cached quote and its static reason first so first paint never
    // waits on the service worker or a billed AI call. The GET_QUOTE response
    // replaces it below and, when Smart Reasons is on, carries the AI reason.
    // The provisional paint is not recorded; the finally-shown quote is.
    let provisionalShown = false;
    try {
      const cached = await loadQuoteFromStorage();
      if (token !== loadQuoteToken) return;
      if (cached && cached.text) {
        displayQuote(cached, { record: false });
        provisionalShown = true;
      }
    } catch {
      // ignore; the fallbacks below cover an empty cache
    }

    // Context gone: keep the provisional paint, else show a local fallback.
    if (!isExtensionContextValid()) {
      console.warn("[Musing] Extension context invalidated, using storage fallback");
      if (token !== loadQuoteToken) return;
      if (provisionalShown) {
        Store.history.recordShown(currentQuote);
      } else {
        displayQuote(getRandomFallback());
      }
      return;
    }

    // Default to the fast deadline; extend to cover the background AI budget
    // only when Smart Reasons is enabled, so the billed reason is not discarded.
    let deadline = GET_QUOTE_TIMEOUT_MS;
    try {
      const aiSettings = await Store.ai.get();
      if (token !== loadQuoteToken) return;
      if (aiSettings.aiEnabled) deadline = GET_QUOTE_AI_TIMEOUT_MS;
    } catch {
      // ignore; the fast deadline is the safe default
    }

    try {
      // Try to get quote from the service worker, bounded by the deadline above
      const request = chrome.runtime.sendMessage({ type: "GET_QUOTE" });
      // A late settle after the deadline resolves a promise nobody awaits;
      // this handler only silences the potential rejection
      request.catch(() => {});
      const quote = await Promise.race([
        request,
        new Promise((resolve) => setTimeout(resolve, deadline, GET_QUOTE_TIMED_OUT)),
      ]);
      if (token !== loadQuoteToken) return;
      if (quote !== GET_QUOTE_TIMED_OUT && quote && quote.text) {
        displayQuote(quote);
        await setDailyQuote(quote);
      } else if (provisionalShown) {
        // Deadline passed with the provisional still on screen; make it final.
        Store.history.recordShown(currentQuote);
      } else {
        // Service worker timed out or returned empty, try storage
        const storageQuote = await loadQuoteFromStorage();
        if (token !== loadQuoteToken) return;
        displayQuote(storageQuote || getRandomFallback());
      }
    } catch (error) {
      console.warn("[Musing] Service worker unavailable:", error.message);
      if (token !== loadQuoteToken) return;
      if (provisionalShown) {
        Store.history.recordShown(currentQuote);
      } else {
        // Fall back to direct storage access
        const storageQuote = await loadQuoteFromStorage();
        if (token !== loadQuoteToken) return;
        displayQuote(storageQuote || getRandomFallback());
      }
    }
  }

  /**
   * Load settings
   */
  async function loadSettings() {
    const settings = await Store.settings.get();
    dailyQuoteEnabled = settings.dailyQuoteEnabled;
    showThemeChips = settings.showThemeChips;
    if (currentQuote) {
      renderThemeChips(currentQuote);
    }
  }

  /**
   * Handle refresh click
   */
  function handleRefresh() {
    loadQuote({ forceNew: true });
  }

  /**
   * Listen for storage changes to update settings in real-time
   */
  function setupStorageListener() {
    Store.settings.onChanged((newSettings) => {
      dailyQuoteEnabled = newSettings.dailyQuoteEnabled;
      showThemeChips = newSettings.showThemeChips;
      if (currentQuote) {
        renderThemeChips(currentQuote);
      }
    });
  }

  /**
   * Handle visibility change (tab waking up from dormancy)
   */
  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      // Re-validate extension context when tab becomes visible
      if (!isExtensionContextValid()) {
        console.log("[Musing] Tab woke up with invalid context, reloading quote from storage");
        loadQuote();
      }
      // Also reload settings in case they changed
      loadSettings().catch(() => {});
    }
  }

  /**
   * Initialize the page
   */
  async function initialize() {
    if (isInitialized) return;
    isInitialized = true;

    // Settings must land before loadQuote: the daily-quote check reads them
    try {
      await loadSettings();
    } catch (error) {
      console.warn("[Musing] Could not load settings:", error);
    }
    loadQuote();
    setupStorageListener();
    setupOnboarding();
    // Store reads can reject (invalidated context, transient failure); a
    // rejection here must not surface as an unhandled promise.
    checkOnboarding().catch((error) => console.warn("[Musing] Onboarding check failed:", error));
    checkNotifications();
    maybeShowRatingPrompt().catch(() => {});
  }

  // ============ Rating prompt ============

  /**
   * Count this new-tab open and, once the user has gotten enough value, show a
   * subtle nudge to rate on the Chrome Web Store. Never on day one; goes quiet
   * for a long stretch after each dismissal, and stops after a few dismissals
   * or once the user rates.
   */
  async function maybeShowRatingPrompt() {
    if (!ratingPromptEl) return;
    const state = await Store.rating.recordOpen();
    if (!state || state.rated) return;
    if (state.dismissals >= RATING_MAX_DISMISSALS) return;
    if (state.opens < RATING_MIN_OPENS) return;
    if (state.snoozeUntil && state.opens < state.snoozeUntil) return;
    ratingPromptEl.classList.add("show");
  }

  function handleRatingRate() {
    // Fire-and-forget; opening the store link must not wait on storage.
    Store.rating.markRated().catch(() => {});
    if (ratingPromptEl) ratingPromptEl.classList.remove("show");
  }

  async function handleRatingDismiss() {
    if (ratingPromptEl) ratingPromptEl.classList.remove("show");
    try {
      const state = await Store.rating.getState();
      await Store.rating.snoozeUntil((state.opens || 0) + RATING_RESNOOZE_OPENS);
    } catch {
      // A failed snooze just means we may ask again next open; harmless.
    }
  }

  // Event listeners
  if (refreshEl) refreshEl.addEventListener("click", handleRefresh);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  if (copyQuoteEl) copyQuoteEl.addEventListener("click", copyCurrentQuote);
  if (favoriteQuoteEl) favoriteQuoteEl.addEventListener("click", toggleFavorite);
  if (ratingRateEl) ratingRateEl.addEventListener("click", handleRatingRate);
  if (ratingDismissEl) ratingDismissEl.addEventListener("click", handleRatingDismiss);

  // ============ Notifications ============

  /**
   * Check for pending notifications
   */
  async function checkNotifications() {
    if (!isExtensionContextValid()) return;

    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_PENDING_NOTIFICATIONS" });
      const notifications = response?.notifications || [];

      if (notifications.length > 0) {
        // Show the first notification
        const notification = notifications[0];
        currentNotification = notification;

        if (notification.type === "update") {
          showUpdateNotificationBanner(notification);
        }
      }
    } catch (error) {
      console.warn("[Musing] Could not check notifications:", error);
    }
  }

  /**
   * Show update notification banner
   */
  function showUpdateNotificationBanner(notification) {
    notificationIconEl.textContent = "🎉";
    notificationTitleEl.textContent = notification.title;
    notificationSubtitleEl.textContent = "Click to see what's new";

    // Show banner with slight delay for smooth animation
    setTimeout(() => {
      notificationBannerEl.classList.add("show");
    }, 500);
  }

  /**
   * Hide notification banner
   */
  function hideNotificationBanner() {
    notificationBannerEl.classList.remove("show");
  }

  /**
   * Show What's New modal for a version
   */
  function showWhatsNewModal(version) {
    const changelog = VERSION_CHANGELOG[version];

    if (changelog) {
      whatsNewIconEl.textContent = changelog.icon;
      whatsNewTitleEl.textContent = changelog.title;
      whatsNewVersionEl.textContent = `Version ${version}`;

      // Render changelog items
      whatsNewListEl.replaceChildren();
      changelog.items.forEach((item) => {
        const itemEl = document.createElement("div");
        itemEl.className = "whats-new-item";

        const iconEl = document.createElement("span");
        iconEl.className = "whats-new-item-icon";
        iconEl.textContent = item.icon;
        itemEl.appendChild(iconEl);

        const textEl = document.createElement("span");
        textEl.className = "whats-new-item-text";
        textEl.textContent = item.text;
        itemEl.appendChild(textEl);

        whatsNewListEl.appendChild(itemEl);
      });
    } else {
      // Generic update message if no specific changelog
      whatsNewIconEl.textContent = "✨";
      whatsNewTitleEl.textContent = "musing has been updated";
      whatsNewVersionEl.textContent = `Version ${version}`;

      whatsNewListEl.replaceChildren();
      const itemEl = document.createElement("div");
      itemEl.className = "whats-new-item";
      const iconEl = document.createElement("span");
      iconEl.className = "whats-new-item-icon";
      iconEl.textContent = "🚀";
      itemEl.appendChild(iconEl);
      const textEl = document.createElement("span");
      textEl.className = "whats-new-item-text";
      textEl.textContent = "Bug fixes and performance improvements";
      itemEl.appendChild(textEl);
      whatsNewListEl.appendChild(itemEl);
    }

    whatsNewEl.classList.add("show");
  }

  /**
   * Hide What's New modal
   */
  function hideWhatsNewModal() {
    whatsNewEl.classList.remove("show");
  }

  /**
   * Dismiss the current notification
   */
  async function dismissCurrentNotification() {
    if (!currentNotification || !isExtensionContextValid()) return;

    try {
      await chrome.runtime.sendMessage({
        type: "DISMISS_NOTIFICATION",
        notificationId: currentNotification.id,
      });
    } catch (error) {
      console.warn("[Musing] Could not dismiss notification:", error);
    }

    currentNotification = null;
    hideNotificationBanner();
  }

  /**
   * Handle notification view click
   */
  function handleNotificationView() {
    if (!currentNotification) return;

    hideNotificationBanner();

    if (currentNotification.type === "update") {
      showWhatsNewModal(currentNotification.currentVersion);
    }
  }

  /**
   * Handle What's New close
   */
  function handleWhatsNewClose() {
    hideWhatsNewModal();
    dismissCurrentNotification();
  }

  // Notification event listeners
  if (notificationViewBtnEl) notificationViewBtnEl.addEventListener("click", handleNotificationView);
  if (notificationDismissBtnEl) notificationDismissBtnEl.addEventListener("click", dismissCurrentNotification);
  if (whatsNewCloseBtnEl) whatsNewCloseBtnEl.addEventListener("click", handleWhatsNewClose);

  // Close What's New on escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && whatsNewEl && whatsNewEl.classList.contains("show")) {
      handleWhatsNewClose();
    }
  });

  // Close What's New on overlay click
  if (whatsNewEl) {
    whatsNewEl.addEventListener("click", (e) => {
      if (e.target === whatsNewEl) {
        handleWhatsNewClose();
      }
    });
  }

  // ============ Onboarding ============

  const onboardingEl = document.getElementById("onboarding");
  const onboardingSteps = document.querySelectorAll(".onboarding-step");
  let currentStep = 1;

  /**
   * Show specific onboarding step
   */
  function showStep(step) {
    currentStep = step;
    onboardingSteps.forEach((stepEl) => {
      const stepNum = parseInt(stepEl.dataset.step);
      stepEl.classList.toggle("active", stepNum === step);
    });
  }

  /**
   * Complete onboarding
   */
  async function completeOnboarding() {
    await Store.onboarding.markDone();
    if (onboardingEl) onboardingEl.classList.remove("show");
  }

  /**
   * Check and show onboarding if needed
   */
  async function checkOnboarding() {
    if (!onboardingEl) return;
    if (!(await Store.onboarding.isDone())) {
      onboardingEl.classList.add("show");
    }
  }

  /**
   * Setup onboarding event listeners
   */
  function setupOnboarding() {
    // Skip button
    const skipBtn = document.getElementById("onboarding-skip");
    if (skipBtn) {
      skipBtn.addEventListener("click", completeOnboarding);
    }

    // Next button step 1
    const next1Btn = document.getElementById("onboarding-next-1");
    if (next1Btn) {
      next1Btn.addEventListener("click", () => showStep(2));
    }

    // Back button step 2
    const back2Btn = document.getElementById("onboarding-back-2");
    if (back2Btn) {
      back2Btn.addEventListener("click", () => showStep(1));
    }

    // Next button step 2
    const next2Btn = document.getElementById("onboarding-next-2");
    if (next2Btn) {
      next2Btn.addEventListener("click", () => showStep(3));
    }

    // Finish button
    const finishBtn = document.getElementById("onboarding-finish");
    if (finishBtn) {
      finishBtn.addEventListener("click", completeOnboarding);
    }

    // Close on escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && onboardingEl && onboardingEl.classList.contains("show")) {
        completeOnboarding();
      }
    });
  }

  // Initialize
  initialize();
})();
