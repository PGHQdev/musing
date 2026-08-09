/**
 * Claude.ai capture config — shared logic lives in capture-core.js
 */

(function () {
  "use strict";

  MusingCapture.init({
    platform: "claude",
    settingsKey: "enableClaude",
    messageSelectors: [
      "[data-testid='user-message']",
      "[data-testid='assistant-message']",
      ".font-user-message",
      ".font-claude-message",
      "[class*='ConversationTurn']",
    ],
    fallbackSelectors: ["main"],
    // href*= so project chats (/project/.../chat/...) are included
    sidebarSelectors: [
      "nav [data-testid='conversation-list'] a",
      "nav a[href*='/chat/']",
      "[class*='sidebar'] a[href*='/chat/']",
      "[class*='ConversationList'] a",
      "aside a[href*='/chat/']",
    ],
    observerRootSelectors: [
      "[data-testid='user-message']",
      "[data-testid='assistant-message']",
      ".font-user-message",
      ".font-claude-message",
      "[class*='ConversationTurn']",
      "main",
    ],
    noisePatterns: [
      /^(New chat|Recents|Starred|Projects|Settings)$/i,
      /^(Claude|Upgrade|Pro|Free)$/i,
      /^(Start a new chat|How can I help|What would you like)$/i,
      /^(Copy|Retry|Edit|Good response|Bad response)$/i,
    ],
  });
})();
