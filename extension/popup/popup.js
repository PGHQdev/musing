/**
 * Popup Script
 */

// Pagination constants
const LOGS_PER_PAGE = 10;

// Pagination state
let currentLogsPage = 1;
let totalLogsPages = 1;
let allLogs = [];

// Model options for each provider
const PROVIDER_MODELS = {
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  ],
  claude: [
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    { value: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { value: "claude-opus-4-8", label: "Claude Opus 4.8" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ],
};

// Settings tab elements
const enableClaudeEl = document.getElementById("enable-claude");
const enableChatGPTEl = document.getElementById("enable-chatgpt");
const enableGeminiEl = document.getElementById("enable-gemini");
const dailyQuoteEl = document.getElementById("daily-quote");
const showThemeChipsEl = document.getElementById("show-theme-chips");
const proactiveScrapeEl = document.getElementById("proactive-scrape");
const manageBlockedThemesEl = document.getElementById("manage-blocked-themes");
const statusEl = document.getElementById("status");
const lastSyncEl = document.getElementById("last-sync");
const syncBtnEl = document.getElementById("sync-btn");
const privacyLinkEl = document.getElementById("privacy-link");
const privacyModalEl = document.getElementById("privacy-modal");
const privacyCloseEl = document.getElementById("privacy-close");
const blockedThemesModalEl = document.getElementById("blocked-themes-modal");
const blockedThemesCloseEl = document.getElementById("blocked-themes-close");
const blockedThemesListEl = document.getElementById("blocked-themes-list");
const blockedThemesClearEl = document.getElementById("blocked-themes-clear");

// AI settings elements
const enableAiEl = document.getElementById("enable-ai");
const aiSettingsPanelEl = document.getElementById("ai-settings-panel");
const aiProviderEl = document.getElementById("ai-provider");
const aiModelEl = document.getElementById("ai-model");
const aiApiKeyEl = document.getElementById("ai-api-key");
const apiKeyToggleEl = document.getElementById("api-key-toggle");
const apiKeyLabelEl = document.getElementById("api-key-label");
const getKeyLinkEl = document.getElementById("get-key-link");
const advancedToggleEl = document.getElementById("advanced-toggle");
const advancedPanelEl = document.getElementById("advanced-panel");

// Notification settings elements
const enableUpdateNotificationsEl = document.getElementById("enable-update-notifications");
const enablePromotionsEl = document.getElementById("enable-promotions");

// History settings elements
const enableBrowserHistoryEl = document.getElementById("enable-browser-history");
const historyDaysEl = document.getElementById("history-days");
const historyDaysRowEl = document.getElementById("history-days-row");
const historyPrivacyNoteEl = document.getElementById("history-privacy-note");

// Provider-specific API key links
const PROVIDER_KEY_URLS = {
  groq: "https://console.groq.com/keys",
  claude: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
};

// Logs tab elements
const logsEmptyEl = document.getElementById("logs-empty");
const logsListEl = document.getElementById("logs-list");
const quotesCountEl = document.getElementById("quotes-count");
const favoritesCountEl = document.getElementById("favorites-count");
const viewFavoritesBtnEl = document.getElementById("view-favorites-btn");
const clearLogsBtnEl = document.getElementById("clear-logs-btn");
const viewRawBtnEl = document.getElementById("view-raw-btn");
const rawDataModalEl = document.getElementById("raw-data-modal");
const rawDataCloseEl = document.getElementById("raw-data-close");
const rawDataPreEl = document.getElementById("raw-data-pre");
const favoritesModalEl = document.getElementById("favorites-modal");
const favoritesCloseEl = document.getElementById("favorites-close");
const favoritesEmptyEl = document.getElementById("favorites-empty");
const favoritesListEl = document.getElementById("favorites-list");
const favoritesExportEl = document.getElementById("favorites-export");
const favoritesClearEl = document.getElementById("favorites-clear");

// Pagination elements
const logsPaginationEl = document.getElementById("logs-pagination");
const logsPrevBtnEl = document.getElementById("logs-prev");
const logsNextBtnEl = document.getElementById("logs-next");
const logsPageInfoEl = document.getElementById("logs-page-info");

// Tab elements
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

/**
 * Load settings from storage
 */
async function loadSettings() {
  const settings = await Store.settings.get();

  enableClaudeEl.checked = settings.enableClaude;
  enableChatGPTEl.checked = settings.enableChatGPT;
  enableGeminiEl.checked = settings.enableGemini;
  dailyQuoteEl.checked = settings.dailyQuoteEnabled;
  showThemeChipsEl.checked = settings.showThemeChips;
  proactiveScrapeEl.checked = settings.proactiveScrapeEnabled;

  // Controls start disabled in the HTML; only a successful load may enable
  // them, so a failed load can never cause a save of default-false settings
  enableControls([enableClaudeEl, enableChatGPTEl, enableGeminiEl, dailyQuoteEl, showThemeChipsEl, proactiveScrapeEl]);
}

function enableControls(elements) {
  elements.forEach((el) => {
    el.disabled = false;
  });
}

function reportLoadFailure(error) {
  console.error("[Musing] Failed to load settings:", error);
  showStatus("Could not load settings", "error");
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  const existing = await Store.settings.get();
  await Store.settings.set({
    ...existing,
    enableClaude: enableClaudeEl.checked,
    enableChatGPT: enableChatGPTEl.checked,
    enableGemini: enableGeminiEl.checked,
    dailyQuoteEnabled: dailyQuoteEl.checked,
    showThemeChips: showThemeChipsEl.checked,
    proactiveScrapeEnabled: proactiveScrapeEl.checked,
  });
  showStatus("Saved", "success");
}

/**
 * Load AI settings from storage
 */
async function loadAiSettings() {
  // Store.ai.get() merges defaults and migrates the legacy single-key format
  const aiSettings = await Store.ai.get();

  enableAiEl.checked = aiSettings.aiEnabled;
  aiProviderEl.value = aiSettings.aiProvider;

  const currentProvider = aiSettings.aiProvider;
  aiApiKeyEl.value = aiSettings.aiApiKeys[currentProvider] || "";

  // Update model options and provider UI for current provider
  updateModelOptions(currentProvider);
  updateProviderUI(currentProvider);

  // Set saved model if available
  if (aiSettings.aiModel) {
    aiModelEl.value = aiSettings.aiModel;
  }

  // Show/hide AI settings panel based on toggle
  updateAiPanelVisibility();

  enableControls([enableAiEl, aiProviderEl, aiModelEl, aiApiKeyEl]);
}

/**
 * Save AI settings to storage
 */
async function saveAiSettings() {
  // Get existing settings to preserve other provider keys
  const existingSettings = await Store.ai.get();

  const currentProvider = aiProviderEl.value;

  await Store.ai.set({
    aiEnabled: enableAiEl.checked,
    aiProvider: currentProvider,
    aiModel: aiModelEl.value,
    aiApiKeys: {
      ...existingSettings.aiApiKeys,
      [currentProvider]: aiApiKeyEl.value,
    },
  });
  showStatus("Saved", "success");
}

/**
 * Update model options based on selected provider
 */
function updateModelOptions(provider) {
  const models = PROVIDER_MODELS[provider] || PROVIDER_MODELS.groq;

  // Clear existing options
  aiModelEl.replaceChildren();

  // Add new options
  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.value;
    option.textContent = model.label;
    aiModelEl.appendChild(option);
  });
}

