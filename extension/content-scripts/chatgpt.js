/**
 * ChatGPT (chatgpt.com) capture config — shared logic lives in capture-core.js
 */

(function () {
  "use strict";

  MusingCapture.init({
    platform: "chatgpt",
    settingsKey: "enableChatGPT",
    // .markdown dropped: it also matches the composer preview and sidebar
    messageSelectors: [
      "[data-message-author-role='user']",
      "[data-message-author-role='assistant']",
      "[class*='agent-turn']",
      "[class*='user-turn']",
      "[class*='ConversationItem']",
    ],
    fallbackSelectors: ["[class*='thread']", "main"],
    sidebarSelectors: [
      "nav a[href^='/c/']",
      "[class*='sidebar'] a[href^='/c/']",
      "[class*='ConversationList'] a",
      "nav ol li a",
    ],
    observerRootSelectors: [
      "[data-message-author-role='user']",
      "[data-message-author-role='assistant']",
      "[class*='agent-turn']",
      "[class*='user-turn']",
      "[class*='thread']",
      "main",
    ],
    noisePatterns: [
      /^(New chat|ChatGPT|GPT-4|GPT-4o|Upgrade|Plus|Pro|Team)$/i,
      /^(Explore GPTs|My GPTs|Create|Customize ChatGPT)$/i,
      /^(Send a message|Message ChatGPT|How can I help)$/i,
      /^(Copy|Regenerate|Edit|Good response|Bad response|Share)$/i,
      /^(Temporary|Memory|Archived)$/i,
    ],
  });
})();
