/**
 * Shared capture core for all platform content scripts.
 * Platform files (claude.js, chatgpt.js, gemini.js) call MusingCapture.init()
 * with selectors, a settings key, and platform-specific noise patterns.
 * Must load before the per-platform file (see manifest.json content_scripts).
 */

(function () {
  "use strict";

  const SCRAPE_INTERVAL_MS = 30000;
  const SLOW_SCRAPE_INTERVAL_MS = 120000;
  const MAX_TEXT_LENGTH = 5000;
  // Bound raw text fed to the sanitizer; the split point sits well past the
  // final MAX_TEXT_LENGTH cut so it cannot leak a half-redacted fragment.
  const MAX_RAW_LENGTH = MAX_TEXT_LENGTH * 4;
  const DEBOUNCE_MS = 2500;
  const MIN_UPDATE_INTERVAL_MS = 5000;

  const COMMON_NOISE_PATTERNS = [
    /^(Home|Settings|Profile|Menu|Close|Cancel|OK|Submit)$/i,
    /^(Loading|Please wait|Thinking|Generating)\.{0,3}$/i,
    /^(Today|Yesterday|Previous \d+ days|Last week|Last month)$/i,
    // Single emoji or very short
    /^[\p{Emoji}\s]{1,5}$/u,
    // Just numbers or punctuation
    /^[\d\s\.\,\-\:\;]+$/,
  ];

  let config = null;
  let noisePatterns = COMMON_NOISE_PATTERNS;

  let running = false;
  let isEnabled = true;
  let lastScrapedText = "";
  let lastPollText = "";
  let lastUpdateTime = 0;
  let pendingText = null;
  let observer = null;
  let observerRoot = null;
  let debounceTimeout = null;
  let trailingTimeout = null;
  let periodicTimeout = null;
  let initialTimeout = null;
  let observerRetryTimeout = null;

  async function checkEnabled() {
    try {
      const settings = await Store.settings.get();
      isEnabled = Boolean(settings[config.settingsKey]);
    } catch (error) {
      // Keep the last known value; a transient storage failure must not
      // silently kill capture (nor silently enable it after a disable).
      console.debug("[Musing] Failed to read settings:", error);
    }
    return isEnabled;
  }

  /**
   * Remove PII patterns. When `patterns` is given, also filter UI-noise
   * lines and dedupe consecutive duplicates (DOM-scrape path).
   */
  function sanitizeText(text, patterns) {
    if (!text) return "";

    // Remove email addresses
    text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]");

    // Remove URLs, keeping domain but dropping query params that might contain tokens
    text = text.replace(/https?:\/\/[^\s]+/g, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
      } catch {
        return "[url]";
      }
    });

    // Remove potential API keys (long alphanumeric strings)
    text = text.replace(/\b[a-zA-Z0-9]{32,}\b/g, "[key]");

    // Remove potential phone numbers
    text = text.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[phone]");

    if (!patterns) return text;

    const lines = text.split("\n");
    const filteredLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3) return false;
      for (const pattern of patterns) {
        if (pattern.test(trimmed)) return false;
      }
      // Skip very short lines that look like menu items (< 20 chars, no spaces)
      if (trimmed.length < 20 && !trimmed.includes(" ")) return false;
      return true;
    });

    const deduped = filteredLines.filter((line, i, arr) => {
      return i === 0 || line.trim() !== arr[i - 1].trim();
    });

    return deduped.join("\n").trim();
  }

  function isValidConversation(text) {
    if (!text || text.length < 50) return false;

    const nonConversationPatterns = [
      /^(Loading|Please wait|Error|404|Not found)/i,
      /^<!DOCTYPE/i,
      /^<html/i,
    ];

    for (const pattern of nonConversationPatterns) {
      if (pattern.test(text.trim())) return false;
    }

    return true;
  }

  function isValidTitle(text) {
    if (!text || text.length < 5 || text.length > 200) return false;
    for (const pattern of noisePatterns) {
      if (pattern.test(text)) return false;
    }
    if (text.length < 15 && !text.includes(" ")) return false;
    return true;
  }

  /**
   * Whole-container fallback when no message selector matches.
   * Any main-container text over 50 chars qualifies; noise filtering runs
   * later in sanitizeText, so a short real conversation is not dropped here.
   */
  function scrapeFallback() {
    for (const selector of config.fallbackSelectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const raw = (el.innerText || "").trim().slice(0, MAX_RAW_LENGTH);
      if (raw.length > 50) return raw;
    }
    return "";
  }

  function scrapeConversation() {
    const messages = [];

    // Role-specific selectors list the user turn before the model turn, so
    // stopping at the first non-empty selector drops the model side (certain
    // on Gemini). Collect every selector's matches, keep only the outermost
    // element of any overlapping pair (so a wrapper and its child do not
    // both contribute the same text), then read them in DOM order.
    const seen = new Set();
    const collected = [];
    for (const selector of config.messageSelectors) {
      document.querySelectorAll(selector).forEach((el) => {
        if (!seen.has(el)) {
          seen.add(el);
          collected.push(el);
        }
      });
    }

    const outermost = collected.filter(
      (el) => !collected.some((other) => other !== el && other.contains(el))
    );

    outermost.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    for (const el of outermost) {
      const text = el.innerText?.trim();
      if (text && text.length > 10) {
        messages.push(text);
      }
    }

    // Only use first 10 messages for context
    const combined = messages.length > 0
      ? messages.slice(0, 10).join("\n\n").slice(0, MAX_RAW_LENGTH)
      : scrapeFallback();

    // Sanitize before truncating so the cut cannot split an email/URL/key
    // and defeat the redaction regexes.
    return sanitizeText(combined, noisePatterns).slice(0, MAX_TEXT_LENGTH);
  }

  function scrapeSidebar() {
    const titles = [];

    for (const selector of config.sidebarSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach((el) => {
          const text = el.innerText?.trim();
          if (isValidTitle(text)) {
            titles.push(text);
          }
        });
        if (titles.length > 0) break;
      }
    }

    return [...new Set(titles)].slice(0, 20); // Dedupe and limit
  }

  /**
   * sendMessage throws synchronously ("Extension context invalidated")
   * after an extension reload; guard so one throw cannot kill a caller.
   */
  function safeSendMessage(message, label) {
    try {
      chrome.runtime.sendMessage(message, () => {
        if (chrome.runtime.lastError) {
          console.debug(`[Musing] ${label} failed:`, chrome.runtime.lastError.message);
        }
      });
      return true;
    } catch (error) {
      console.debug(`[Musing] ${label} failed (context invalidated):`, error);
      cleanup();
      return false;
    }
  }

  function sendScrapeComplete(sidebarTitles) {
    safeSendMessage(
      {
        type: "SCRAPE_COMPLETE",
        data: {
          platform: config.platform,
          sidebar: sidebarTitles,
          url: window.location.href,
          timestamp: Date.now(),
        },
      },
      "scrape complete"
    );
  }

  async function logScrape(text) {
    try {
      await Store.scrape.appendLog({
        source: config.platform,
        timestamp: Date.now(),
        preview: text.slice(0, 200),
        length: text.length,
        url: window.location.href,
      });
    } catch (error) {
      console.debug("[Musing] Failed to log scrape:", error);
    }
  }

  function sendUpdate(text) {
    // Re-checked per send (kept fresh by the onChanged subscription) so a
    // disable stops the observer-driven path too, not only the next poll.
    if (!isEnabled) return;

    if (!text || text === lastScrapedText) return;

    if (!isValidConversation(text)) return;

    // Rate limiting with a trailing send: an update landing inside the
    // window is deferred, not dropped, so the final post-stream state
    // always reaches the background.
    const now = Date.now();
    const wait = MIN_UPDATE_INTERVAL_MS - (now - lastUpdateTime);
    if (wait > 0) {
      pendingText = text;
      if (!trailingTimeout) {
        trailingTimeout = setTimeout(() => {
          trailingTimeout = null;
          const deferred = pendingText;
          pendingText = null;
          if (deferred) sendUpdate(deferred);
        }, wait);
      }
      return;
    }

    lastScrapedText = text;
    lastUpdateTime = now;

    logScrape(text);

    const sent = safeSendMessage(
      {
        type: "CONVERSATION_UPDATE",
        data: text,
      },
      "conversation update"
    );

    if (sent) {
      console.log(`[Musing] Conversation scraped from ${config.platform}, length:`, text.length);
    }
  }

  function debouncedScrape() {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    debounceTimeout = setTimeout(() => {
      const text = scrapeConversation();
      sendUpdate(text);
    }, DEBOUNCE_MS);
  }

  function findObserverRoot() {
    for (const selector of config.observerRootSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        return el.closest("main") || el.parentElement || document.body;
      }
    }
    return document.body;
  }

  function observeChanges() {
    if (!running) return;
    if (!document.body) {
      observerRetryTimeout = setTimeout(observeChanges, 100);
      return;
    }

    if (observer) {
      observer.disconnect();
    }

    observerRoot = findObserverRoot();

    observer = new MutationObserver((mutations) => {
      const hasNewContent = mutations.some(
        (m) => m.addedNodes.length > 0 || m.type === "characterData"
      );

      if (hasNewContent) {
        debouncedScrape();
      }
    });

    observer.observe(observerRoot, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  /**
   * SPA navigation can replace the observed container; re-attach when the
   * root got detached, or when we were stuck on document.body and a real
   * conversation root has since appeared.
   */
  function reacquireObserverRoot() {
    if (!observer || !observerRoot || !observerRoot.isConnected) {
      observeChanges();
      return;
    }
    if (observerRoot === document.body) {
      const candidate = findObserverRoot();
      if (candidate !== document.body) {
        observeChanges();
      }
    }
  }

  function schedulePeriodicScrape(delayMs) {
    periodicTimeout = setTimeout(async () => {
      let nextDelay = SLOW_SCRAPE_INTERVAL_MS;
      try {
        if (await checkEnabled()) {
          reacquireObserverRoot();
          const text = scrapeConversation();
          // Tracked separately from lastScrapedText (which sendUpdate may
          // refuse to advance) so unchanged pages back off to the slow poll.
          const isLikelyChange = Boolean(text) && text !== lastPollText;
          lastPollText = text;
          if (isLikelyChange) nextDelay = SCRAPE_INTERVAL_MS;

          sendUpdate(text);
          sendScrapeComplete(scrapeSidebar());
        }
      } catch (error) {
        console.debug("[Musing] Poll cycle failed:", error);
      } finally {
        // Re-arm even when the cycle threw; a single throw must not kill
        // capture for the rest of the tab's life.
        if (running) schedulePeriodicScrape(nextDelay);
      }
    }, delayMs);
  }

  function cleanup() {
    running = false;

    if (observer) {
      observer.disconnect();
      observer = null;
    }
    observerRoot = null;

    for (const id of [periodicTimeout, debounceTimeout, trailingTimeout, initialTimeout, observerRetryTimeout]) {
      if (id) clearTimeout(id);
    }
    periodicTimeout = debounceTimeout = trailingTimeout = initialTimeout = observerRetryTimeout = null;
    pendingText = null;
  }

  async function start() {
    if (running) return;

    const enabled = await checkEnabled();
    if (!enabled) {
      console.log(`[Musing] ${config.platform} scraping disabled in settings`);
      return;
    }

    running = true;

    // Initial scrape after page load
    initialTimeout = setTimeout(() => {
      const text = scrapeConversation();
      sendUpdate(text);
      sendScrapeComplete(scrapeSidebar());
    }, 2000);

    observeChanges();
    schedulePeriodicScrape(SCRAPE_INTERVAL_MS);

    console.log(`[Musing] ${config.platform} content script loaded`);
  }

  function init(cfg) {
    config = cfg;
    noisePatterns = [...(cfg.noisePatterns || []), ...COMMON_NOISE_PATTERNS];

    // Track settings changes so a disable takes effect on open tabs, and an
    // enable starts capture without a reload (mirrors the injector).
    Store.settings.onChanged((settings) => {
      isEnabled = Boolean(settings[config.settingsKey]);
      if (isEnabled && !running) start();
    });

    window.addEventListener("beforeunload", cleanup);
    window.addEventListener("pagehide", cleanup);
    // pagehide fires on bfcache entry; restart when the page comes back
    window.addEventListener("pageshow", () => {
      if (!running) start();
    });

    start();
  }

  window.MusingCapture = { init, sanitizeText };
})();