/**
 * Update AI settings panel visibility
 */
function updateAiPanelVisibility() {
  aiSettingsPanelEl.classList.toggle("show", enableAiEl.checked);
}

/**
 * Handle provider change
 */
async function handleProviderChange() {
  const newProvider = aiProviderEl.value;

  // Save current key before switching
  await saveAiSettings();

  // Load the key for the new provider
  const aiSettings = await Store.ai.get();
  aiApiKeyEl.value = aiSettings.aiApiKeys[newProvider] || "";

  // Update UI for new provider
  updateModelOptions(newProvider);
  updateProviderUI(newProvider);
}

/**
 * Update provider-specific UI (label and key link)
 */
function updateProviderUI(provider) {
  // Update API key label
  const providerNames = {
    groq: "Groq",
    claude: "Claude",
    openai: "OpenAI",
  };
  apiKeyLabelEl.textContent = `${providerNames[provider] || "API"} API Key`;

  // Update "Get free key" link
  const url = PROVIDER_KEY_URLS[provider] || PROVIDER_KEY_URLS.groq;
  getKeyLinkEl.href = url;

  // Update link text based on provider (Groq is free, others are paid)
  getKeyLinkEl.textContent = provider === "groq" ? "Get free key" : "Get API key";

  // Re-add the external link icon
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "10");
  icon.setAttribute("height", "10");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.innerHTML = `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>`;
  getKeyLinkEl.appendChild(document.createTextNode(" "));
  getKeyLinkEl.appendChild(icon);
}

