/**
 * Google Gemini (gemini.google.com) capture config — shared logic lives in capture-core.js
 */

(function () {
  "use strict";

  MusingCapture.init({
    platform: "gemini",
    settingsKey: "enableGemini",
    // Gemini renders Angular custom elements (user-query / model-response),
    // not ChatGPT's data-message-author-role attributes.
    messageSelectors: [
      "user-query",
      "model-response",
      ".query-text",
      ".model-response-text",
      "[class*='message-content']",
      "[class*='conversation-turn']",
    ],
    fallbackSelectors: ["main", "[role='main']", "[class*='conversation']"],
    sidebarSelectors: [
      "conversations-list .conversation-title",
      ".conversation-title",
      "nav a[href*='/app/']",
      "[class*='recent-chats'] a",
    ],
    observerRootSelectors: [
      "chat-window",
      "user-query",
      "model-response",
      "[class*='conversation-turn']",
      "main",
    ],
    noisePatterns: [
      /^(New chat|Upgrade|My stuff|Gems|Chats|Settings and help)$/i,
      /^(Conversation with Gemini|Hi \w+|Where should we start\?)$/i,
      /^(Create image|Write anything|Help me learn|Boost my day)$/i,
      /^(Tools|Fast|Show more|Show less|Copy|Share|Edit)$/i,
    ],
  });
})();
