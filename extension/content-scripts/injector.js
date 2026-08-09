/**
 * Injector Content Script
 * Injects api-interceptor.js into the page context and bridges messages to background
 */

(function () {
  "use strict";

  const MUSING_MESSAGE_TYPE = "MUSING_API_CAPTURE";
  const PLATFORMS = ["claude", "chatgpt", "gemini"];
  // Upper bound on accepted bridge text; the interceptor forwards the full
  // response so this content script can sanitize before truncating (see F7),
  // so cap the incoming length here to bound work and reject abuse.
  const MAX_BRIDGE_CHARS = 262144;

  // Handshake tag echoed by the injected interceptor. It is NOT a secret: any
  // MAIN-world script on this page can read it from the script dataset and the
  // postMessage payload, so it cannot exclude a same-page forger. The real
  // boundary is that this channel and the interceptor run same-origin, and the
  // captured text only feeds the user's own local themes. Every field is still
  // validated below so malformed or off-shape messages are dropped.
  const nonce = crypto.randomUUID();

  let isEnabled = true;
  let started = false;

  /**
   * Check if API interception is enabled in settings
   */
  async function checkEnabled() {
    try {
      const settings = await Store.settings.get();
      isEnabled = Boolean(settings.enableApiCapture);
    } catch {
      // Keep last known value on transient storage failure
    }
    return isEnabled;
  }

  /**
   * Inject the API interceptor script into page context.
   * The nonce travels via the script element's dataset; the interceptor
   * reads it from document.currentScript before the element is removed.
   */
  function injectScript() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("inject/api-interceptor.js");
    script.dataset.musingNonce = nonce;
    script.onload = function () {
      this.remove();
    };
    script.onerror = function () {
      console.debug("[Musing Injector] Failed to load api-interceptor.js");
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  /**
   * Handle messages from the injected script
   */
  function handleMessage(event) {
    // Validate source, origin, nonce, and every field shape. The nonce only
    // filters unrelated same-origin noise; it is not a forgery guard (see the
    // note at the top). Anything off-shape is dropped.
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.type !== MUSING_MESSAGE_TYPE) return;
    if (data.nonce !== nonce) return;
    if (!PLATFORMS.includes(data.platform)) return;
    if (typeof data.text !== "string" || data.source !== "api") return;
    if (data.text.length < 20 || data.text.length > MAX_BRIDGE_CHARS) return;

    // Re-checked per message so a settings change stops already-open tabs
    if (!isEnabled) return;

    // Sanitize the full received text BEFORE truncating, so a PII token that
    // sat across the interceptor's byte cap is still redacted (see F7).
    const sanitized = MusingCapture.sanitizeText(data.text);

    // Forward to background worker
    try {
      chrome.runtime.sendMessage(
        {
          type: "API_CAPTURE",
          data: {
            platform: data.platform,
            text: sanitized.slice(0, 5000), // Limit size
            source: data.source,
            url: window.location.href,
            timestamp: Date.now(),
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.debug("[Musing Injector] Failed to send to background:", chrome.runtime.lastError);
          }
        }
      );
    } catch {
      // Extension context invalidated (extension reloaded); stop bridging
      window.removeEventListener("message", handleMessage);
      return;
    }

    console.log("[Musing Injector] API capture forwarded, length:", sanitized.length);
  }

  function start() {
    if (started) return;
    started = true;
    window.addEventListener("message", handleMessage);
    injectScript();
    console.log("[Musing Injector] Initialized");
  }

  /**
   * Initialize the injector
   */
  async function init() {
    // Track settings changes so disable takes effect on open tabs, and
    // enable starts capture without a reload.
    Store.settings.onChanged((settings) => {
      isEnabled = Boolean(settings.enableApiCapture);
      if (isEnabled) start();
    });

    const enabled = await checkEnabled();
    if (!enabled) {
      console.log("[Musing Injector] API capture disabled in settings");
      return;
    }

    start();
  }

  // Run immediately (document_start): waiting for DOMContentLoaded would
  // miss boot-time API traffic.
  init();
})();