/**
 * Toggle API key visibility
 */
function toggleApiKeyVisibility() {
  const isPassword = aiApiKeyEl.type === "password";
  aiApiKeyEl.type = isPassword ? "text" : "password";

  // Update the eye icon
  const eyeIcon = document.getElementById("eye-icon");
  if (isPassword) {
    // Show "eye-off" icon (key is visible)
    eyeIcon.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    `;
  } else {
    // Show "eye" icon (key is hidden)
    eyeIcon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `;
  }
}

/**
 * Toggle advanced settings panel
 */
function toggleAdvancedPanel() {
  const isExpanded = advancedPanelEl.classList.toggle("show");
  advancedToggleEl.classList.toggle("expanded", isExpanded);
}

/**
 * Load notification settings from storage
 */
async function loadNotificationSettings() {
  const settings = await Store.notifications.getSettings();

  enableUpdateNotificationsEl.checked = settings.showUpdateNotifications;
  enablePromotionsEl.checked = settings.showPromotions;

  enableControls([enableUpdateNotificationsEl, enablePromotionsEl]);
}

/**
 * Save notification settings to storage
 */
async function saveNotificationSettings() {
  await Store.notifications.setSettings({
    showUpdateNotifications: enableUpdateNotificationsEl.checked,
    showPromotions: enablePromotionsEl.checked,
  });
  showStatus("Saved", "success");
}

/**
 * Load history settings from storage
 */
async function loadHistorySettings() {
  const settings = await Store.historySettings.get();

  enableBrowserHistoryEl.checked = settings.enableBrowserHistory;
  historyDaysEl.value = settings.historyDaysBack;

  updateHistoryUIVisibility();

  enableControls([enableBrowserHistoryEl, historyDaysEl]);
}

/**
 * Save history settings to storage
 */
async function saveHistorySettings() {
  const existing = await Store.historySettings.get();
  const days = parseInt(historyDaysEl.value, 10);
  const settings = {
    enableBrowserHistory: enableBrowserHistoryEl.checked,
    // NaN here would flow into chrome.history.search({startTime: NaN})
    historyDaysBack: Number.isFinite(days) ? days : existing.historyDaysBack,
    excludedDomains: existing.excludedDomains,
  };

  await Store.historySettings.set(settings);
  showStatus("Saved", "success");

  // Trigger history processing if any history source is enabled
  if (settings.enableBrowserHistory) {
    triggerHistoryProcessing();
  }
}

/**
 * Update history UI visibility based on settings
 */
function updateHistoryUIVisibility() {
  const anyHistoryEnabled = enableBrowserHistoryEl.checked;
  historyDaysRowEl.style.display = anyHistoryEnabled ? "flex" : "none";
  historyPrivacyNoteEl.style.display = anyHistoryEnabled ? "block" : "none";
}

/**
 * Check if history permission is granted
 */
async function checkHistoryPermission() {
  try {
    return await chrome.permissions.contains({ permissions: ["history"] });
  } catch {
    return false;
  }
}

