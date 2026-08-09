/**
 * API Interceptor - Runs in page context
 * Intercepts fetch/XHR to capture conversation API responses
 * Sends data to content script via postMessage
 */

(function () {
  "use strict";

  const MUSING_MESSAGE_TYPE = "MUSING_API_CAPTURE";

  // Handshake nonce passed by the injector via the script element dataset;
  // echoed on every postMessage so the content script can reject forgeries.
  const NONCE =
    (document.currentScript && document.currentScript.dataset.musingNonce) || null;

  // Cap on buffered response bytes (streams are read incrementally up to
  // this) and on text posted across the bridge. This page context has no
  // sanitizer, so the full bounded text is forwarded and the content script
  // redacts before its own truncation; a smaller pre-cut here could split a
  // PII token past the redaction the content script later applies (see F7).
  const MAX_CAPTURE_CHARS = 262144; // 256K chars

  // API endpoint patterns to monitor
  const ENDPOINT_PATTERNS = {
    claude: [
      /\/api\/organizations\/[^/]+\/chat_conversations\/[^/]+\/completion/,
      /\/api\/organizations\/[^/]+\/chat_conversations/,
      /\/api\/append_message/,
    ],
    chatgpt: [
      /\/backend-api\/conversation$/,
      /\/backend-api\/conversation\/[^/]+$/,
      /\/backend-api\/conversation\/[^/]+\/messages/,
    ],
    gemini: [
      /\/_\/BardChatUi\/data\/assistant\.lamda\.BardFrontendService\/StreamGenerate/,
      /\/batchexecute.*BardFrontendService/,
    ],
  };

  /**
   * Detect which platform we're on
   */
  function detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes("claude.ai")) return "claude";
    if (hostname.includes("chatgpt.com")) return "chatgpt";
    if (hostname.includes("gemini.google.com")) return "gemini";
    return null;
  }

  /**
   * Check if URL matches any endpoint pattern for the current platform
   */
  function isConversationEndpoint(url, platform) {
    if (!platform || !ENDPOINT_PATTERNS[platform]) return false;

    const urlString = url instanceof Request ? url.url : String(url);
    return ENDPOINT_PATTERNS[platform].some((pattern) => pattern.test(urlString));
  }

  /**
   * Extract conversation text from Claude API response
   */
  function extractClaudeData(data) {
    try {
      // Claude streams responses, data might be in various formats
      if (typeof data === "string") {
        // Try to parse streaming response (multiple JSON objects separated by newlines)
        const lines = data.split("\n").filter((line) => line.trim());
        const messages = [];

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.completion) {
              messages.push(parsed.completion);
            }
            if (parsed.content && Array.isArray(parsed.content)) {
              parsed.content.forEach((block) => {
                if (block.text) messages.push(block.text);
              });
            }
          } catch {
            // Not JSON, might be raw text
          }
        }

        return messages.join("");
      }

      if (data && typeof data === "object") {
        if (data.completion) return data.completion;
        if (data.content) {
          if (Array.isArray(data.content)) {
            return data.content.map((b) => b.text || "").join("");
          }
          return data.content;
        }
      }
    } catch (e) {
      console.debug("[Musing API] Failed to extract Claude data:", e);
    }
    return null;
  }

  /**
   * Extract conversation text from ChatGPT API response
   */
  function extractChatGPTData(data) {
    try {
      if (typeof data === "string") {
        // ChatGPT uses SSE format: data: {json}\n\n
        const lines = data.split("\n").filter((line) => line.startsWith("data: "));
        const messages = [];

        for (const line of lines) {
          const jsonStr = line.slice(6); // Remove "data: " prefix
          if (jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.message?.content?.parts) {
              messages.push(...parsed.message.content.parts);
            }
          } catch {
            // Not valid JSON
          }
        }

        return messages.join("");
      }

      if (data && typeof data === "object") {
        if (data.message?.content?.parts) {
          return data.message.content.parts.join("");
        }
      }
    } catch (e) {
      console.debug("[Musing API] Failed to extract ChatGPT data:", e);
    }
    return null;
  }

  /**
   * Extract conversation text from Gemini API response
   */
  function extractGeminiData(data) {
    try {
      if (typeof data === "string") {
        // Gemini uses a complex batch response format; scan a bounded slice
        // for "text" values, handling escaped quotes and JSON escapes.
        const bounded = data.slice(0, MAX_CAPTURE_CHARS);
        const parts = [];
        const re = /"text":"((?:[^"\\]|\\.)*)"/g;
        let match;
        while ((match = re.exec(bounded)) !== null && parts.length < 200) {
          try {
            parts.push(JSON.parse('"' + match[1] + '"'));
          } catch {
            parts.push(match[1]);
          }
        }
        if (parts.length > 0) {
          return parts.join(" ");
        }
      }

      if (data && typeof data === "object") {
        // Try common Gemini response structures
        if (data.candidates?.[0]?.content?.parts) {
          return data.candidates[0].content.parts.map((p) => p.text || "").join("");
        }
      }
    } catch (e) {
      console.debug("[Musing API] Failed to extract Gemini data:", e);
    }
    return null;
  }

  /**
   * Process captured API response
   */
  function processCapturedData(data, platform) {
    let text = null;

    switch (platform) {
      case "claude":
        text = extractClaudeData(data);
        break;
      case "chatgpt":
        text = extractChatGPTData(data);
        break;
      case "gemini":
        text = extractGeminiData(data);
        break;
    }

    if (text && text.length > 20) {
      window.postMessage(
        {
          type: MUSING_MESSAGE_TYPE,
          nonce: NONCE,
          platform,
          text: text.slice(0, MAX_CAPTURE_CHARS),
          timestamp: Date.now(),
          source: "api",
        },
        window.location.origin
      );
    }
  }

  /**
   * Read a response body incrementally, capped at MAX_CAPTURE_CHARS.
   * Bounds memory on SSE streams and still yields the accumulated text
   * when the stream is aborted mid-generation.
   */
  async function readCapped(response) {
    if (!response.body) {
      const text = await response.text();
      return text.slice(0, MAX_CAPTURE_CHARS);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    try {
      while (text.length < MAX_CAPTURE_CHARS) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
    } catch {
      // Aborted stream: keep what already arrived
    } finally {
      reader.cancel().catch(() => {});
    }
    return text.slice(0, MAX_CAPTURE_CHARS);
  }

  /**
   * Wrap fetch to intercept responses
   */
  function wrapFetch(platform) {
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);

      if (isConversationEndpoint(args[0], platform)) {
        try {
          const clone = response.clone();
          const contentType = clone.headers.get("content-type") || "";

          readCapped(clone)
            .then((text) => {
              if (!text) return;
              if (contentType.includes("application/json")) {
                try {
                  processCapturedData(JSON.parse(text), platform);
                  return;
                } catch {
                  // Truncated or invalid JSON: fall through to text handling
                }
              }
              processCapturedData(text, platform);
            })
            .catch(() => {});
        } catch (e) {
          console.debug("[Musing API] Failed to process fetch response:", e);
        }
      }

      return response;
    };
  }

  /**
   * Wrap XMLHttpRequest to intercept responses
   */
  function wrapXHR(platform) {
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._musingUrl = url;
      return originalXHROpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      if (isConversationEndpoint(this._musingUrl, platform)) {
        this.addEventListener("load", function () {
          try {
            const contentType = this.getResponseHeader("content-type") || "";
            let data = (this.responseText || "").slice(0, MAX_CAPTURE_CHARS);

            if (contentType.includes("application/json")) {
              try {
                data = JSON.parse(data);
              } catch {
                // Keep as text
              }
            }

            processCapturedData(data, platform);
          } catch (e) {
            console.debug("[Musing API] Failed to process XHR response:", e);
          }
        });
      }

      return originalXHRSend.apply(this, args);
    };
  }

  // Initialize
  const platform = detectPlatform();

  if (platform) {
    console.log("[Musing API] Interceptor initialized for", platform);
    wrapFetch(platform);
    wrapXHR(platform);
  }
})();