/**
 * Request history permission
 */
async function requestHistoryPermission() {
  try {
    const granted = await chrome.permissions.request({ permissions: ["history"] });
    return granted;
  } catch (error) {
    console.error("Failed to request history permission:", error);
    return false;
  }
}

/**
 * Handle history toggle change
 * Requests permission if needed
 */
async function handleHistoryToggle(toggle, settingKey) {
  if (toggle.checked) {
    // Check if permission is already granted
    const hasPermission = await checkHistoryPermission();

    if (!hasPermission) {
      // Request permission
      const granted = await requestHistoryPermission();

      if (!granted) {
        // Permission denied, revert toggle
        toggle.checked = false;
        showStatus("Permission required", "error");
        return;
      }
    }
  }

  updateHistoryUIVisibility();
  await saveHistorySettings();
}

/**
 * Trigger history processing in background
 */
async function triggerHistoryProcessing() {
  try {
    await chrome.runtime.sendMessage({ type: "PROCESS_HISTORY" });
    console.log("[Musing] History processing triggered");
  } catch (error) {
    console.warn("Failed to trigger history processing:", error);
  }
}

/**
 * Mask a single API key
 */
function maskApiKey(key) {
  if (!key) return "";
  if (key.length > 8) {
    return key.slice(0, 4) + "****" + key.slice(-4);
  } else if (key.length > 0) {
    return "****";
  }
  return "";
}

/**
 * Mask sensitive data in an object (for display purposes)
 */
function maskSensitiveData(data) {
  const masked = JSON.parse(JSON.stringify(data));

  // Mask API keys in ai_settings
  if (masked.ai_settings) {
    // Handle new per-provider keys format
    if (masked.ai_settings.aiApiKeys) {
      for (const provider of Object.keys(masked.ai_settings.aiApiKeys)) {
        masked.ai_settings.aiApiKeys[provider] = maskApiKey(masked.ai_settings.aiApiKeys[provider]);
      }
    }
    // Handle legacy single key format
    if (masked.ai_settings.aiApiKey) {
      masked.ai_settings.aiApiKey = maskApiKey(masked.ai_settings.aiApiKey);
    }
  }

  return masked;
}

/**
 * Show saved status briefly
 * @param {string} message - Status message
 * @param {"success" | "error"} type - Status type
 */
function showStatus(message = "Saved", type = "success") {
  statusEl.textContent = message;
  statusEl.classList.remove("error", "success");
  statusEl.classList.add("show", type);
  setTimeout(() => {
    statusEl.classList.remove("show", "error", "success");
  }, 2000);
}

/**
 * Load and display last sync time
 */
async function loadLastSync() {
  const timestamp = await Store.sync.lastSyncAt();

  if (timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let timeAgo;
    if (diffMins < 1) {
      timeAgo = "Just now";
    } else if (diffMins < 60) {
      timeAgo = `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
    } else if (diffHours < 24) {
      timeAgo = `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    } else {
      timeAgo = `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    }

    lastSyncEl.textContent = timeAgo;
  } else {
    lastSyncEl.textContent = "Never";
  }
}

/**
 * Trigger manual sync
 */
async function handleSync() {
  syncBtnEl.disabled = true;
  syncBtnEl.textContent = "Syncing...";

  try {
    const response = await chrome.runtime.sendMessage({ type: "FORCE_SYNC" });
    await loadLastSync();

    if (response && response.error) {
      showStatus(response.error, "error");
    } else {
      showStatus("Synced successfully", "success");
    }
  } catch (error) {
    console.error("Sync failed:", error);
    showStatus("Sync failed", "error");
  } finally {
    syncBtnEl.disabled = false;
    syncBtnEl.textContent = "Sync Now";
  }
}

/**
 * Show privacy modal
 */
function showPrivacyModal(event) {
  event.preventDefault();
  privacyModalEl.classList.add("show");
}

/**
 * Hide privacy modal
 */
function hidePrivacyModal() {
  privacyModalEl.classList.remove("show");
}

function renderBlockedThemes(themes) {
  if (!blockedThemesListEl) return;
  blockedThemesListEl.replaceChildren();

  if (!themes || themes.length === 0) {
    const empty = document.createElement("div");
    empty.style.opacity = "0.7";
    empty.style.fontSize = "0.75rem";
    empty.style.marginTop = "0.75rem";
    empty.textContent = "No blocked themes";
    blockedThemesListEl.appendChild(empty);
    return;
  }

  themes.slice(0, 200).forEach((theme) => {
    const pill = document.createElement("div");
    pill.className = "pill";

    const label = document.createElement("span");
    label.textContent = theme;
    pill.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.className = "pill-remove";
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => removeBlockedTheme(theme));
    pill.appendChild(removeBtn);

    blockedThemesListEl.appendChild(pill);
  });
}

async function refreshBlockedThemesUI() {
  const themes = await Store.themes.blocked();
  renderBlockedThemes(themes);
}

async function openBlockedThemesModal() {
  if (!blockedThemesModalEl) return;
  blockedThemesModalEl.classList.add("show");
  await refreshBlockedThemesUI();
}

function closeBlockedThemesModal() {
  if (!blockedThemesModalEl) return;
  blockedThemesModalEl.classList.remove("show");
}

async function removeBlockedTheme(theme) {
  await Store.themes.unblock(theme);
  await refreshBlockedThemesUI();
  showStatus("Saved", "success");
}

async function clearBlockedThemes() {
  await Store.themes.clearBlocked();
  await refreshBlockedThemesUI();
  showStatus("Cleared", "success");
}

function renderFavorites(favorites) {
  if (!favoritesListEl || !favoritesEmptyEl) return;
  favoritesListEl.replaceChildren();
  const list = Array.isArray(favorites) ? favorites : [];
  favoritesEmptyEl.style.display = list.length === 0 ? "block" : "none";

  list.slice(0, 200).forEach((fav) => {
    const item = document.createElement("div");
    item.className = "favorite-item";

    const text = document.createElement("div");
    text.className = "favorite-text";
    text.textContent = fav?.text ? `"${fav.text}"` : "";
    item.appendChild(text);

    const meta = document.createElement("div");
    meta.className = "favorite-meta";
    const author = document.createElement("span");
    author.textContent = fav?.author ? `— ${fav.author}` : "";
    meta.appendChild(author);

    const remove = document.createElement("button");
    remove.className = "favorite-remove";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeFavorite(fav?.id));
    meta.appendChild(remove);

    item.appendChild(meta);
    favoritesListEl.appendChild(item);
  });
}

async function refreshFavoritesUI() {
  const favorites = await Store.favorites.list();
  renderFavorites(favorites);
  if (favoritesCountEl) {
    favoritesCountEl.textContent = `${favorites.length} saved`;
  }
}

async function openFavoritesModal() {
  if (!favoritesModalEl) return;
  favoritesModalEl.classList.add("show");
  await refreshFavoritesUI();
}

function closeFavoritesModal() {
  if (!favoritesModalEl) return;
  favoritesModalEl.classList.remove("show");
}

async function removeFavorite(id) {
  await Store.favorites.remove(id);
  await refreshFavoritesUI();
  showStatus("Saved", "success");
}

async function clearFavorites() {
  await Store.favorites.clear();
  await refreshFavoritesUI();
  showStatus("Cleared", "success");
}

async function exportFavorites() {
  const favorites = await Store.favorites.list();
  const payload = JSON.stringify(favorites, null, 2);
  try {
    await navigator.clipboard.writeText(payload);
    showStatus("Copied", "success");
  } catch {
    showStatus("Copy failed", "error");
  }
}

/**
 * Switch tabs
 */
function switchTab(tabName) {
  tabBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  tabContents.forEach((content) => {
    content.classList.toggle("active", content.id === `tab-${tabName}`);
  });

  // Load logs data when switching to logs tab
  if (tabName === "logs") {
    loadLogs();
  }
}

/**
 * Load and display scrape logs
 */
async function loadLogs() {
  const [logs, conversations, quotes, favorites] = await Promise.all([
    Store.scrape.log(),
    Store.conversations.list(),
    Store.quotes.getCache(),
    Store.favorites.list(),
  ]);

  // Update quotes count
  quotesCountEl.textContent = `${quotes.length} quotes cached`;
  if (favoritesCountEl) {
    favoritesCountEl.textContent = `${Array.isArray(favorites) ? favorites.length : 0} saved`;
  }

  // If no scrape logs but we have conversations, show them instead
  allLogs = logs.length > 0 ? logs : conversations.map((text, i) => ({
    source: "unknown",
    timestamp: Date.now() - (i * 60000),
    preview: text.slice(0, 100),
    length: text.length,
  }));

  if (allLogs.length === 0) {
    logsEmptyEl.style.display = "block";
    logsListEl.replaceChildren();
    logsPaginationEl.classList.add("hidden");
    return;
  }

  logsEmptyEl.style.display = "none";

  // Calculate pagination
  totalLogsPages = Math.ceil(allLogs.length / LOGS_PER_PAGE);
  currentLogsPage = Math.min(currentLogsPage, totalLogsPages);

  renderLogsPage();
  updatePaginationUI();
}

/**
 * Render the current page of logs
 */
function renderLogsPage() {
  const startIndex = (currentLogsPage - 1) * LOGS_PER_PAGE;
  const endIndex = Math.min(startIndex + LOGS_PER_PAGE, allLogs.length);
  const pageData = allLogs.slice(startIndex, endIndex);

  // Use DOM APIs instead of innerHTML to prevent XSS
  logsListEl.replaceChildren();
  pageData.forEach((log) => {
    const time = new Date(log.timestamp).toLocaleString();
    const sourceName = PLATFORMS.find((p) => p.id === log.source)?.label || "Unknown";
    const preview = log.preview || (typeof log === "string" ? log.slice(0, 100) : "");

    const logItem = document.createElement("div");
    logItem.className = "log-item";

    const sourceDiv = document.createElement("div");
    sourceDiv.className = "log-source";
    sourceDiv.textContent = sourceName + " ";
    const timeSpan = document.createElement("span");
    timeSpan.className = "log-time";
    timeSpan.textContent = time;
    sourceDiv.appendChild(timeSpan);

    const previewDiv = document.createElement("div");
    previewDiv.className = "log-preview";
    previewDiv.textContent = preview + (log.length > 100 ? "..." : "");

    logItem.appendChild(sourceDiv);
    logItem.appendChild(previewDiv);
    logsListEl.appendChild(logItem);
  });
}

/**
 * Update pagination UI state
 */
function updatePaginationUI() {
  // Show/hide pagination based on total pages
  if (totalLogsPages <= 1) {
    logsPaginationEl.classList.add("hidden");
  } else {
    logsPaginationEl.classList.remove("hidden");
    logsPageInfoEl.textContent = `${currentLogsPage} / ${totalLogsPages}`;
    logsPrevBtnEl.disabled = currentLogsPage <= 1;
    logsNextBtnEl.disabled = currentLogsPage >= totalLogsPages;
  }
}

/**
 * Go to previous logs page
 */
function goToPrevPage() {
  if (currentLogsPage > 1) {
    currentLogsPage--;
    renderLogsPage();
    updatePaginationUI();
  }
}

/**
 * Go to next logs page
 */
function goToNextPage() {
  if (currentLogsPage < totalLogsPages) {
    currentLogsPage++;
    renderLogsPage();
    updatePaginationUI();
  }
}

/**
 * Clear all scrape data
 */
async function handleClearLogs() {
  if (!confirm("Clear all scraped conversation data and cached quotes?")) {
    return;
  }

  await Store.clearCapturedData();
  showStatus("Data cleared", "success");

  // Reset pagination state
  currentLogsPage = 1;
  totalLogsPages = 1;
  allLogs = [];

  loadLogs();
}

/**
 * Show raw storage data
 */
async function handleViewRaw() {
  const data = await Store.dumpAll();
  const maskedData = maskSensitiveData(data);
  rawDataPreEl.textContent = JSON.stringify(maskedData, null, 2);
  rawDataModalEl.classList.add("show");
}

/**
 * Hide raw data modal
 */
function hideRawDataModal() {
  rawDataModalEl.classList.remove("show");
}

// Event listeners - Settings
enableClaudeEl.addEventListener("change", saveSettings);
enableChatGPTEl.addEventListener("change", saveSettings);
enableGeminiEl.addEventListener("change", saveSettings);
dailyQuoteEl.addEventListener("change", saveSettings);
showThemeChipsEl.addEventListener("change", saveSettings);
proactiveScrapeEl.addEventListener("change", saveSettings);
manageBlockedThemesEl.addEventListener("click", openBlockedThemesModal);
syncBtnEl.addEventListener("click", handleSync);
privacyLinkEl.addEventListener("click", showPrivacyModal);
privacyCloseEl.addEventListener("click", hidePrivacyModal);
privacyModalEl.addEventListener("click", (e) => {
  if (e.target === privacyModalEl) hidePrivacyModal();
});
blockedThemesCloseEl.addEventListener("click", closeBlockedThemesModal);
blockedThemesModalEl.addEventListener("click", (e) => {
  if (e.target === blockedThemesModalEl) closeBlockedThemesModal();
});
blockedThemesClearEl.addEventListener("click", clearBlockedThemes);

// Event listeners - AI Settings
enableAiEl.addEventListener("change", () => {
  updateAiPanelVisibility();
  saveAiSettings();
});
aiProviderEl.addEventListener("change", handleProviderChange);
aiModelEl.addEventListener("change", saveAiSettings);
aiApiKeyEl.addEventListener("change", saveAiSettings);
aiApiKeyEl.addEventListener("blur", saveAiSettings);
apiKeyToggleEl.addEventListener("click", toggleApiKeyVisibility);
advancedToggleEl.addEventListener("click", toggleAdvancedPanel);

// Event listeners - Notification Settings
enableUpdateNotificationsEl.addEventListener("change", saveNotificationSettings);
enablePromotionsEl.addEventListener("change", saveNotificationSettings);

// Event listeners - History Settings
enableBrowserHistoryEl.addEventListener("change", () => handleHistoryToggle(enableBrowserHistoryEl, "enableBrowserHistory"));
historyDaysEl.addEventListener("change", saveHistorySettings);

// Event listeners - Tabs
tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// Event listeners - Logs
clearLogsBtnEl.addEventListener("click", handleClearLogs);
viewRawBtnEl.addEventListener("click", handleViewRaw);
viewFavoritesBtnEl.addEventListener("click", openFavoritesModal);
rawDataCloseEl.addEventListener("click", hideRawDataModal);
rawDataModalEl.addEventListener("click", (e) => {
  if (e.target === rawDataModalEl) hideRawDataModal();
});
favoritesCloseEl.addEventListener("click", closeFavoritesModal);
favoritesModalEl.addEventListener("click", (e) => {
  if (e.target === favoritesModalEl) closeFavoritesModal();
});
favoritesExportEl.addEventListener("click", exportFavorites);
favoritesClearEl.addEventListener("click", clearFavorites);

// Event listeners - Pagination
logsPrevBtnEl.addEventListener("click", goToPrevPage);
logsNextBtnEl.addEventListener("click", goToNextPage);

// Load on popup open; a failed loader leaves its controls disabled
loadSettings().catch(reportLoadFailure);
loadAiSettings().catch(reportLoadFailure);
loadNotificationSettings().catch(reportLoadFailure);
loadHistorySettings().catch(reportLoadFailure);
loadLastSync().catch(() => {
  lastSyncEl.textContent = "Unknown";
});
